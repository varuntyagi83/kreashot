import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateComposite } from '@/lib/ai/gemini'
import { getFormatDimensions } from '@/lib/formats'

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
      format = '1:1' // NEW: Format parameter
    } = body

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

    // Extract safe zones from template (optional - category may not have template for this format yet)
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

    // Limit to prevent excessive generation
    if (compositionPairs.length > 50) {
      return NextResponse.json(
        {
          error: `Too many composites requested (${compositionPairs.length}). Maximum is 50. Use batch processing or reduce selection.`,
          total_combinations: compositionPairs.length,
        },
        { status: 400 }
      )
    }

    // Generate composites for each pair
    const results = []

    for (const pair of compositionPairs) {
      try {
        console.log(
          `Generating composite: shot ${pair.angledShotId} + bg ${pair.backgroundId}...`
        )

        // Fetch angled shot
        const { data: angledShot } = await supabase
          .from('angled_shots')
          .select('id, name, storage_provider, storage_url, storage_path')
          .eq('id', pair.angledShotId)
          .single()

        if (!angledShot) {
          console.warn(`Angled shot ${pair.angledShotId} not found, skipping`)
          continue
        }

        // Fetch background
        const { data: background } = await supabase
          .from('backgrounds')
          .select('id, name, storage_provider, storage_url, storage_path')
          .eq('id', pair.backgroundId)
          .single()

        if (!background) {
          console.warn(`Background ${pair.backgroundId} not found, skipping`)
          continue
        }

        // Download angled shot image
        let angledShotBlob: Blob | null = null

        if (
          angledShot.storage_provider === 'gdrive' &&
          angledShot.storage_url
        ) {
          const response = await fetch(angledShot.storage_url)
          if (response.ok) {
            angledShotBlob = await response.blob()
          }
        } else {
          const { data, error } = await supabase.storage
            .from('angled-shots')
            .download(angledShot.storage_path)

          if (!error && data) {
            angledShotBlob = data
          }
        }

        if (!angledShotBlob) {
          console.warn(
            `Failed to download angled shot ${pair.angledShotId}, skipping`
          )
          continue
        }

        // Download background image
        let backgroundBlob: Blob | null = null

        if (background.storage_provider === 'gdrive' && background.storage_url) {
          const response = await fetch(background.storage_url)
          if (response.ok) {
            backgroundBlob = await response.blob()
          }
        } else {
          const { data, error } = await supabase.storage
            .from('backgrounds')
            .download(background.storage_path)

          if (!error && data) {
            backgroundBlob = data
          }
        }

        if (!backgroundBlob) {
          console.warn(`Failed to download background ${pair.backgroundId}, skipping`)
          continue
        }

        // Convert to base64
        const angledShotArrayBuffer = await angledShotBlob.arrayBuffer()
        const angledShotBase64 = Buffer.from(angledShotArrayBuffer).toString(
          'base64'
        )
        const angledShotMimeType = angledShotBlob.type || 'image/jpeg'

        const backgroundArrayBuffer = await backgroundBlob.arrayBuffer()
        const backgroundBase64 = Buffer.from(backgroundArrayBuffer).toString(
          'base64'
        )
        const backgroundMimeType = backgroundBlob.type || 'image/jpeg'

        // Generate composite using Gemini (with template safe zones if available)
        const composite = await generateComposite(
          `data:${angledShotMimeType};base64,${angledShotBase64}`,
          angledShotMimeType,
          `data:${backgroundMimeType};base64,${backgroundBase64}`,
          backgroundMimeType,
          userPrompt,
          category.look_and_feel || undefined,
          safeZones.length > 0 ? safeZones : undefined,
          formatDimensions.width, // NEW: Pass canvas width
          formatDimensions.height // NEW: Pass canvas height
        )

        results.push({
          angledShotId: pair.angledShotId,
          angledShotName: angledShot.name,
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
        console.error(
          `Error generating composite for pair ${pair.angledShotId} + ${pair.backgroundId}:`,
          error
        )
        // Continue with next pair instead of failing entire batch
      }
    }

    return NextResponse.json({
      message: `Generated ${results.length} ${format} composites`,
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      format,
      dimensions: formatDimensions,
      total_combinations: compositionPairs.length,
      results,
    })
  } catch (error) {
    console.error('Error generating composites:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate composites',
      },
      { status: 500 }
    )
  }
}
