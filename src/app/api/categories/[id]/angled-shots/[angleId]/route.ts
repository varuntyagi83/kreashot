import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { deleteFile } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * DELETE /api/categories/[id]/angled-shots/[angleId]
 * Deletes an angled shot from storage and database
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; angleId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, angleId } = await params

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const angledShot = await prisma.angledShot.findFirst({
      where: { id: angleId, categoryId, companyId },
      select: { id: true, storagePath: true, storageProvider: true, gdriveFileId: true },
    })

    if (!angledShot) {
      return NextResponse.json({ error: 'Angled shot not found' }, { status: 404 })
    }

    // Delete from storage
    try {
      if (angledShot.storageProvider === 'gdrive' && angledShot.gdriveFileId) {
        await deleteFile(angledShot.gdriveFileId, { provider: 'gdrive' })
        console.log(`Deleted from Google Drive: ${angledShot.gdriveFileId}`)
      } else if (angledShot.storagePath) {
        await deleteFile(angledShot.storagePath, {
          provider: angledShot.storageProvider as any,
        })
        console.log(`Deleted using path: ${angledShot.storagePath}`)
      }
    } catch (storageError) {
      console.error('Storage deletion error:', storageError)
      // Continue anyway - database cleanup is more critical
    }

    await prisma.angledShot.delete({ where: { id: angleId } })

    return NextResponse.json({ message: 'Angled shot deleted successfully' })
  } catch (error) {
    console.error('Error deleting angled shot:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
