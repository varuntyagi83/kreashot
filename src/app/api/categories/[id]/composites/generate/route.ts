import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateComposite } from '@/lib/ai/gemini'
import { getFormatDimensions } from '@/lib/formats'
import { downloadFile } from '@/lib/storage'

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'image/webp'
  return 'image/jpeg' // JPEG default (covers FF D8 FF and unknown formats)
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

        // Convert to base64 with actual MIME type detection from magic bytes
        const angledShotBase64 = angledShotBuffer.toString('base64')
        const angledShotMimeType = detectMimeType(angledShotBuffer)

        const backgroundBase64 = backgroundBuffer.toString('base64')
        const backgroundMimeType = detectMimeType(backgroundBuffer)

        // Generate composite using Gemini (with template safe zones if available)
        const composite = await generateComposite(
          `data:${angledShotMimeType};base64,${angledShotBase64}`,
          angledShotMimeType,
          `data:${backgroundMimeType};base64,${backgroundBase64}`,
          backgroundMimeType,
          userPrompt,
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
