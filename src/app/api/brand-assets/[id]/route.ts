import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { deleteFile } from '@/lib/storage'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const asset = await prisma.brandAsset.findFirst({
      where: { id, companyId },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    return NextResponse.json({ asset })
  } catch (error: any) {
    console.error('[brand-assets/[id] GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
    console.log(`[audit] DELETE brand-asset ${id} by user ${user.id} at ${new Date().toISOString()}`)

    const asset = await prisma.brandAsset.findFirst({
      where: { id, companyId },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    // Delete from storage
    if (asset.storageProvider === 'gcs' && asset.storagePath) {
      try {
        await deleteFile(asset.storagePath, { provider: 'gcs' })
      } catch (e) {
        console.error('Failed to delete from GCS:', e)
      }
    } else if (asset.storageProvider === 'gdrive' && (asset.gdriveFileId || asset.storagePath)) {
      try {
        await deleteFile(asset.gdriveFileId || asset.storagePath!, { provider: 'gdrive' })
      } catch (e) {
        console.error('Failed to delete from GDrive:', e)
      }
    }

    // Delete asset_references entries
    await prisma.assetReference.deleteMany({
      where: { assetTableId: id, companyId, assetType: 'brand_asset' },
    })

    await prisma.brandAsset.delete({ where: { id } })

    return NextResponse.json({ message: 'Asset deleted successfully' })
  } catch (error: any) {
    console.error('[brand-assets/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
