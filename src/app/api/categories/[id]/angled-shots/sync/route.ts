import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { getStorageAdapter } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * POST /api/categories/[id]/angled-shots/sync
 * Reconciles angled shots between Google Drive and the database
 * - Deletes orphaned DB records (where Google Drive file doesn't exist)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId } = await params

    const rateLimit = await checkRateLimit(`angled-shots-sync:${companyId}`, 3, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before syncing again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    // Verify category belongs to company
    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const { dryRun = true } = body

    console.log(`Starting sync for category: ${category.name} (dry run: ${dryRun})`)

    const angledShots = await prisma.angledShot.findMany({
      where: { categoryId, companyId },
      select: { id: true, storagePath: true, storageProvider: true, gdriveFileId: true, angleName: true, productId: true },
    })

    if (!angledShots || angledShots.length === 0) {
      return NextResponse.json({
        message: 'No angled shots found for this category',
        stats: { total: 0, orphanedRecords: 0, deleted: 0 },
      })
    }

    const storage = getStorageAdapter('gdrive')
    const orphanedRecords = []
    const validRecords = []

    for (const shot of angledShots) {
      try {
        const fileIdentifier =
          shot.storageProvider === 'gdrive' && shot.gdriveFileId
            ? shot.gdriveFileId
            : shot.storagePath

        const exists = await storage.exists(fileIdentifier || '')

        if (!exists) {
          console.log(`   Orphaned record: ${shot.angleName} (ID: ${shot.id})`)
          orphanedRecords.push(shot)
        } else {
          validRecords.push(shot)
        }
      } catch (error) {
        console.error(`Error checking file ${shot.id}:`, error)
        orphanedRecords.push(shot)
      }
    }

    let deletedCount = 0
    if (!dryRun && orphanedRecords.length > 0) {
      const idsToDelete = orphanedRecords.map((r) => r.id)

      await prisma.angledShot.deleteMany({
        where: { id: { in: idsToDelete }, companyId },
      })
      deletedCount = idsToDelete.length
      console.log(`   Deleted ${deletedCount} orphaned records`)
    }

    return NextResponse.json({
      message: dryRun
        ? 'Sync analysis complete (dry run - no changes made)'
        : `Sync complete - deleted ${deletedCount} orphaned records`,
      category: { id: category.id, name: category.name },
      stats: {
        total: angledShots.length,
        valid: validRecords.length,
        orphanedRecords: orphanedRecords.length,
        deleted: deletedCount,
      },
      orphanedRecords: orphanedRecords.map((r) => ({
        id: r.id,
        angle_name: r.angleName,
        product_id: r.productId,
        storage_path: r.storagePath,
        gdrive_file_id: r.gdriveFileId,
      })),
      nextSteps: dryRun
        ? ['Review the orphaned records above', 'Run again with { "dryRun": false } to delete them']
        : ['Orphaned DB records have been deleted', 'Google Drive files (if any) are preserved'],
    })
  } catch (error) {
    console.error('Error during sync:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
