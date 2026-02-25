import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { regenerateBackgroundInFormat } from '@/lib/ai/gemini'
import { downloadFile, uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions, FORMATS } from '@/lib/formats'

/**
 * POST /api/categories/[id]/backgrounds/[backgroundId]/reformat
 *
 * Downloads the source background image from GDrive, sends it to Gemini
 * as inline_data with a target aspect ratio, and saves each result.
 *
 * Body: { formats: string[] }  e.g. ["16:9", "9:16", "4:5"]
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, backgroundId } = await params

    // Auth
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch background with category info
    const { data: background } = await supabase
      .from('backgrounds')
      .select('*, category:categories!inner(user_id, slug)')
      .eq('id', backgroundId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { formats } = body

    const validFormatKeys = Object.keys(FORMATS)
    const targetFormats: string[] = (formats && Array.isArray(formats))
      ? formats.filter((f: string) => validFormatKeys.includes(f) && f !== background.format)
      : []

    if (targetFormats.length === 0) {
      return NextResponse.json({ error: 'No valid target formats provided' }, { status: 400 })
    }

    if (targetFormats.length > 4) {
      return NextResponse.json({ error: 'Max 4 formats at a time' }, { status: 400 })
    }

    // Download the source image from GDrive
    console.log(`Downloading source background: ${background.name} (${background.gdrive_file_id})`)
    let sourceBuffer: Buffer

    if (background.gdrive_file_id) {
      sourceBuffer = await downloadFile(background.gdrive_file_id, { provider: 'gdrive' })
    } else if (background.storage_path) {
      sourceBuffer = await downloadFile(background.storage_path, { provider: 'gdrive' })
    } else {
      return NextResponse.json({ error: 'Background has no downloadable file' }, { status: 400 })
    }

    const sourceMimeType = 'image/jpeg'
    const sourceBase64 = `data:${sourceMimeType};base64,${sourceBuffer.toString('base64')}`

    console.log(`Source image: ${(sourceBuffer.length / 1024).toFixed(0)}KB, reformatting to: ${targetFormats.join(', ')}`)

    // Generate each format sequentially (each call is heavy)
    const results: Array<{
      format: string
      backgroundId: string
      name: string
      success: boolean
      error?: string
    }> = []

    const categorySlug = (background.category as any).slug

    for (const fmt of targetFormats) {
      console.log(`  Reformatting to ${fmt}...`)

      try {
        // Call Gemini with the source image
        const generated = await regenerateBackgroundInFormat(
          sourceBase64,
          sourceMimeType,
          fmt,
          '2K'
        )

        // Save the generated image
        const folderName = formatToFolderName(fmt)
        const slug = background.slug || background.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const fileName = `${categorySlug}/backgrounds/${folderName}/${slug}-${fmt.replace(':', 'x')}_${Date.now()}.jpg`

        const base64Data = generated.imageData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        const storageFile = await uploadFile(buffer, fileName, {
          contentType: generated.mimeType || 'image/jpeg',
          provider: 'gdrive',
        })

        const fmtDims = getFormatDimensions(fmt)
        const newName = `${background.name} (${fmt})`

        const { data: newBg, error: dbError } = await supabase
          .from('backgrounds')
          .insert({
            category_id: categoryId,
            user_id: user.id,
            name: newName,
            slug: `${slug}-${fmt.replace(':', 'x')}-${Date.now()}`,
            description: background.description || `Reformatted from ${background.name}`,
            prompt_used: generated.promptUsed,
            format: fmt,
            width: fmtDims.width,
            height: fmtDims.height,
            storage_provider: 'gdrive',
            storage_path: storageFile.path,
            storage_url: storageFile.publicUrl,
            gdrive_file_id: storageFile.fileId || null,
            metadata: {},
          })
          .select()
          .single()

        if (dbError) {
          console.error(`  DB error for ${fmt}:`, dbError)
          results.push({ format: fmt, backgroundId: '', name: newName, success: false, error: dbError.message })
        } else {
          console.log(`  Saved ${fmt} background: ${newBg.id}`)
          results.push({ format: fmt, backgroundId: newBg.id, name: newName, success: true })
        }
      } catch (error: any) {
        console.error(`  Error reformatting to ${fmt}:`, error)
        results.push({ format: fmt, backgroundId: '', name: '', success: false, error: error.message })
      }
    }

    const successCount = results.filter((r) => r.success).length

    return NextResponse.json({
      message: `Reformatted ${successCount}/${targetFormats.length} format(s)`,
      results,
    })
  } catch (error) {
    console.error('Error in reformat:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reformat background' },
      { status: 500 }
    )
  }
}
