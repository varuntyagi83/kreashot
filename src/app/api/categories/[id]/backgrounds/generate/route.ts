import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { generateBackgrounds } from '@/lib/ai/gemini'
import { generateBackgroundsWithReplicate, REPLICATE_FORMATS } from '@/lib/ai/replicate'
import { getFormatDimensions, FORMATS } from '@/lib/formats'
import { downloadFile } from '@/lib/storage'
import { parseReferenceTokens } from '@/lib/references'
import { sanitizeForPrompt } from '@/lib/ai/sanitize'

// Image generation can be slow; allow up to 5 min if ever run on a platform that
// enforces function timeouts (no effect on Railway's long-running server).
export const maxDuration = 300

/**
 * POST /api/categories/[id]/backgrounds/generate
 * Generates AI backgrounds matching the category's look & feel
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId } = await params

    if (!categoryId || categoryId === 'undefined' || categoryId === 'null') {
      return NextResponse.json(
        { error: 'Invalid category. Make sure you are on a category page (e.g. /categories/...) and refresh if needed.' },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit(`backgrounds:${user.id}`, 10, 60_000)
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
      prompt,
      userPrompt,
      lookAndFeel,
      count = 1,
      referenceAssetIds,
      formats,
      format = '1:1',
      colorWorld,
    } = body

    if (format && !Object.keys(FORMATS).includes(format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${Object.keys(FORMATS).join(', ')}` }, { status: 400 })
    }

    if (referenceAssetIds && (!Array.isArray(referenceAssetIds) || referenceAssetIds.length > 10)) {
      return NextResponse.json({ error: 'referenceAssetIds must be an array of up to 10 IDs' }, { status: 400 })
    }

    const resolvedPrompt = prompt || userPrompt

    const validFormatKeys = Object.keys(FORMATS)
    const formatsToGenerate: string[] = (formats && Array.isArray(formats) && formats.length > 0)
      ? formats.filter((f: string) => validFormatKeys.includes(f))
      : [validFormatKeys.includes(format) ? format : '1:1']

    if (!resolvedPrompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }
    if (typeof resolvedPrompt === 'string' && resolvedPrompt.length > 5000) {
      return NextResponse.json({ error: 'prompt must be 5000 characters or fewer' }, { status: 400 })
    }
    if (lookAndFeel && typeof lookAndFeel === 'string' && lookAndFeel.length > 10000) {
      return NextResponse.json({ error: 'lookAndFeel must be 10000 characters or fewer' }, { status: 400 })
    }
    if (count < 1 || count > 5) {
      return NextResponse.json({ error: 'count must be between 1 and 5' }, { status: 400 })
    }

    const totalGenerations = count * formatsToGenerate.length
    if (totalGenerations > 20) {
      return NextResponse.json(
        { error: `Too many generations (${totalGenerations}). Reduce count or number of formats (max 20 total).` },
        { status: 400 }
      )
    }

    const planCheck = await checkPlanLimit(companyId, 'background', totalGenerations)
    if (!planCheck.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached for your plan (${planCheck.used}/${planCheck.limit} backgrounds today). Upgrade to generate more.` },
        { status: 402 }
      )
    }

    const { cleanText: rawCleanPrompt, references: promptRefs } = parseReferenceTokens(resolvedPrompt)
    const { cleanText: rawCleanLookAndFeel, references: lafRefs } = parseReferenceTokens(
      (lookAndFeel && lookAndFeel.trim()) || ''
    )

    const cleanPrompt = sanitizeForPrompt(rawCleanPrompt)
    const cleanLookAndFeel = sanitizeForPrompt(rawCleanLookAndFeel)

    const allRefs = [...promptRefs, ...lafRefs]
    const guidelineRefs = allRefs.filter(r => r.type === 'guideline')
    const uniqueGuidelineIds = [...new Set(guidelineRefs.map(r => r.id))]

    let resolvedGuidelinesText = ''
    let resolvedColorDescription = ''

    if (uniqueGuidelineIds.length > 0) {
      const guidelines = await prisma.brandGuideline.findMany({
        where: { id: { in: uniqueGuidelineIds }, companyId },
        select: { id: true, name: true, extractedText: true, colorDescription: true },
        take: 5,
      })

      if (guidelines.length) {
        resolvedGuidelinesText = guidelines
          .map(g => `--- ${g.name} ---\n${g.extractedText}`)
          .join('\n\n')
        resolvedColorDescription = guidelines
          .map(g => g.colorDescription)
          .filter(Boolean)
          .join('\n\n')
      }
    }

    if (colorWorld && !resolvedColorDescription) {
      const allGuidelines = await prisma.brandGuideline.findMany({
        where: { companyId },
        select: { colorDescription: true },
        take: 3,
      })

      if (allGuidelines.length) {
        resolvedColorDescription = allGuidelines
          .map(g => g.colorDescription)
          .filter(Boolean)
          .join('\n\n')
      }
    }

    if (colorWorld && resolvedColorDescription) {
      const lines = resolvedColorDescription.split('\n').filter(l => l.trim())
      const worldLower = colorWorld.toLowerCase()
      const filtered = lines.filter(line => {
        const lower = line.toLowerCase()
        if (lower.includes(worldLower)) return true
        if (lower.includes('lighting') || lower.includes('mood')) return true
        return false
      })
      resolvedColorDescription = filtered.join('\n')
    }

    const finalGuidelines = [resolvedGuidelinesText]
      .filter(Boolean).join('\n\n').substring(0, 24000) || undefined

    const resolvedLookAndFeel = cleanLookAndFeel || category.lookAndFeel

    if (!resolvedLookAndFeel) {
      return NextResponse.json(
        { error: 'Category must have a look_and_feel description. Please edit the category and add one.' },
        { status: 400 }
      )
    }

    // Get reference assets if provided
    let styleReferenceImages: Array<{ data: string; mimeType: string }> = []

    if (referenceAssetIds && referenceAssetIds.length > 0) {
      const [productImages, angledShots, brandAssets] = await Promise.all([
        prisma.productImage.findMany({
          where: { companyId, id: { in: referenceAssetIds } },
          select: { id: true, metadata: true, storageProvider: true, storageUrl: true, storagePath: true, gdriveFileId: true },
          take: 10,
        }),
        prisma.angledShot.findMany({
          where: { companyId, id: { in: referenceAssetIds } },
          select: { id: true, storagePath: true, storageProvider: true, storageUrl: true, gdriveFileId: true },
          take: 10,
        }),
        prisma.brandAsset.findMany({
          where: { companyId, id: { in: referenceAssetIds } },
          select: { id: true, storagePath: true, storageUrl: true, metadata: true },
          take: 10,
        }),
      ])

      for (const ref of productImages) {
        try {
          let imageBuffer: Buffer | null = null
          if (ref.storageProvider === 'gdrive') {
            const key = ref.gdriveFileId || ref.storagePath
            if (key) imageBuffer = await downloadFile(key, { provider: 'gdrive' }).catch(() => null)
          } else if (ref.storageProvider === 'gcs' && ref.storagePath) {
            imageBuffer = await downloadFile(ref.storagePath, { provider: 'gcs' }).catch(() => null)
          }
          if (imageBuffer) {
            const refMime = (ref.metadata as any)?.mimeType || 'image/jpeg'
            styleReferenceImages.push({
              data: `data:${refMime};base64,${imageBuffer.toString('base64')}`,
              mimeType: refMime,
            })
          }
        } catch (error) {
          console.error(`Failed to fetch reference asset ${ref.id}:`, error)
        }
      }

      for (const ref of angledShots) {
        try {
          let imageBuffer: Buffer | null = null
          if (ref.storageProvider === 'gdrive') {
            const key = ref.gdriveFileId || ref.storagePath
            if (key) imageBuffer = await downloadFile(key, { provider: 'gdrive' }).catch(() => null)
          } else if (ref.storageProvider === 'gcs' && ref.storagePath) {
            imageBuffer = await downloadFile(ref.storagePath, { provider: 'gcs' }).catch(() => null)
          }
          if (imageBuffer) {
            styleReferenceImages.push({
              data: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
              mimeType: 'image/jpeg',
            })
          }
        } catch (error) {
          console.error(`Failed to fetch angled shot reference ${ref.id}:`, error)
        }
      }
    }

    const allMappedBackgrounds: Array<{
      promptUsed: string
      imageData: string
      mimeType: string
      format: string
      generationTimeMs?: number
      image_base64: string
      image_mime_type: string
    }> = []

    const failedFormats: string[] = []

    for (let fi = 0; fi < formatsToGenerate.length; fi++) {
      const fmt = formatsToGenerate[fi]
      const fmtDimensions = getFormatDimensions(fmt)
      console.log(`  Generating ${count} ${fmt} backgrounds (${fmtDimensions.width}x${fmtDimensions.height})...`)

      if (fi > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      try {
        const fmtStartMs = Date.now()
        const generatedBackgrounds = REPLICATE_FORMATS.has(fmt)
          ? await generateBackgroundsWithReplicate(
              cleanPrompt,
              resolvedLookAndFeel,
              count,
              fmt,
              finalGuidelines
            )
          : await generateBackgrounds(
              cleanPrompt,
              resolvedLookAndFeel,
              count,
              styleReferenceImages.length > 0 ? styleReferenceImages : undefined,
              fmt,
              '4K',
              finalGuidelines,
              resolvedColorDescription || undefined
            )
        const perBgMs = Math.round((Date.now() - fmtStartMs) / (generatedBackgrounds.length || 1))

        for (const bg of generatedBackgrounds) {
          allMappedBackgrounds.push({
            promptUsed: bg.promptUsed,
            imageData: bg.imageData,
            mimeType: bg.mimeType,
            format: fmt,
            generationTimeMs: perBgMs,
            image_base64: bg.imageData,
            image_mime_type: bg.mimeType,
          })
        }
      } catch (fmtError) {
        console.error(`  Format ${fmt} failed:`, fmtError instanceof Error ? fmtError.message : fmtError)
        failedFormats.push(fmt)
      }
    }

    if (allMappedBackgrounds.length === 0) {
      return NextResponse.json(
        { error: `All format generations failed (${failedFormats.join(', ')}). Check server logs for details.` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: failedFormats.length > 0
        ? `Generated ${allMappedBackgrounds.length} background(s). Failed formats: ${failedFormats.join(', ')}`
        : `Generated ${allMappedBackgrounds.length} background variation(s) across ${formatsToGenerate.length} format(s)`,
      category: { id: category.id, name: category.name, slug: category.slug },
      backgrounds: allMappedBackgrounds,
      results: allMappedBackgrounds,
      failedFormats: failedFormats.length > 0 ? failedFormats : undefined,
    })
  } catch (error) {
    console.error('Error generating backgrounds:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
