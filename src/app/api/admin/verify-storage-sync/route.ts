import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/verify-storage-sync
 * Verifies files in DB still exist in Google Drive, deletes orphaned records.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Starting storage sync verification...')

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })

    type TableInfo = {
      records: Array<{ id: string; gdriveFileId: string | null; storagePath: string | null }>
      deleteMany: (ids: string[]) => Promise<void>
    }

    const tableData: Record<string, TableInfo> = {
      backgrounds: {
        records: await prisma.background.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, storagePath: true } }),
        deleteMany: (ids) => prisma.background.deleteMany({ where: { id: { in: ids } } }).then(() => {}),
      },
      angled_shots: {
        records: await prisma.angledShot.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, storagePath: true } }),
        deleteMany: (ids) => prisma.angledShot.deleteMany({ where: { id: { in: ids } } }).then(() => {}),
      },
      composites: {
        records: await prisma.composite.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, storagePath: true } }),
        deleteMany: (ids) => prisma.composite.deleteMany({ where: { id: { in: ids } } }).then(() => {}),
      },
      templates: {
        records: await prisma.template.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, storagePath: true } }),
        deleteMany: (ids) => prisma.template.deleteMany({ where: { id: { in: ids } } }).then(() => {}),
      },
      guidelines: {
        records: await prisma.guideline.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, storagePath: true } }),
        deleteMany: (ids) => prisma.guideline.deleteMany({ where: { id: { in: ids } } }).then(() => {}),
      },
      final_assets: {
        records: await prisma.finalAsset.findMany({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } }, select: { id: true, gdriveFileId: true, storagePath: true } }),
        deleteMany: (ids) => prisma.finalAsset.deleteMany({ where: { id: { in: ids } } }).then(() => {}),
      },
    }

    const results: Record<string, { total: number; orphaned: number; deleted: number }> = {}

    for (const [tableName, info] of Object.entries(tableData)) {
      const { records, deleteMany } = info
      console.log(`\nChecking ${tableName}: ${records.length} records`)

      if (records.length === 0) {
        results[tableName] = { total: 0, orphaned: 0, deleted: 0 }
        continue
      }

      const orphanedIds: string[] = []

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        try {
          const response = await drive.files.get({
            fileId: record.gdriveFileId!,
            fields: 'id, trashed',
            supportsAllDrives: true,
          })
          if (response.data.trashed) {
            orphanedIds.push(record.id)
          }
        } catch (error: any) {
          if (error.code === 404 || error.message?.includes('not found')) {
            orphanedIds.push(record.id)
          } else {
            console.error(`Error checking ${record.gdriveFileId}:`, error.message)
          }
        }
        if (i % 10 === 0 && i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      let deletedCount = 0
      if (orphanedIds.length > 0) {
        try {
          await deleteMany(orphanedIds)
          deletedCount = orphanedIds.length
          console.log(`Deleted ${deletedCount} orphaned records from ${tableName}`)
        } catch (e: any) {
          console.error(`Error deleting orphaned records from ${tableName}:`, e.message)
        }
      }

      results[tableName] = { total: records.length, orphaned: orphanedIds.length, deleted: deletedCount }
    }

    const totalChecked = Object.values(results).reduce((sum, r) => sum + r.total, 0)
    const totalOrphaned = Object.values(results).reduce((sum, r) => sum + r.orphaned, 0)
    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0)

    return NextResponse.json({
      message: 'Storage sync verification complete',
      summary: { totalChecked, totalOrphaned, totalDeleted },
      details: results,
    })
  } catch (error: any) {
    console.error('Error verifying storage sync:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/admin/verify-storage-sync
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [backgrounds, angledShots, composites, templates, guidelines, finalAssets] = await Promise.all([
      prisma.background.count({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } } }),
      prisma.angledShot.count({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } } }),
      prisma.composite.count({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } } }),
      prisma.template.count({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } } }),
      prisma.guideline.count({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } } }),
      prisma.finalAsset.count({ where: { storageProvider: 'gdrive', gdriveFileId: { not: null } } }),
    ])

    const counts = { backgrounds, angled_shots: angledShots, composites, templates, guidelines, final_assets: finalAssets }

    return NextResponse.json({
      message: 'Storage sync verification status',
      recordCounts: counts,
      totalRecords: Object.values(counts).reduce((sum, c) => sum + c, 0),
    })
  } catch (error: any) {
    console.error('Error getting sync status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
