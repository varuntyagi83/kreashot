import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateBackgrounds } from '@/lib/ai/gemini'
import { getFormatDimensions, FORMATS } from '@/lib/formats'
import { downloadFile } from '@/lib/storage'
import { parseReferenceTokens } from '@/lib/references'

/**
 * POST /api/categories/[id]/backgrounds/generate
 * Generates AI backgrounds matching the category's look & feel
 * Phase 3: Background Generation (updated for multi-format support)
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

    // Verify category belongs to user and get look_and_feel + brand_guidelines
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel, brand_guidelines')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get request body
    const body = await request.json()
    const {
      prompt,
      userPrompt,
      lookAndFeel,        // User-edited look & feel from the form
      count = 1,
      referenceAssetIds,
      formats,            // NEW: Array of formats
      format = '1:1',     // Legacy: single format (backwards compatible)
      colorWorld,         // NEW: Selected color world (e.g. "World of Green palette")
    } = body

    // Accept either "prompt" or "userPrompt" (frontend sends userPrompt)
    const resolvedPrompt = prompt || userPrompt

    // Normalize formats: accept array or single string for backwards compatibility
    const validFormatKeys = Object.keys(FORMATS)
    const formatsToGenerate: string[] = (formats && Array.isArray(formats) && formats.length > 0)
      ? formats.filter((f: string) => validFormatKeys.includes(f))
      : [validFormatKeys.includes(format) ? format : '1:1']

    console.log(`Formats to generate: ${formatsToGenerate.join(', ')}`)

    // Validation
    if (!resolvedPrompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      )
    }

    if (count < 1 || count > 5) {
      return NextResponse.json(
        { error: 'count must be between 1 and 5' },
        { status: 400 }
      )
    }

    const totalGenerations = count * formatsToGenerate.length
    if (totalGenerations > 20) {
      return NextResponse.json(
        { error: `Too many generations (${totalGenerations}). Reduce count or number of formats (max 20 total).` },
        { status: 400 }
      )
    }

    // Parse @[name](type:id) reference tokens from both prompt and lookAndFeel
    const { cleanText: cleanPrompt, references: promptRefs } = parseReferenceTokens(resolvedPrompt)
    const { cleanText: cleanLookAndFeel, references: lafRefs } = parseReferenceTokens(
      (lookAndFeel && lookAndFeel.trim()) || ''
    )

    // Collect unique guideline IDs from both fields
    const allRefs = [...promptRefs, ...lafRefs]
    const guidelineRefs = allRefs.filter(r => r.type === 'guideline')
    const uniqueGuidelineIds = [...new Set(guidelineRefs.map(r => r.id))]

    let resolvedGuidelinesText = ''
    let resolvedColorDescription = ''

    // Fetch guidelines referenced via @ tokens
    if (uniqueGuidelineIds.length > 0) {
      const { data: guidelines } = await supabase
        .from('brand_guidelines')
        .select('id, name, extracted_text, color_description')
        .in('id', uniqueGuidelineIds)
        .eq('user_id', user.id)

      if (guidelines?.length) {
        resolvedGuidelinesText = guidelines
          .map(g => `--- ${g.name} ---\n${g.extracted_text}`)
          .join('\n\n')
        resolvedColorDescription = guidelines
          .map(g => g.color_description)
          .filter(Boolean)
          .join('\n\n')
        console.log(`Resolved ${guidelines.length} brand guideline reference(s) (${resolvedGuidelinesText.length} chars, color: ${resolvedColorDescription.length} chars)`)
      }
    }

    // If colorWorld is selected but no color description was loaded (no @ references),
    // fetch color descriptions from ALL of the user's guidelines
    if (colorWorld && !resolvedColorDescription) {
      const { data: allGuidelines } = await supabase
        .from('brand_guidelines')
        .select('color_description')
        .eq('user_id', user.id)

      if (allGuidelines?.length) {
        resolvedColorDescription = allGuidelines
          .map(g => g.color_description)
          .filter(Boolean)
          .join('\n\n')
        console.log(`Loaded color descriptions from all guidelines for colorWorld "${colorWorld}" (${resolvedColorDescription.length} chars)`)
      }
    }

    // Filter color description to ONLY the selected color world
    if (colorWorld && resolvedColorDescription) {
      const lines = resolvedColorDescription.split('\n').filter(l => l.trim())
      const worldLower = colorWorld.toLowerCase()
      const filtered = lines.filter(line => {
        const lower = line.toLowerCase()
        // Include lines that mention the selected world (e.g., "World of Green palette: ...")
        if (lower.includes(worldLower)) return true
        // Include lighting and mood lines (always relevant)
        if (lower.includes('lighting') || lower.includes('mood')) return true
        // EXCLUDE everything else — especially other "Brand color" lines
        // that would confuse the model with gold, silver, pink, etc.
        return false
      })
      resolvedColorDescription = filtered.join('\n')
      console.log(`Filtered to "${colorWorld}": "${resolvedColorDescription}"`)
    }

    // Merge @-referenced guidelines with category-level brand_guidelines (backwards compatible)
    const finalGuidelines = [category.brand_guidelines, resolvedGuidelinesText]
      .filter(Boolean).join('\n\n').substring(0, 24000) || undefined

    // Use form-submitted lookAndFeel if provided (cleaned of tokens), otherwise fall back to DB value
    const resolvedLookAndFeel = cleanLookAndFeel || category.look_and_feel

    if (!resolvedLookAndFeel) {
      return NextResponse.json(
        {
          error:
            'Category must have a look_and_feel description. Please edit the category and add one.',
        },
        { status: 400 }
      )
    }

    // Get reference assets if provided (for style guidance)
    let styleReferenceImages: Array<{ data: string; mimeType: string }> = []

    if (referenceAssetIds && referenceAssetIds.length > 0) {
      // Fetch reference images from product_images or angled_shots
      const { data: productImages } = await supabase
        .from('product_images')
        .select('id, file_path, mime_type, storage_provider, storage_url, storage_path, gdrive_file_id')
        .in('id', referenceAssetIds)

      const { data: angledShots } = await supabase
        .from('angled_shots')
        .select('id, storage_path, storage_provider, storage_url, gdrive_file_id')
        .in('id', referenceAssetIds)

      // Also check brand_assets table (stored in Supabase Storage)
      const { data: brandAssets } = await supabase
        .from('brand_assets')
        .select('id, storage_path, storage_url, metadata')
        .in('id', referenceAssetIds)

      const allReferences = [
        ...(productImages || []),
        ...(angledShots || []),
        ...(brandAssets || []).map((ba) => ({
          ...ba,
          storage_provider: 'supabase' as const,
          file_path: ba.storage_path,
          mime_type: ba.metadata?.file_type || 'image/jpeg',
        })),
      ]

      // Download and convert to base64
      for (const ref of allReferences) {
        try {
          let imageBuffer: Buffer | null = null

          // Download from appropriate storage — prefer gdrive_file_id for direct download
          if (ref.storage_provider === 'gdrive') {
            const gdriveKey = ('gdrive_file_id' in ref ? ref.gdrive_file_id : null) || ref.storage_path
            if (!gdriveKey) continue
            try {
              imageBuffer = await downloadFile(gdriveKey as string, { provider: 'gdrive' })
            } catch (dlError) {
              console.warn(`Failed to download reference via gdrive adapter: ${dlError}`)
            }
          } else {
            // For Supabase Storage
            const path = 'file_path' in ref ? ref.file_path : ref.storage_path
            const bucket =
              'file_path' in ref ? 'product-images' : 'angled-shots'

            const { data, error } = await supabase.storage
              .from(bucket)
              .download(path)

            if (!error && data) {
              const arrayBuf = await data.arrayBuffer()
              imageBuffer = Buffer.from(arrayBuf)
            }
          }

          if (imageBuffer) {
            const base64Image = imageBuffer.toString('base64')
            const mimeType: string =
              'mime_type' in ref ? (ref.mime_type as string) : 'image/jpeg'
            styleReferenceImages.push({
              data: `data:${mimeType};base64,${base64Image}`,
              mimeType,
            })
          }
        } catch (error) {
          console.error(
            `Failed to fetch reference asset ${ref.id}:`,
            error
          )
          // Continue even if one reference fails
        }
      }
    }

    // Generate backgrounds for each requested format
    console.log(
      `Generating ${count} background(s) x ${formatsToGenerate.length} format(s) for category ${category.name}...`
    )
    console.log(`Prompt: ${cleanPrompt}`)
    console.log(`Look & Feel: ${resolvedLookAndFeel}`)
    console.log(`Style references: ${styleReferenceImages.length}`)
    console.log(`Brand guidelines: ${finalGuidelines ? `${finalGuidelines.length} chars` : 'none'}`)
    console.log(`Formats: ${formatsToGenerate.join(', ')}`)

    const allMappedBackgrounds: Array<{
      promptUsed: string
      imageData: string
      mimeType: string
      format: string
      image_base64: string
      image_mime_type: string
    }> = []

    const failedFormats: string[] = []

    for (let fi = 0; fi < formatsToGenerate.length; fi++) {
      const fmt = formatsToGenerate[fi]
      const fmtDimensions = getFormatDimensions(fmt)
      console.log(`  Generating ${count} ${fmt} backgrounds (${fmtDimensions.width}x${fmtDimensions.height})...`)

      // Add a short delay between format batches to avoid Gemini rate limits
      if (fi > 0) {
        console.log(`  ⏳ Waiting 3s before next format to avoid rate limits...`)
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      try {
        const generatedBackgrounds = await generateBackgrounds(
          cleanPrompt,
          resolvedLookAndFeel,
          count,
          styleReferenceImages.length > 0 ? styleReferenceImages : undefined,
          fmt,
          '2K',
          finalGuidelines,
          resolvedColorDescription || undefined
        )

        for (const bg of generatedBackgrounds) {
          allMappedBackgrounds.push({
            promptUsed: bg.promptUsed,
            imageData: bg.imageData,
            mimeType: bg.mimeType,
            format: fmt,
            // Legacy field names for backwards compatibility
            image_base64: bg.imageData,
            image_mime_type: bg.mimeType,
          })
        }
      } catch (fmtError) {
        console.error(`  ❌ Format ${fmt} failed:`, fmtError instanceof Error ? fmtError.message : fmtError)
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
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      backgrounds: allMappedBackgrounds,
      results: allMappedBackgrounds,
      failedFormats: failedFormats.length > 0 ? failedFormats : undefined,
    })
  } catch (error) {
    console.error('Error generating backgrounds:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate backgrounds',
      },
      { status: 500 }
    )
  }
}
