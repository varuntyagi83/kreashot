import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    // Optional format filter — when provided, counts reflect only that format
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || undefined

    const category = await prisma.category.findFirst({
      where: { id, companyId },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const [
      productsCount,
      angledShotsCount,
      backgroundsCount,
      compositesCount,
      copyDocsCount,
      guidelinesCount,
      finalAssetsCount,
    ] = await Promise.all([
      prisma.product.count({ where: { categoryId: id } }),
      prisma.angledShot.count({ where: { categoryId: id, ...(format ? { format } : {}) } }),
      prisma.background.count({ where: { categoryId: id, ...(format ? { format } : {}) } }),
      prisma.composite.count({ where: { categoryId: id, ...(format ? { format } : {}) } }),
      prisma.copyDoc.count({ where: { categoryId: id } }),
      prisma.guideline.count({ where: { categoryId: id } }),
      prisma.finalAsset.count({ where: { categoryId: id, ...(format ? { format } : {}) } }),
    ])

    return NextResponse.json({
      category: {
        ...category,
        look_and_feel: category.lookAndFeel,
        brand_guidelines: category.brandGuidelines,
        brand_voice: (() => {
          if (!category.brandVoice) return null
          try { return typeof category.brandVoice === 'string' ? JSON.parse(category.brandVoice) : category.brandVoice } catch { return null }
        })(),
        created_at: category.createdAt,
        updated_at: category.updatedAt,
        counts: {
          products: productsCount,
          angled_shots: angledShotsCount,
          backgrounds: backgroundsCount,
          composites: compositesCount,
          copy_docs: copyDocsCount,
          guidelines: guidelinesCount,
          final_assets: finalAssetsCount,
        },
      },
    })
  } catch (error: any) {
    console.error('[categories/[id] GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const body = await request.json()
    const { name, description, look_and_feel } = body

    if (name !== undefined && name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }
    if (description !== undefined && description.length > 500) {
      return NextResponse.json({ error: 'description must be 500 characters or fewer' }, { status: 400 })
    }
    if (look_and_feel !== undefined && look_and_feel.length > 10000) {
      return NextResponse.json({ error: 'look_and_feel must be 10000 characters or fewer' }, { status: 400 })
    }

    const updateData: any = {}
    if (name !== undefined) {
      updateData.name = name
      updateData.slug = generateSlug(name)
    }
    if (description !== undefined) updateData.description = description
    if (look_and_feel !== undefined) updateData.lookAndFeel = look_and_feel

    const result = await prisma.category.updateMany({
      where: { id, companyId },
      data: updateData,
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const category = await prisma.category.findFirst({ where: { id, companyId } })

    return NextResponse.json({ category })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 409 }
      )
    }
    console.error('[categories/[id] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Helper: collect all GDrive file IDs from child tables before cascade delete.
 * Returns the count of files queued for deletion.
 */
async function preQueueGDriveFiles(categoryId: string, userId: string): Promise<number> {
  let queued = 0

  // Tables with gdrive_file_id that reference category_id
  const tableQueries: Array<{ resourceType: string; items: Array<{ id: string; storageProvider: string | null; storagePath: string | null; gdriveFileId: string | null; storageUrl: string | null }> }> = []

  const [backgrounds, angledShots, composites, finalAssets, templates, guidelines, collages] = await Promise.all([
    prisma.background.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
    prisma.angledShot.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
    prisma.composite.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
    prisma.finalAsset.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
    prisma.template.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
    prisma.guideline.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
    prisma.collage.findMany({
      where: { categoryId, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true },
      take: 1000,
    }),
  ])

  tableQueries.push(
    { resourceType: 'background', items: backgrounds },
    { resourceType: 'angled_shot', items: angledShots },
    { resourceType: 'composite', items: composites },
    { resourceType: 'final_asset', items: finalAssets },
    { resourceType: 'template', items: templates },
    { resourceType: 'guideline', items: guidelines },
    { resourceType: 'collage', items: collages },
  )

  for (const { resourceType, items } of tableQueries) {
    if (items.length === 0) continue
    try {
      await prisma.deletionQueue.createMany({
        data: items.map((row) => ({
          resourceType,
          resourceId: row.id,
          storageProvider: 'gdrive',
          storagePath: row.storagePath ?? '',
          gdriveFileId: row.gdriveFileId,
          storageUrl: row.storageUrl ?? '',
          userId,
          metadata: { category_id: categoryId, pre_queued: true },
        })),
        skipDuplicates: true,
      })
      queued += items.length
    } catch (err: any) {
      console.error(`Failed to pre-queue ${resourceType} deletions:`, err.message)
    }
  }

  // Also handle product_images (linked via products -> category)
  const products = await prisma.product.findMany({
    where: { categoryId },
    select: { id: true },
    take: 1000,
  })

  if (products.length > 0) {
    const productIds = products.map((p) => p.id)
    const images = await prisma.productImage.findMany({
      where: { productId: { in: productIds }, storageProvider: 'gdrive', gdriveFileId: { not: null } },
      select: { id: true, storageProvider: true, storagePath: true, gdriveFileId: true, storageUrl: true, userId: true },
      take: 1000,
    })

    if (images.length > 0) {
      try {
        await prisma.deletionQueue.createMany({
          data: images.map((img) => ({
            resourceType: 'product_image',
            resourceId: img.id,
            storageProvider: 'gdrive',
            storagePath: img.storagePath,
            gdriveFileId: img.gdriveFileId,
            storageUrl: img.storageUrl,
            userId: img.userId || userId,
            metadata: { category_id: categoryId, pre_queued: true },
          })),
          skipDuplicates: true,
        })
        queued += images.length
      } catch (err: any) {
        console.error('Failed to pre-queue product_images deletions:', err.message)
      }
    }
  }

  return queued
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }
    console.log(`[audit] DELETE category ${id} by user ${user.id} at ${new Date().toISOString()}`)

    // Verify category belongs to company before proceeding
    const category = await prisma.category.findFirst({
      where: { id, companyId },
      select: { id: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Pre-queue all GDrive files for deletion BEFORE cascade delete
    const queuedCount = await preQueueGDriveFiles(id, user.id)
    if (queuedCount > 0) {
      console.log(`Pre-queued ${queuedCount} GDrive files for deletion (category: ${id})`)
    }

    // Delete category (cascade will handle related data)
    await prisma.category.delete({ where: { id } })

    return NextResponse.json({ message: 'Category deleted successfully' })
  } catch (error: any) {
    console.error('[categories/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
