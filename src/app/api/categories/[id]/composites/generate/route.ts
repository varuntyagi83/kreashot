import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { generateComposite } from '@/lib/ai/gemini'
import { getFormatDimensions, FORMATS } from '@/lib/formats'
import { downloadFile } from '@/lib/storage'
import { sanitizeForPrompt } from '@/lib/ai/sanitize'
import sharp from 'sharp'
import { spawn } from 'child_process'
import path from 'path'
import { readFile, unlink } from 'fs/promises'
import crypto from 'crypto'

// Image generation can be slow; allow up to 5 min if ever run on a platform that
// enforces function timeouts (no effect on Railway's long-running server).
export const maxDuration = 300

const GEMINI_INPUT_MAX_PX = 1536

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp'
  return 'image/jpeg'
}

async function downscaleForGemini(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata()
  const w = metadata.width || 0
  const h = metadata.height || 0
  if (w <= GEMINI_INPUT_MAX_PX && h <= GEMINI_INPUT_MAX_PX) {
    return buffer
  }
  console.log(`  Downscaling ${w}x${h} for Gemini input`)
  return sharp(buffer)
    .resize(GEMINI_INPUT_MAX_PX, GEMINI_INPUT_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
}

/**
 * POST /api/categories/[id]/composites/generate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId } = await params

    const rateLimit = await checkRateLimit(`composites:${companyId}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true, slug: true, lookAndFeel: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      mode = 'selected',
      pairs = [],
      userPrompt,
      format = '1:1',
      superimpose = false,
    } = body

    if (Array.isArray(pairs) && pairs.length > 20) {
      return NextResponse.json({ error: 'Too many pairs. Maximum 20 allowed per request.' }, { status: 400 })
    }
    if (userPrompt && typeof userPrompt === 'string' && userPrompt.length > 5000) {
      return NextResponse.json({ error: 'userPrompt must be 5000 characters or fewer' }, { status: 400 })
    }

    const safeUserPrompt = userPrompt ? sanitizeForPrompt(userPrompt) : undefined

    if (format && !Object.keys(FORMATS).includes(format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${Object.keys(FORMATS).join(', ')}` }, { status: 400 })
    }

    const formatDimensions = getFormatDimensions(format)
    console.log(`Generating composites for format: ${format} (${formatDimensions.width}x${formatDimensions.height})`)

    // Fetch template for safe zones
    const template = await prisma.template.findFirst({
      where: { categoryId, format },
      select: { id: true, name: true, format: true, metadata: true },
    })

    let safeZones: any[] = []
    if (template?.metadata) {
      safeZones = (template.metadata as any)?.safe_zones || []
    }

    if (mode !== 'all_combinations' && mode !== 'selected') {
      return NextResponse.json({ error: 'mode must be either "all_combinations" or "selected"' }, { status: 400 })
    }
    if (mode === 'selected' && (!pairs || pairs.length === 0)) {
      return NextResponse.json({ error: 'pairs array is required for selected mode' }, { status: 400 })
    }

    let compositionPairs: Array<{ angledShotId: string; backgroundId: string }> = []

    if (mode === 'all_combinations') {
      const [angledShots, backgrounds] = await Promise.all([
        prisma.angledShot.findMany({
          where: { categoryId, format },
          select: { id: true },
        }),
        prisma.background.findMany({
          where: { categoryId, format },
          select: { id: true },
        }),
      ])

      if (!angledShots.length) {
        return NextResponse.json(
          { error: `No ${format} angled shots found for this category. Generate angled shots for this format first.` },
          { status: 400 }
        )
      }
      if (!backgrounds.length) {
        return NextResponse.json(
          { error: `No ${format} backgrounds found for this category. Generate backgrounds for this format first.` },
          { status: 400 }
        )
      }

      for (const shot of angledShots) {
        for (const bg of backgrounds) {
          compositionPairs.push({ angledShotId: shot.id, backgroundId: bg.id })
        }
      }
    } else {
      compositionPairs = pairs.map((p: any) => ({
        angledShotId: p.angledShotId || p.angled_shot_id,
        backgroundId: p.backgroundId || p.background_id,
      }))
    }

    if (compositionPairs.length > 10) {
      return NextResponse.json(
        {
          error: `Too many composites requested (${compositionPairs.length}). Maximum is 10 per batch.`,
          total_combinations: compositionPairs.length,
        },
        { status: 400 }
      )
    }

    const planCheck = await checkPlanLimit(companyId, 'composite', compositionPairs.length)
    if (!planCheck.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached for your plan (${planCheck.used}/${planCheck.limit} composites today). Upgrade to generate more.` },
        { status: 402 }
      )
    }

    const results = []
    const errors: string[] = []

    for (const pair of compositionPairs) {
      try {
        const [angledShot, background] = await Promise.all([
          prisma.angledShot.findFirst({
            where: { id: pair.angledShotId, categoryId },
            select: { id: true, displayName: true, angleName: true, storageProvider: true, storageUrl: true, storagePath: true, gdriveFileId: true },
          }),
          prisma.background.findFirst({
            where: { id: pair.backgroundId, categoryId },
            select: { id: true, name: true, storageProvider: true, storageUrl: true, storagePath: true, gdriveFileId: true },
          }),
        ])

        if (!angledShot) {
          errors.push(`Angled shot not found for pair ${compositionPairs.indexOf(pair) + 1}`)
          continue
        }
        if (!background) {
          errors.push(`Background not found for pair ${compositionPairs.indexOf(pair) + 1}`)
          continue
        }

        // Download angled shot
        let angledShotBuffer: Buffer | null = null
        if (angledShot.storageProvider === 'gdrive') {
          const key = angledShot.gdriveFileId || angledShot.storagePath
          if (key) angledShotBuffer = await downloadFile(key, { provider: 'gdrive' }).catch(() => null)
        } else if (angledShot.storageProvider === 'gcs' && angledShot.storagePath) {
          angledShotBuffer = await downloadFile(angledShot.storagePath, { provider: 'gcs' }).catch(() => null)
        }

        if (!angledShotBuffer) {
          errors.push(`Failed to download angled shot "${angledShot.displayName}"`)
          continue
        }

        // Download background
        let backgroundBuffer: Buffer | null = null
        if (background.storageProvider === 'gdrive') {
          const key = background.gdriveFileId || background.storagePath
          if (key) backgroundBuffer = await downloadFile(key, { provider: 'gdrive' }).catch(() => null)
        } else if (background.storageProvider === 'gcs' && background.storagePath) {
          backgroundBuffer = await downloadFile(background.storagePath, { provider: 'gcs' }).catch(() => null)
        }

        if (!backgroundBuffer) {
          errors.push(`Failed to download background "${background.name}"`)
          continue
        }

        if (superimpose) {
          const outputPath = `/tmp/composite_superimpose_${crypto.randomUUID()}.png`
          const scriptPath = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')
          const inputData = JSON.stringify({
            mode: 'superimpose',
            background_url: background.storageUrl,
            product_url: angledShot.storageUrl,
            output_path: outputPath,
            width: formatDimensions.width,
            height: formatDimensions.height,
          })
          try {
            const PYTHON_TIMEOUT_MS = 120_000
            let proc: ReturnType<typeof spawn>
            const outPath = await Promise.race([
              new Promise<string>((resolve, reject) => {
                proc = spawn('python3', [scriptPath])
                let stderr = ''
                proc.stderr?.on('data', (d) => { stderr += d.toString() })
                proc.stdin?.write(inputData)
                proc.stdin?.end()
                proc.on('close', (code) => {
                  if (code !== 0) reject(new Error(stderr || 'Python script failed'))
                  else resolve(outputPath)
                })
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => {
                  proc.kill('SIGKILL')
                  reject(new Error('Superimpose timed out'))
                }, PYTHON_TIMEOUT_MS)
              ),
            ])
            const buf = await readFile(outPath)
            await unlink(outPath).catch(() => {})
            results.push({
              angledShotId: pair.angledShotId,
              angledShotName: angledShot.displayName,
              backgroundId: pair.backgroundId,
              backgroundName: background.name,
              image_base64: buf.toString('base64'),
              image_mime_type: 'image/png',
              prompt_used: 'Superimposed (background removed from product)',
            })
          } catch (err) {
            const pairLabel = `pair ${compositionPairs.indexOf(pair) + 1}`
            console.error(`Superimpose failed for ${pairLabel}:`, err)
            errors.push(`Superimpose failed for ${pairLabel}`)
          }
          continue
        }

        const angledShotResized = await downscaleForGemini(angledShotBuffer)
        const backgroundResized = await downscaleForGemini(backgroundBuffer)

        const angledShotBase64 = angledShotResized.toString('base64')
        const angledShotMimeType = detectMimeType(angledShotResized)

        const backgroundBase64 = backgroundResized.toString('base64')
        const backgroundMimeType = detectMimeType(backgroundResized)

        const compositeStartMs = Date.now()
        const composite = await generateComposite(
          `data:${angledShotMimeType};base64,${angledShotBase64}`,
          angledShotMimeType,
          `data:${backgroundMimeType};base64,${backgroundBase64}`,
          backgroundMimeType,
          safeUserPrompt,
          category.lookAndFeel || undefined,
          safeZones.length > 0 ? safeZones : undefined,
          formatDimensions.width,
          formatDimensions.height
        )
        const compositeGenMs = Date.now() - compositeStartMs

        results.push({
          angledShotId: pair.angledShotId,
          angledShotName: angledShot.displayName,
          backgroundId: pair.backgroundId,
          backgroundName: background.name,
          image_base64: composite.imageData,
          image_mime_type: composite.mimeType,
          prompt_used: composite.promptUsed,
          generationTimeMs: compositeGenMs,
        })

        console.log(`   Composite ${results.length}/${compositionPairs.length} generated`)
      } catch (error) {
        const pairLabel = `pair ${compositionPairs.indexOf(pair) + 1}`
        console.error(`Generation failed for ${pairLabel}:`, error)
        errors.push(`Generation failed for ${pairLabel}`)
      }
    }

    return NextResponse.json({
      message: results.length > 0
        ? `Generated ${results.length} ${format} composites`
        : `Failed to generate composites: ${errors[0] || 'unknown error'}`,
      category: { id: category.id, name: category.name, slug: category.slug },
      format,
      dimensions: formatDimensions,
      total_combinations: compositionPairs.length,
      results,
      ...(errors.length > 0 && { errors }),
    })
  } catch (error) {
    console.error('Error generating composites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
