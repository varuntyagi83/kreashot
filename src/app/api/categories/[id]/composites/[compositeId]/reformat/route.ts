export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyInfo } from '@/lib/get-company'
import { regenerateBackgroundInFormat } from '@/lib/ai/gemini'
import { downloadFile, uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions, FORMATS } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

/**
 * POST /api/categories/[id]/composites/[compositeId]/reformat
 *
 * Downloads the source composite image, sends it to Gemini with a target aspect ratio,
 * and saves each reformatted result as a new composite record.
 *
 * Body: { formats: string[] }  e.g. ["4:5", "9:16"]
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compositeId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, compositeId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(`reformat-composite:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before reformatting more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId, company_slug: companySlug, company_name: companyName } = companyInfo

    // Fetch composite with category info
    const { data: composite } = await supabase
      .from('composites')
      .select('*, category:categories!inner(company_id, slug, look_and_feel)')
      .eq('id', compositeId)
      .eq('category_id', categoryId)
      .eq('category.company_id', companyId)
      .single()

    if (!composite) {
      return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
    }

    const body = await request.json()
    const { formats } = body

    const validFormatKeys = Object.keys(FORMATS)
    const targetFormats: string[] = (formats && Array.isArray(formats))
      ? formats.filter((f: string) => validFormatKeys.includes(f) && f !== composite.format)
      : []

    if (targetFormats.length === 0) {
      return NextResponse.json({ error: 'No valid target formats provided' }, { status: 400 })
    }
    if (targetFormats.length > 4) {
      return NextResponse.json({ error: 'Max 4 formats at a time' }, { status: 400 })
    }

    // Download source image from GDrive
    let sourceBuffer: Buffer
    if (composite.gdrive_file_id) {
      sourceBuffer = await downloadFile(composite.gdrive_file_id, { provider: 'gdrive' })
    } else if (composite.storage_path) {
      sourceBuffer = await downloadFile(composite.storage_path, { provider: 'gdrive' })
    } else {
      return NextResponse.json({ error: 'Composite has no downloadable file' }, { status: 400 })
    }

    const sourceMimeType = 'image/jpeg'
    const sourceBase64 = `data:${sourceMimeType};base64,${sourceBuffer.toString('base64')}`
    const categorySlug = (composite.category as any).slug
    const sanitizedCompanyName = sanitizeCompanyName(companyName)

    const results: Array<{
      format: string
      compositeId: string
      name: string
      success: boolean
      error?: string
    }> = []

    for (const fmt of targetFormats) {
      console.log(`  Reformatting composite to ${fmt}...`)
      try {
        const reformatStartTime = Date.now()
        const generated = await regenerateBackgroundInFormat(
          sourceBase64,
          sourceMimeType,
          fmt,
          '4K'
        )
        const reformatTimeMs = Date.now() - reformatStartTime

        const folderName = formatToFolderName(fmt)
        const baseSlug = composite.slug || composite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const newSlug = `${baseSlug}-${fmt.replace(':', 'x')}-${Date.now()}`
        const fileName = `${sanitizedCompanyName}/${companySlug}/${categorySlug}/composites/${folderName}/${newSlug}.jpg`

        const base64Data = generated.imageData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        const storageFile = await uploadFile(buffer, fileName, {
          contentType: generated.mimeType || 'image/jpeg',
          provider: 'gdrive',
        })

        const fmtDims = getFormatDimensions(fmt)
        const newName = `${composite.name} (${fmt})`

        const { data: newComposite, error: dbError } = await supabase
          .from('composites')
          .insert({
            category_id: categoryId,
            company_id: companyId,
            user_id: user.id,
            product_id: composite.product_id || null,
            angled_shot_id: composite.angled_shot_id,
            background_id: composite.background_id,
            name: newName,
            slug: newSlug,
            description: composite.description || `Reformatted from ${composite.name}`,
            prompt_used: generated.promptUsed,
            format: fmt,
            width: fmtDims.width,
            height: fmtDims.height,
            aspect_ratio: fmt,
            generation_time_ms: reformatTimeMs,
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
          results.push({ format: fmt, compositeId: '', name: newName, success: false, error: 'Failed to save reformatted composite' })
        } else {
          console.log(`  Saved ${fmt} composite: ${newComposite.id}`)
          results.push({ format: fmt, compositeId: newComposite.id, name: newName, success: true })
        }
      } catch (error: any) {
        console.error(`  Error reformatting to ${fmt}:`, error)
        results.push({ format: fmt, compositeId: '', name: '', success: false, error: 'Reformat failed' })
      }
    }

    const successCount = results.filter((r) => r.success).length
    return NextResponse.json({
      message: `Reformatted ${successCount}/${targetFormats.length} format(s)`,
      results,
    })
  } catch (error) {
    console.error('Error in composite reformat:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
