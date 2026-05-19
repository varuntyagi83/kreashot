import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { deleteFile } from '@/lib/storage'

/**
 * DELETE /api/categories/[id]/final-assets/[assetId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, assetId } = await params

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const asset = await prisma.finalAsset.findFirst({
      where: { id: assetId, categoryId, companyId },
      select: { id: true, gdriveFileId: true, storagePath: true, storageProvider: true },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Final asset not found' }, { status: 404 })
    }

    const provider = asset.storageProvider || 'gdrive'
    if (provider === 'gdrive' && (asset.gdriveFileId || asset.storagePath)) {
      try {
        await deleteFile(asset.gdriveFileId || asset.storagePath!, { provider: 'gdrive' })
      } catch (e) {
        console.error('Failed to delete final asset from GDrive:', e)
      }
    } else if (provider === 'gcs' && asset.storagePath) {
      try {
        await deleteFile(asset.storagePath, { provider: 'gcs' })
      } catch (e) {
        console.error('Failed to delete final asset from GCS:', e)
      }
    }

    await prisma.finalAsset.delete({ where: { id: assetId } })

    return NextResponse.json({ message: 'Final asset deleted successfully' })
  } catch (error) {
    console.error('Error deleting final asset:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
