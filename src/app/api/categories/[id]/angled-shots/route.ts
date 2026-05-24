import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile } from '@/lib/storage'
import { createDisplayName } from '@/lib/ai/format-angle-name'
import sharp from 'sharp'
import { detectFormatFromDimensions, formatToFolderName } from '@/lib/formats'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

/**
 * GET /api/categories/[id]/angled-shots
 * Lists all angled shots for a category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId } = await params

    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get('productId') || undefined
    const format = searchParams.get('format') || undefined

    // Verify category belongs to company
    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const angledShots = await prisma.angledShot.findMany({
      where: {
        categoryId,
        ...(productId ? { productId } : {}),
        ...(format ? { format } : {}),
      },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        productImage: { select: { id: true, fileName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // defensive bound against unbounded growth per category
    })

    console.log(`[Angled Shots API] Category: ${categoryId}, Format: ${format || 'all'}, Found: ${angledShots.length}`)

    const angledShotsWithUrls = angledShots.map((shot) => ({
      ...shot,
      public_url: shot.storageUrl || shot.storagePath || '',
      angle_name: shot.angleName,
      angle_description: shot.angleDescription,
      display_name: shot.displayName,
      prompt_used: shot.promptUsed,
      storage_path: shot.storagePath,
      storage_url: shot.storageUrl,
      storage_provider: shot.storageProvider,
      gdrive_file_id: shot.gdriveFileId,
      created_at: shot.createdAt,
    }))

    return NextResponse.json({
      category: { id: category.id, name: category.name },
      angledShots: angledShotsWithUrls,
    })
  } catch (error) {
    console.error('Error fetching angled shots:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/categories/[id]/angled-shots
 * Saves a generated angled shot to storage and database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId } = await params

    // Fetch company slug and name for storage path
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Verify category belongs to company and get slug
    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, slug: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      productId,
      productImageId,
      angleName,
      angleDescription,
      promptUsed,
      imageData,
      mimeType,
      format: clientFormat,
    } = body

    if (!productId || !productImageId || !angleName || !angleDescription || !imageData) {
      return NextResponse.json(
        { error: 'productId, productImageId, angleName, angleDescription, and imageData are required' },
        { status: 400 }
      )
    }

    const MAX_BASE64_LENGTH = 20 * 1024 * 1024 * 1.34
    if (imageData.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Image too large (max 20MB)' }, { status: 400 })
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    let detectedFormat = clientFormat || '1:1'
    let actualWidth = 1080
    let actualHeight = 1080
    try {
      const metadata = await sharp(buffer).metadata()
      if (metadata.width && metadata.height) {
        detectedFormat = detectFormatFromDimensions(metadata.width, metadata.height)
        actualWidth = metadata.width
        actualHeight = metadata.height
      }
    } catch (dimError) {
      console.warn(`Could not detect angled shot dimensions, using client format: ${clientFormat}`, dimError)
    }
    const format = detectedFormat

    const product = await prisma.product.findFirst({
      where: { id: productId, categoryId },
      select: { id: true, slug: true, name: true },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const productImage = await prisma.productImage.findFirst({
      where: { id: productImageId, productId },
      select: { id: true, fileName: true },
    })

    if (!productImage) {
      return NextResponse.json({ error: 'Product image not found' }, { status: 404 })
    }

    const imageNameWithoutExt = productImage.fileName.replace(/\.[^/.]+$/, '')
    const fileExt = mimeType?.split('/')[1] || 'jpg'
    const formatFolder = formatToFolderName(format)
    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const fileName = `${sanitizedCompanyName}/${company.slug}/${category.slug}/${product.slug}/product-images/angled-shots/${formatFolder}/${imageNameWithoutExt}-${angleName}_${Date.now()}.${fileExt}`

    const storageFile = await uploadFile(buffer, fileName, {
      contentType: mimeType || 'image/jpeg',
      provider: 'gcs',
    })

    const displayName = createDisplayName(product.name, angleName)

    const angledShot = await prisma.angledShot.create({
      data: {
        productId,
        productImageId,
        categoryId,
        userId: user.id,
        companyId,
        angleName,
        angleDescription,
        displayName,
        promptUsed: promptUsed || null,
        format,
        storageProvider: 'gcs',
        storagePath: storageFile.path,
        storageUrl: storageFile.publicUrl,
        gdriveFileId: storageFile.fileId || null,
        metadata: { width: actualWidth, height: actualHeight },
      },
    })

    return NextResponse.json(
      {
        message: 'Angled shot saved successfully',
        angledShot: {
          ...angledShot,
          public_url: storageFile.publicUrl,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error saving angled shot:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
