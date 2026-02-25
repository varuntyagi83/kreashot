import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateBackgrounds } from '@/lib/ai/gemini'
import { getFormatDimensions, FORMATS } from '@/lib/formats'
import { downloadFile } from '@/lib/storage'

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

    // Verify category belongs to user and get look_and_feel
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
      prompt,
      userPrompt,
      lookAndFeel,        // User-edited look & feel from the form
      count = 1,
      referenceAssetIds,
      formats,            // NEW: Array of formats
      format = '1:1',     // Legacy: single format (backwards compatible)
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

    // Use form-submitted lookAndFeel if provided, otherwise fall back to DB value
    const resolvedLookAndFeel = (lookAndFeel && lookAndFeel.trim()) || category.look_and_feel

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

      const allReferences = [
        ...(productImages || []),
        ...(angledShots || []),
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
    console.log(`Prompt: ${resolvedPrompt}`)
    console.log(`Look & Feel: ${resolvedLookAndFeel}`)
    console.log(`Style references: ${styleReferenceImages.length}`)
    console.log(`Formats: ${formatsToGenerate.join(', ')}`)

    const allMappedBackgrounds: Array<{
      promptUsed: string
      imageData: string
      mimeType: string
      format: string
      image_base64: string
      image_mime_type: string
    }> = []

    for (const fmt of formatsToGenerate) {
      const fmtDimensions = getFormatDimensions(fmt)
      console.log(`  Generating ${count} ${fmt} backgrounds (${fmtDimensions.width}x${fmtDimensions.height})...`)

      const generatedBackgrounds = await generateBackgrounds(
        resolvedPrompt,
        resolvedLookAndFeel,
        count,
        styleReferenceImages.length > 0 ? styleReferenceImages : undefined,
        fmt,
        '2K'
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
    }

    return NextResponse.json({
      message: `Generated ${allMappedBackgrounds.length} background variation(s) across ${formatsToGenerate.length} format(s)`,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      backgrounds: allMappedBackgrounds,
      results: allMappedBackgrounds,
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
