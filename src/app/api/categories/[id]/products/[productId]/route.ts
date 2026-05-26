import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

// Generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// GET /api/categories/[id]/products/[productId] - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, productId } = await params

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        categoryId,
        companyId,
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ product })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/categories/[id]/products/[productId] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, productId } = await params

    const body = await request.json()

    // Verify product belongs to company's category
    const existingProduct = await prisma.product.findFirst({
      where: { id: productId, categoryId, companyId },
      select: { id: true },
    })

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (body.name && !body.name.trim()) {
      return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 })
    }

    const updateData: any = {}
    if (body.name) {
      updateData.name = body.name.trim()
      updateData.slug = generateSlug(body.name)
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null
    }

    const updated = await prisma.product.updateMany({
      where: { id: productId, categoryId, companyId },
      data: updateData,
    })
    if (updated.count === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    const product = await prisma.product.findFirst({ where: { id: productId, companyId } })
    return NextResponse.json({ product })
  } catch (error) {
    console.error('[products/[productId] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Pre-queue GDrive files owned by a product before cascade delete.
 */
async function preQueueProductGDriveFiles(productId: string, userId: string): Promise<number> {
  let queued = 0

  const [productImages, angledShots] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true, userId: true },
      take: 1000,
    }),
    prisma.angledShot.findMany({
      where: { productId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
  ])

  const entries = [
    ...productImages.map((img) => ({
      resourceType: 'product_image',
      resourceId: img.id,
      storageProvider: 'gdrive',
      storagePath: img.storagePath,
      gdriveFileId: img.gdriveFileId,
      storageUrl: img.storageUrl,
      userId: img.userId || userId,
      metadata: { product_id: productId, pre_queued: true },
    })),
    ...angledShots.map((shot) => ({
      resourceType: 'angled_shot',
      resourceId: shot.id,
      storageProvider: 'gdrive',
      storagePath: shot.storagePath,
      gdriveFileId: shot.gdriveFileId,
      storageUrl: shot.storageUrl,
      userId,
      metadata: { product_id: productId, pre_queued: true },
    })),
  ]

  if (entries.length > 0) {
    try {
      await prisma.deletionQueue.createMany({ data: entries, skipDuplicates: true })
      queued = entries.length
    } catch (err: any) {
      console.error('Failed to pre-queue product deletions:', err.message)
    }
  }

  return queued
}

// DELETE /api/categories/[id]/products/[productId] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, productId } = await params

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }
    console.log(`[audit] DELETE product ${productId} by user ${user.id} at ${new Date().toISOString()}`)

    const product = await prisma.product.findFirst({
      where: { id: productId, categoryId, companyId },
      select: { id: true },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const queuedCount = await preQueueProductGDriveFiles(productId, user.id)
    if (queuedCount > 0) {
      console.log(`Pre-queued ${queuedCount} GDrive files for deletion (product: ${productId})`)
    }

    await prisma.product.deleteMany({ where: { id: productId, categoryId, companyId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[products/[productId] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
