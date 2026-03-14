import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateComposite } from '@/lib/ai/gemini'
import { getFormatDimensions, FORMATS } from '@/lib/formats'
import { downloadFile } from '@/lib/storage'
import { sanitizeForPrompt } from '@/lib/ai/sanitize'
import sharp from 'sharp'
import { spawn } from 'child_process'
import path from 'path'
import { readFile, unlink } from 'fs/promises'
import crypto from 'crypto'

const GEMINI_INPUT_MAX_PX = 1536 // Max dimension for Gemini input images (output is still 4K)

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp'
  return 'image/jpeg' // JPEG default (covers FF D8 FF and unknown formats)
}

/** Downscale image buffer if it exceeds GEMINI_INPUT_MAX_PX on any side. Returns JPEG buffer. */
async function downscaleForGemini(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata()
  const w = metadata.width || 0
  const h = metadata.height || 0
  if (w <= GEMINI_INPUT_MAX_PX && h <= GEMINI_INPUT_MAX_PX) {
    return buffer // Already small enough
  }
  console.log(`  Downscaling ${w}x${h} → max ${GEMINI_INPUT_MAX_PX}px for Gemini input`)
  return sharp(buffer)
    .resize(GEMINI_INPUT_MAX_PX, GEMINI_INPUT_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
}

/**
 * POST /api/categories/[id]/composites/generate
 * Generates AI composites by combining angled shots with backgrounds
 * Phase 4: Format-aware composite generation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(`composites:${user.id}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    // Verify category belongs to user
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get request body
    const body = await request.json()
    const {
      mode = 'selected',
      pairs = [],
      userPrompt,
      format = '1:1',
      superimpose = false, // If true: remove product bg and paste on background (no AI merge)
    } = body

    if (Array.isArray(pairs) && pairs.length > 20) {
      return NextResponse.json({ error: 'Too many pairs. Maximum 20 allowed per request.' }, { status: 400 })
    }

    if (userPrompt && typeof userPrompt === 'string' && userPrompt.length > 20000) {
      return NextResponse.json({ error: 'userPrompt must be 20000 characters or fewer' }, { status: 400 })
    }

    const safeUserPrompt = userPrompt ? sanitizeForPrompt(userPrompt) : undefined

    // Validate format
    if (format && !Object.keys(FORMATS).includes(format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${Object.keys(FORMATS).join(', ')}` }, { status: 400 })
    }

    // Validate format
    const formatDimensions = getFormatDimensions(format)
    console.log(`Generating composites for format: ${format} (${formatDimensions.width}x${formatDimensions.height})`)

    // Fetch template for this category + format (to get safe zones)
    const { data: template } = await supabase
      .from('templates')
      .select('id, name, format, template_data')
      .eq('category_id', categoryId)
      .eq('format', format) // NEW: Filter by format
      .single()

    // Extract safe zones from template so composites respect layout. Define clear safe zones in the template:
    // - At least one zone with type "safe" and name containing "product" (product placement zone).
    // - Optional zones with type "restricted" (no product placement there). See docs/TEMPLATE_SAFE_ZONES.md.
    let safeZones: any[] = []
    if (template && template.template_data) {
      safeZones = template.template_data.safe_zones || []
      console.log(`Found ${safeZones.length} safe zones in ${format} template: ${template.name}`)
    } else {
      console.log(`No ${format} template found for category, composites will be generated without safe zone constraints`)
    }

    // Validation
    if (mode !== 'all_combinations' && mode !== 'selected') {
      return NextResponse.json(
        { error: 'mode must be either "all_combinations" or "selected"' },
        { status: 400 }
      )
    }

    if (mode === 'selected' && (!pairs || pairs.length === 0)) {
      return NextResponse.json(
        { error: 'pairs array is required for selected mode' },
        { status: 400 }
      )
    }

    // Build the list of pairs to generate
    let compositionPairs: Array<{
      angledShotId: string
      backgroundId: string
    }> = []

    if (mode === 'all_combinations') {
      // Fetch all angled shots for this category + format
      const { data: angledShots } = await supabase
        .from('angled_shots')
        .select('id')
        .eq('category_id', categoryId)
        .eq('format', format) // NEW: Filter by format

      // Fetch all backgrounds for this category + format
      const { data: backgrounds } = await supabase
        .from('backgrounds')
        .select('id')
        .eq('category_id', categoryId)
        .eq('format', format) // NEW: Filter by format

      if (!angledShots || angledShots.length === 0) {
        return NextResponse.json(
          { error: `No ${format} angled shots found for this category. Generate angled shots for this format first.` },
          { status: 400 }
        )
      }

      if (!backgrounds || backgrounds.length === 0) {
        return NextResponse.json(
          { error: `No ${format} backgrounds found for this category. Generate backgrounds for this format first.` },
          { status: 400 }
        )
      }

      // Generate cartesian product
      for (const shot of angledShots) {
        for (const bg of backgrounds) {
          compositionPairs.push({
            angledShotId: shot.id,
            backgroundId: bg.id,
          })
        }
      }

      console.log(
        `All combinations mode (${format}): ${angledShots.length} shots × ${backgrounds.length} backgrounds = ${compositionPairs.length} composites`
      )
    } else {
      // Selected mode - use provided pairs
      compositionPairs = pairs.map((p: any) => ({
        angledShotId: p.angledShotId || p.angled_shot_id,
        backgroundId: p.backgroundId || p.background_id,
      }))

      console.log(`Selected mode: ${compositionPairs.length} pairs`)
    }

    // Limit to prevent excessive generation and memory issues
    if (compositionPairs.length > 10) {
      return NextResponse.json(
        {
          error: `Too many composites requested (${compositionPairs.length}). Maximum is 10 per batch. Use batch processing or reduce selection.`,
          total_combinations: compositionPairs.length,
        },
        { status: 400 }
      )
    }

    // Generate composites for each pair
    const results = []
    const errors: string[] = []

    for (const pair of compositionPairs) {
      try {
        console.log(
          `Generating composite: shot ${pair.angledShotId} + bg ${pair.backgroundId}...`
        )

        // Fetch angled shot (column is display_name, not name)
        const { data: angledShot, error: shotError } = await supabase
          .from('angled_shots')
          .select('id, display_name, angle_name, storage_provider, storage_url, storage_path, gdrive_file_id')
          .eq('id', pair.angledShotId)
          .eq('category_id', categoryId)
          .single()

        if (shotError || !angledShot) {
          const msg = `Angled shot ${pair.angledShotId} not found in database: ${shotError?.message || 'no data'}`
          console.warn(msg)
          errors.push(msg)
          continue
        }

        // Fetch background
        const { data: background, error: bgError } = await supabase
          .from('backgrounds')
          .select('id, name, storage_provider, storage_url, storage_path, gdrive_file_id')
          .eq('id', pair.backgroundId)
          .eq('category_id', categoryId)
          .single()

        if (bgError || !background) {
          const msg = `Background ${pair.backgroundId} not found in database: ${bgError?.message || 'no data'}`
          console.warn(msg)
          errors.push(msg)
          continue
        }

        // Download angled shot image — prefer gdrive_file_id for direct download (1 API call)
        let angledShotBuffer: Buffer | null = null

        if (angledShot.storage_provider === 'gdrive') {
          const gdriveKey = angledShot.gdrive_file_id || angledShot.storage_path
          if (gdriveKey) {
            try {
              console.log(`  Downloading angled shot via gdrive (key: ${gdriveKey.substring(0, 20)}...)`)
              angledShotBuffer = await downloadFile(gdriveKey, { provider: 'gdrive' })
            } catch (dlError) {
              const msg = `Failed to download angled shot "${angledShot.display_name}" from Google Drive: ${dlError}`
              console.warn(msg)
              errors.push(msg)
            }
          } else {
            const msg = `Angled shot "${angledShot.display_name}" has no gdrive_file_id or storage_path`
            console.warn(msg)
            errors.push(msg)
          }
        } else {
          const { data, error } = await supabase.storage
            .from('angled-shots')
            .download(angledShot.storage_path)

          if (!error && data) {
            const arrayBuffer = await data.arrayBuffer()
            angledShotBuffer = Buffer.from(arrayBuffer)
          } else {
            const msg = `Failed to download angled shot "${angledShot.display_name}" from Supabase: ${error?.message}`
            console.warn(msg)
            errors.push(msg)
          }
        }

        if (!angledShotBuffer) {
          continue
        }

        // Download background image — prefer gdrive_file_id for direct download (1 API call)
        let backgroundBuffer: Buffer | null = null

        if (background.storage_provider === 'gdrive') {
          const gdriveKey = background.gdrive_file_id || background.storage_path
          if (gdriveKey) {
            try {
              console.log(`  Downloading background via gdrive (key: ${gdriveKey.substring(0, 20)}...)`)
              backgroundBuffer = await downloadFile(gdriveKey, { provider: 'gdrive' })
            } catch (dlError) {
              const msg = `Failed to download background "${background.name}" from Google Drive: ${dlError}`
              console.warn(msg)
              errors.push(msg)
            }
          } else {
            const msg = `Background "${background.name}" has no gdrive_file_id or storage_path`
            console.warn(msg)
            errors.push(msg)
          }
        } else {
          const { data, error } = await supabase.storage
            .from('backgrounds')
            .download(background.storage_path)

          if (!error && data) {
            const arrayBuffer = await data.arrayBuffer()
            backgroundBuffer = Buffer.from(arrayBuffer)
          } else {
            const msg = `Failed to download background "${background.name}" from Supabase: ${error?.message}`
            console.warn(msg)
            errors.push(msg)
          }
        }

        if (!backgroundBuffer) {
          continue
        }

        if (superimpose) {
          // Remove product background and paste on scene (no AI merge) via Python script
          const outputPath = `/tmp/composite_superimpose_${crypto.randomUUID()}.png`
          const scriptPath = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')
          const inputData = JSON.stringify({
            mode: 'superimpose',
            background_url: background.storage_url,
            product_url: angledShot.storage_url,
            output_path: outputPath,
            width: formatDimensions.width,
            height: formatDimensions.height,
          })
          try {
            const outPath = await new Promise<string>((resolve, reject) => {
              const proc = spawn('python3', [scriptPath])
              let stderr = ''
              proc.stderr?.on('data', (d) => { stderr += d.toString() })
              proc.stdin?.write(inputData)
              proc.stdin?.end()
              proc.on('close', (code) => {
                if (code !== 0) reject(new Error(stderr || 'Python script failed'))
                else resolve(outputPath)
              })
            })
            const buf = await readFile(outPath)
            await unlink(outPath).catch(() => {})
            results.push({
              angledShotId: pair.angledShotId,
              angledShotName: angledShot.display_name,
              backgroundId: pair.backgroundId,
              backgroundName: background.name,
              image_base64: buf.toString('base64'),
              image_mime_type: 'image/png',
              prompt_used: 'Superimposed (background removed from product)',
            })
            console.log(`   ✅ Superimpose ${results.length}/${compositionPairs.length} generated`)
          } catch (err) {
            const msg = `Superimpose failed: ${err instanceof Error ? err.message : err}`
            console.error(msg)
            errors.push(msg)
          }
          continue
        }

        // Downscale input images to reduce Gemini payload (output is still 4K)
        const angledShotResized = await downscaleForGemini(angledShotBuffer)
        const backgroundResized = await downscaleForGemini(backgroundBuffer)

        // Convert to base64 with actual MIME type detection from magic bytes
        const angledShotBase64 = angledShotResized.toString('base64')
        const angledShotMimeType = detectMimeType(angledShotResized)

        const backgroundBase64 = backgroundResized.toString('base64')
        const backgroundMimeType = detectMimeType(backgroundResized)

        // Generate composite using Gemini (with template safe zones if available)
        const composite = await generateComposite(
          `data:${angledShotMimeType};base64,${angledShotBase64}`,
          angledShotMimeType,
          `data:${backgroundMimeType};base64,${backgroundBase64}`,
          backgroundMimeType,
          safeUserPrompt,
          category.look_and_feel || undefined,
          safeZones.length > 0 ? safeZones : undefined,
          formatDimensions.width,
          formatDimensions.height
        )

        results.push({
          angledShotId: pair.angledShotId,
          angledShotName: angledShot.display_name,
          backgroundId: pair.backgroundId,
          backgroundName: background.name,
          image_base64: composite.imageData,
          image_mime_type: composite.mimeType,
          prompt_used: composite.promptUsed,
        })

        console.log(
          `   ✅ Composite ${results.length}/${compositionPairs.length} generated`
        )
      } catch (error) {
        const msg = `Gemini generation failed for pair ${pair.angledShotId} + ${pair.backgroundId}: ${error instanceof Error ? error.message : error}`
        console.error(msg)
        errors.push(msg)
        // Continue with next pair instead of failing entire batch
      }
    }

    return NextResponse.json({
      message: results.length > 0
        ? `Generated ${results.length} ${format} composites`
        : `Failed to generate composites: ${errors[0] || 'unknown error'}`,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      format,
      dimensions: formatDimensions,
      total_combinations: compositionPairs.length,
      results,
      ...(errors.length > 0 && { errors }),
    })
  } catch (error) {
    console.error('Error generating composites:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
