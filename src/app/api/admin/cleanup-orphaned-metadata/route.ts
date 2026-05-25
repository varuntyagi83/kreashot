import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { google } from 'googleapis'

interface OrphanedRecord {
  id: string
  gdriveFileId: string
  displayName: string
}

interface TableStats {
  total: number
  valid: number
  orphaned: number
  deleted: number
  skipped: number
}

async function checkTableForOrphans<T extends { id: string; gdriveFileId: string | null; [key: string]: any }>(
  records: T[],
  displayField: string,
  drive: any,
  dryRun: boolean,
  deleteMany: (ids: string[]) => Promise<void>
): Promise<{ stats: TableStats; orphanedRecords: OrphanedRecord[] }> {
  if (!records || records.length === 0) {
    return {
      stats: { total: 0, valid: 0, orphaned: 0, deleted: 0, skipped: 0 },
      orphanedRecords: [],
    }
  }

  const orphanedRecords: OrphanedRecord[] = []
  let skippedCount = 0

  for (const record of records) {
    try {
      const response = await drive.files.get({
        fileId: record.gdriveFileId!,
        fields: 'id, trashed',
        supportsAllDrives: true,
      })
      if (response.data.trashed) {
        orphanedRecords.push({ id: record.id, gdriveFileId: record.gdriveFileId!, displayName: record[displayField] || 'Unknown' })
      }
    } catch (error: any) {
      if (error.code === 404 || error.status === 404) {
        orphanedRecords.push({ id: record.id, gdriveFileId: record.gdriveFileId!, displayName: record[displayField] || 'Unknown' })
      } else {
        console.error(`Error checking file ${record.gdriveFileId}:`, error.message)
        skippedCount++
      }
    }
  }

  const stats: TableStats = {
    total: records.length,
    valid: records.length - orphanedRecords.length - skippedCount,
    orphaned: orphanedRecords.length,
    deleted: 0,
    skipped: skippedCount,
  }

  if (!dryRun && orphanedRecords.length > 0) {
    await deleteMany(orphanedRecords.map((r) => r.id))
    stats.deleted = orphanedRecords.length
  }

  return { stats, orphanedRecords }
}

/**
 * POST /api/admin/cleanup-orphaned-metadata
 * Body: { dryRun: true } (optional, defaults to true)
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false

    const driveClientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
    const drivePrivateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY
    if (!driveClientEmail || !drivePrivateKey) {
      return NextResponse.json({ error: 'Google Drive credentials not configured' }, { status: 503 })
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: driveClientEmail,
        private_key: drivePrivateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })

    const drive = google.drive({ version: 'v3', auth })

    const [angledShots, productImages, backgrounds, composites] = await Promise.all([
      prisma.angledShot.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, angleName: true }, take: 500 }),
      prisma.productImage.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, fileName: true }, take: 500 }),
      prisma.background.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, name: true }, take: 500 }),
      prisma.composite.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, name: true }, take: 500 }),
    ])

    const [angledShotsResult, productImagesResult, backgroundsResult, compositesResult] = await Promise.all([
      checkTableForOrphans(angledShots as any, 'angleName', drive, dryRun, (ids) => prisma.angledShot.deleteMany({ where: { id: { in: ids } } }).then(() => {})),
      checkTableForOrphans(productImages as any, 'fileName', drive, dryRun, (ids) => prisma.productImage.deleteMany({ where: { id: { in: ids } } }).then(() => {})),
      checkTableForOrphans(backgrounds as any, 'name', drive, dryRun, (ids) => prisma.background.deleteMany({ where: { id: { in: ids } } }).then(() => {})),
      checkTableForOrphans(composites as any, 'name', drive, dryRun, (ids) => prisma.composite.deleteMany({ where: { id: { in: ids } } }).then(() => {})),
    ])

    const totalOrphaned = angledShotsResult.stats.orphaned + productImagesResult.stats.orphaned + backgroundsResult.stats.orphaned + compositesResult.stats.orphaned
    const totalDeleted = angledShotsResult.stats.deleted + productImagesResult.stats.deleted + backgroundsResult.stats.deleted + compositesResult.stats.deleted
    const totalSkipped = angledShotsResult.stats.skipped + productImagesResult.stats.skipped + backgroundsResult.stats.skipped + compositesResult.stats.skipped

    return NextResponse.json({
      message: dryRun
        ? `Dry run complete - ${totalOrphaned} records would be deleted`
        : `Cleanup complete - ${totalDeleted} records deleted`,
      dryRun,
      summary: { totalOrphaned, totalDeleted, totalSkipped },
      tables: {
        angled_shots: { stats: angledShotsResult.stats, orphanedRecords: angledShotsResult.orphanedRecords },
        product_images: { stats: productImagesResult.stats, orphanedRecords: productImagesResult.orphanedRecords },
        backgrounds: { stats: backgroundsResult.stats, orphanedRecords: backgroundsResult.orphanedRecords },
        composites: { stats: compositesResult.stats, orphanedRecords: compositesResult.orphanedRecords },
      },
    })
  } catch (error: any) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
