import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateBackgrounds } from '@/lib/ai/gemini'
import { getFormatDimensions } from '@/lib/formats'

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
      count = 1,
      referenceAssetIds,
      format = '1:1' // NEW: Format parameter
    } = body

    // Validate format
    const formatDimensions = getFormatDimensions(format)
    console.log(`Generating ${format} backgrounds (${formatDimensions.width}x${formatDimensions.height})`)

    // Validation
    if (!prompt) {
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

    if (!category.look_and_feel) {
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
        .select('id, file_path, mime_type, storage_provider, storage_url')
        .in('id', referenceAssetIds)

      const { data: angledShots } = await supabase
        .from('angled_shots')
        .select('id, storage_path, storage_provider, storage_url')
        .in('id', referenceAssetIds)

      const allReferences = [
        ...(productImages || []),
        ...(angledShots || []),
      ]

      // Download and convert to base64
      for (const ref of allReferences) {
        try {
          let imageBlob: Blob | null = null

          // Download from appropriate storage
          if (ref.storage_provider === 'gdrive' && ref.storage_url) {
            // For Google Drive, fetch from the public URL
            const response = await fetch(ref.storage_url)
            if (response.ok) {
              imageBlob = await response.blob()
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
              imageBlob = data
            }
          }

          if (imageBlob) {
            const arrayBuffer = await imageBlob.arrayBuffer()
            const base64Image = Buffer.from(arrayBuffer).toString('base64')
            const mimeType =
              'mime_type' in ref ? ref.mime_type : 'image/jpeg'
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

    // Generate backgrounds using Gemini AI
    console.log(
      `Generating ${count} ${format} backgrounds for category ${category.name}...`
    )
    console.log(`Prompt: ${prompt}`)
    console.log(`Look & Feel: ${category.look_and_feel}`)
    console.log(`Style references: ${styleReferenceImages.length}`)
    console.log(`Format: ${format} (${formatDimensions.width}x${formatDimensions.height})`)

    const generatedBackgrounds = await generateBackgrounds(
      prompt,
      category.look_and_feel,
      count,
      styleReferenceImages.length > 0 ? styleReferenceImages : undefined,
      format, // NEW: Pass aspect ratio
      '2K' // NEW: Image size
    )

    return NextResponse.json({
      message: `Generated ${generatedBackgrounds.length} background variations`,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      results: generatedBackgrounds.map((bg) => ({
        promptUsed: bg.promptUsed,
        image_base64: bg.imageData,
        image_mime_type: bg.mimeType,
      })),
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
