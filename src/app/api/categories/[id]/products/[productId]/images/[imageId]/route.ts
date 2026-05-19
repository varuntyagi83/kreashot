import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { deleteFile } from '@/lib/storage'

// PATCH /api/categories/[id]/products/[productId]/images/[imageId] - Set as primary
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; productId: string; imageId: string }>
  }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, productId, imageId } = await params

    // Verify image belongs to company's product
    const image = await prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
        product: { categoryId, companyId },
      },
      select: { id: true },
    })

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const updatedImage = await prisma.productImage.findUnique({ where: { id: imageId } })
    return NextResponse.json({ image: updatedImage })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/categories/[id]/products/[productId]/images/[imageId] - Delete image
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; productId: string; imageId: string }>
  }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, productId, imageId } = await params

    // Verify image belongs to company's product
    const image = await prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
        product: { categoryId, companyId },
      },
    })

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Delete from storage
    try {
      if (image.storageProvider === 'gdrive' && image.gdriveFileId) {
        await deleteFile(image.gdriveFileId, { provider: 'gdrive' })
      } else if (image.storagePath) {
        await deleteFile(image.storagePath, { provider: image.storageProvider as any })
      }
    } catch (storageError) {
      console.error('Storage deletion error:', storageError)
      // Continue with database cleanup even if storage deletion fails
    }

    // Delete from database
    await prisma.productImage.delete({ where: { id: imageId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[product images DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
