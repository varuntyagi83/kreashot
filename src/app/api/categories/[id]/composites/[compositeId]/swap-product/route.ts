export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
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
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compositeId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, compositeId } = await params

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = await checkRateLimit(`swap-product:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before swapping more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const { newAngledShotId } = body

    if (!newAngledShotId) {
      return NextResponse.json({ error: 'newAngledShotId is required' }, { status: 400 })
    }

    const composite = await prisma.composite.findFirst({
      where: { id: compositeId, categoryId, companyId },
      include: { category: { select: { slug: true, lookAndFeel: true } } },
    })

    if (!composite) {
      return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
    }

    const newShot = await prisma.angledShot.findFirst({
      where: { id: newAngledShotId, categoryId, companyId },
      select: { id: true, displayName: true, angleName: true, productId: true, storageProvider: true, storageUrl: true, storagePath: true, gdriveFileId: true },
    })

    if (!newShot) {
      return NextResponse.json({ error: 'New angled shot not found' }, { status: 404 })
    }

    const background = await prisma.background.findFirst({
      where: { id: composite.backgroundId, categoryId, companyId },
      select: { id: true, name: true, storageProvider: true, storageUrl: true, storagePath: true, gdriveFileId: true },
    })

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    // Download new angled shot
    const shotKey = newShot.gdriveFileId || newShot.storagePath
    if (!shotKey) {
      return NextResponse.json({ error: 'New angled shot has no downloadable file' }, { status: 400 })
    }

    let shotBuffer: Buffer
    if (newShot.storageProvider === 'gcs') {
      shotBuffer = await downloadFile(shotKey, { provider: 'gcs' })
    } else {
      shotBuffer = await downloadFile(shotKey, { provider: 'gdrive' })
    }

    const bgKey = background.gdriveFileId || background.storagePath
    if (!bgKey) {
      return NextResponse.json({ error: 'Background has no downloadable file' }, { status: 400 })
    }

    let bgBuffer: Buffer
    if (background.storageProvider === 'gcs') {
      bgBuffer = await downloadFile(bgKey, { provider: 'gcs' })
    } else {
      bgBuffer = await downloadFile(bgKey, { provider: 'gdrive' })
    }

    const shotResized = await downscaleForGemini(shotBuffer)
    const bgResized   = await downscaleForGemini(bgBuffer)

    const shotMime = detectMimeType(shotResized)
    const bgMime   = detectMimeType(bgResized)

    const format = composite.format || '1:1'
    const fmtDims = getFormatDimensions(format)
    const categorySlug = composite.category.slug
    const lookAndFeel  = composite.category.lookAndFeel || undefined

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

    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const newShotName = newShot.displayName || newShot.angleName
    const bgName = background.name
    const folderName = formatToFolderName(format)
    const newSlug = `${categorySlug}-${newShotName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${bgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-swap-${Date.now()}`
    const fileName = `${sanitizedCompanyName}/${company.slug}/${categorySlug}/composites/${folderName}/${newSlug}.jpg`

    const base64Data = generated.imageData.replace(/^data:image\/\w+;base64,/, '')
    const outputBuffer = Buffer.from(base64Data, 'base64')

    const storageFile = await uploadFile(outputBuffer, fileName, {
      contentType: generated.mimeType || 'image/jpeg',
      provider: 'gdrive',
    })

    const newName = `${newShotName} on ${bgName}`

    const newComposite = await prisma.composite.create({
      data: {
        categoryId,
        companyId,
        userId: user.id,
        productId: newShot.productId,
        angledShotId: newAngledShotId,
        backgroundId: composite.backgroundId,
        name: newName,
        slug: newSlug,
        description: `Product swap: ${newShotName} in ${bgName} scene`,
        promptUsed: generated.promptUsed,
        format,
        storageProvider: 'gdrive',
        storagePath: storageFile.path,
        storageUrl: storageFile.publicUrl,
        gdriveFileId: storageFile.fileId || null,
        metadata: { width: fmtDims.width, height: fmtDims.height, generationTimeMs },
      },
    })

    return NextResponse.json({
      message: 'Product swapped successfully',
      composite: newComposite,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error in swap-product:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
