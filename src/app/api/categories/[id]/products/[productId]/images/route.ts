import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile, deleteFile } from '@/lib/storage'
import sharp from 'sharp'
import { detectFormatFromDimensions, formatToFolderName } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  if (buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return 'image/jpeg'
  if (buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47) return 'image/png'
  if (buf[0]===0x52 && buf[1]===0x49 && buf[2]===0x46 && buf[3]===0x46 &&
      buf[8]===0x57 && buf[9]===0x45 && buf[10]===0x42 && buf[11]===0x50) return 'image/webp'
  if (buf[0]===0x47 && buf[1]===0x49 && buf[2]===0x46) return 'image/gif'
  return null
}

// GET /api/categories/[id]/products/[productId]/images - List product images
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, productId } = await params

    const rateLimit = await checkRateLimit(`list-product-images:${user.id}`, 100, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    // Verify product belongs to company's category
    const product = await prisma.product.findFirst({
      where: { id: productId, categoryId, companyId },
      select: { id: true },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const images = await prisma.productImage.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    })

    const imagesWithUrls = images.map((image) => ({
      ...image,
      public_url: image.storageUrl || image.storagePath || '',
      file_name: image.fileName,
      mime_type: (image.metadata as any)?.mimeType || 'image/jpeg',
      storage_provider: image.storageProvider,
      storage_path: image.storagePath,
      storage_url: image.storageUrl,
      gdrive_file_id: image.gdriveFileId,
      created_at: image.createdAt,
    }))

    return NextResponse.json({ images: imagesWithUrls })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/categories/[id]/products/[productId]/images - Upload product images
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, productId } = await params

    const rateLimit = await checkRateLimit(`upload:${user.id}`, 20, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Upload rate limit exceeded' }, { status: 429 })
    }

    // Fetch company slug and name for storage path
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Verify product belongs to company's category and get slugs
    const product = await prisma.product.findFirst({
      where: { id: productId, categoryId, companyId },
      select: { id: true, slug: true, category: { select: { slug: true } } },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const categorySlug = product.category.slug

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const clientFormat = formData.get('format') as string | null

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const existingCount = await prisma.productImage.count({ where: { productId } })
    const isFirstImage = existingCount === 0

    const uploadedImages = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: 'Image too large (max 20MB)' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      const detectedMime = detectImageMime(buffer)
      if (!detectedMime) {
        return NextResponse.json({ error: 'Invalid image file: could not detect format' }, { status: 400 })
      }
      if (!detectedMime.startsWith('image/')) {
        return NextResponse.json({ error: 'Invalid image file: unsupported format' }, { status: 400 })
      }
      if (!['image/jpeg','image/png','image/webp','image/gif'].includes(detectedMime)) {
        return NextResponse.json({ error: 'Invalid image file content' }, { status: 400 })
      }

      let detectedFormat = clientFormat || '1:1'
      try {
        const metadata = await sharp(buffer).metadata()
        if (metadata.width && metadata.height) {
          detectedFormat = detectFormatFromDimensions(metadata.width, metadata.height)
        }
      } catch (dimError) {
        console.warn(`Could not detect image dimensions, using client format: ${clientFormat}`, dimError)
      }

      const formatFolder = formatToFolderName(detectedFormat)
      const sanitizedCompanyName = sanitizeCompanyName(company.name)

      const fileExt = file.name.split('.').pop() || 'jpg'
      const timestamp = Date.now()
      const sanitizedFileName = file.name
        .replace(/\.[^/.]+$/, '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '')

      const storagePath = `${sanitizedCompanyName}/${company.slug}/${categorySlug}/${product.slug}/product-images/angled-shots/${formatFolder}/${sanitizedFileName}-${timestamp}.${fileExt}`

      const storageProvider = (process.env.STORAGE_PROVIDER || 'gcs') as 'gcs' | 'gdrive'
      console.log(`Uploading product image via ${storageProvider}: ${storagePath}`)

      const resolvedMime = detectedMime

      const storageFile = await uploadFile(buffer, storagePath, {
        contentType: resolvedMime,
      })

      console.log(`Upload successful! URL: ${storageFile.publicUrl}`)

      try {
        const imageRecord = await prisma.productImage.create({
          data: {
            productId,
            categoryId,
            fileName: file.name,
            storageProvider,
            storagePath,
            storageUrl: storageFile.publicUrl,
            gdriveFileId: storageFile.fileId || null,
            companyId,
            userId: user.id,
            metadata: { mimeType: resolvedMime, fileSize: file.size },
          },
        })
        uploadedImages.push({
          ...imageRecord,
          public_url: storageFile.publicUrl,
        })
      } catch (dbError) {
        console.error('[product-images] DB insert failed, cleaning up storage file:', dbError)
        try {
          await deleteFile(storageFile.fileId || storagePath)
        } catch (cleanupErr) {
          console.error('[product-images] Storage cleanup failed:', cleanupErr)
        }
        continue
      }
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json({ error: 'Failed to upload images' }, { status: 500 })
    }

    return NextResponse.json(
      {
        message: `Successfully uploaded ${uploadedImages.length} image(s)`,
        images: uploadedImages,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
