export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyInfo } from '@/lib/get-company'
import { generateComposite } from '@/lib/ai/gemini'
import { downloadFile, uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import sharp from 'sharp'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

const GEMINI_INPUT_MAX_PX = 1536

async function downscaleForGemini(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata()
  const w = metadata.width || 0
  const h = metadata.height || 0
  if (w <= GEMINI_INPUT_MAX_PX && h <= GEMINI_INPUT_MAX_PX) return buffer
  return sharp(buffer)
    .resize(GEMINI_INPUT_MAX_PX, GEMINI_INPUT_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
}

function detectMimeType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp'
  return 'image/jpeg'
}

/**
 * POST /api/categories/[id]/composites/[compositeId]/swap-product
 *
 * Swaps the product in an existing composite with a different angled shot.
 * Regenerates using Gemini with the same background, saves as a new composite.
 *
 * Body: { newAngledShotId: string }
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

    const rateLimit = checkRateLimit(`swap-product:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before swapping more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId, company_slug: companySlug, company_name: companyName } = companyInfo

    const body = await request.json()
    const { newAngledShotId } = body

    if (!newAngledShotId) {
      return NextResponse.json({ error: 'newAngledShotId is required' }, { status: 400 })
    }

    // Fetch the original composite
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

    // Fetch the new angled shot
    const { data: newShot } = await supabase
      .from('angled_shots')
      .select('id, display_name, angle_name, product_id, storage_provider, storage_url, storage_path, gdrive_file_id')
      .eq('id', newAngledShotId)
      .eq('category_id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!newShot) {
      return NextResponse.json({ error: 'New angled shot not found' }, { status: 404 })
    }

    // Fetch the original background
    const { data: background } = await supabase
      .from('backgrounds')
      .select('id, name, storage_provider, storage_url, storage_path, gdrive_file_id')
      .eq('id', composite.background_id)
      .eq('category_id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    // Download new angled shot
    const shotKey = newShot.gdrive_file_id || newShot.storage_path
    if (!shotKey) {
      return NextResponse.json({ error: 'New angled shot has no downloadable file' }, { status: 400 })
    }
    const shotBuffer = await downloadFile(shotKey, { provider: 'gdrive' })

    // Download background
    const bgKey = background.gdrive_file_id || background.storage_path
    if (!bgKey) {
      return NextResponse.json({ error: 'Background has no downloadable file' }, { status: 400 })
    }
    const bgBuffer = await downloadFile(bgKey, { provider: 'gdrive' })

    // Downscale for Gemini
    const shotResized = await downscaleForGemini(shotBuffer)
    const bgResized   = await downscaleForGemini(bgBuffer)

    const shotMime = detectMimeType(shotResized)
    const bgMime   = detectMimeType(bgResized)

    const format = composite.format || '1:1'
    const fmtDims = getFormatDimensions(format)
    const categorySlug = (composite.category as any).slug
    const lookAndFeel  = (composite.category as any).look_and_feel || undefined

    const swapPrompt = 'Replace the product in the scene with the new product image, matching the same lighting, camera angle, shadows, and background composition exactly. Keep the scene identical.'

    const startTime = Date.now()

    const generated = await generateComposite(
      `data:${shotMime};base64,${shotResized.toString('base64')}`,
      shotMime,
      `data:${bgMime};base64,${bgResized.toString('base64')}`,
      bgMime,
      swapPrompt,
      lookAndFeel,
      undefined,
      fmtDims.width,
      fmtDims.height
    )

    const generationTimeMs = Date.now() - startTime

    // Save new composite
    const sanitizedCompanyName = sanitizeCompanyName(companyName)
    const newShotName = newShot.display_name || newShot.angle_name
    const bgName = background.name
    const folderName = formatToFolderName(format)
    const newSlug = `${categorySlug}-${newShotName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${bgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-swap-${Date.now()}`
    const fileName = `${sanitizedCompanyName}/${companySlug}/${categorySlug}/composites/${folderName}/${newSlug}.jpg`

    const base64Data = generated.imageData.replace(/^data:image\/\w+;base64,/, '')
    const outputBuffer = Buffer.from(base64Data, 'base64')

    const storageFile = await uploadFile(outputBuffer, fileName, {
      contentType: generated.mimeType || 'image/jpeg',
      provider: 'gdrive',
    })

    const newName = `${newShotName} on ${bgName}`

    const { data: newComposite, error: dbError } = await supabase
      .from('composites')
      .insert({
        category_id: categoryId,
        company_id: companyId,
        user_id: user.id,
        product_id: newShot.product_id || null,
        angled_shot_id: newAngledShotId,
        background_id: composite.background_id,
        name: newName,
        slug: newSlug,
        description: `Product swap: ${newShotName} in ${bgName} scene`,
        prompt_used: generated.promptUsed,
        format,
        width: fmtDims.width,
        height: fmtDims.height,
        aspect_ratio: format,
        generation_time_ms: generationTimeMs,
        storage_provider: 'gdrive',
        storage_path: storageFile.path,
        storage_url: storageFile.publicUrl,
        gdrive_file_id: storageFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB error saving swapped composite:', dbError)
      return NextResponse.json({ error: 'Failed to save swapped composite' }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Product swapped successfully',
      composite: newComposite,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error in swap-product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
