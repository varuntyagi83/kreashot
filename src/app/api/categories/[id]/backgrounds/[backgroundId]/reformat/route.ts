import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { regenerateBackgroundInFormat } from '@/lib/ai/gemini'
import { downloadFile, uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions, FORMATS } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyInfo } from '@/lib/get-company'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

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

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId, company_slug: companySlug, company_name: companyName } = companyInfo

    const rateLimit = checkRateLimit(`reformat-bg:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before reformatting more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    // Fetch background with category info
    const { data: background } = await supabase
      .from('backgrounds')
      .select('*, category:categories!inner(company_id, slug)')
      .eq('id', backgroundId)
      .eq('category_id', categoryId)
      .eq('category.company_id', companyId)
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
    const sanitizedCompanyName = sanitizeCompanyName(companyName)

    for (const fmt of targetFormats) {
      console.log(`  Reformatting to ${fmt}...`)

      try {
        // Call Gemini with the source image
        const generated = await regenerateBackgroundInFormat(
          sourceBase64,
          sourceMimeType,
          fmt,
          '4K'
        )

        // Save the generated image
        const folderName = formatToFolderName(fmt)
        const slug = background.slug || background.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const fileName = `${sanitizedCompanyName}/${companySlug}/${categorySlug}/backgrounds/${folderName}/${slug}-${fmt.replace(':', 'x')}_${Date.now()}.jpg`

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
            company_id: companyId,
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
          results.push({ format: fmt, backgroundId: '', name: newName, success: false, error: 'Failed to save reformatted background' })
        } else {
          console.log(`  Saved ${fmt} background: ${newBg.id}`)
          results.push({ format: fmt, backgroundId: newBg.id, name: newName, success: true })
        }
      } catch (error: any) {
        console.error(`  Error reformatting to ${fmt}:`, error)
        results.push({ format: fmt, backgroundId: '', name: '', success: false, error: 'Reformat failed' })
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
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
