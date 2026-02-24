import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

interface OrphanedRecord {
  id: string
  gdrive_file_id: string
  display_name: string
}

interface TableStats {
  total: number
  valid: number
  orphaned: number
  deleted: number
}

async function checkTableForOrphans(
  supabase: any,
  drive: any,
  tableName: string,
  displayNameField: string,
  dryRun: boolean
): Promise<{ stats: TableStats; orphanedRecords: OrphanedRecord[] }> {
  // Get all records with Google Drive files
  const { data: records, error: fetchError } = (await supabase
    .from(tableName)
    .select(`id, gdrive_file_id, storage_provider, ${displayNameField}`)
    .eq('storage_provider', 'gdrive')
    .not('gdrive_file_id', 'is', null)) as {
    data: Array<{
      id: string
      gdrive_file_id: string
      storage_provider: string
      [key: string]: any
    }> | null
    error: any
  }

  if (fetchError) {
    throw new Error(`Failed to fetch ${tableName}: ${fetchError.message}`)
  }

  if (!records || records.length === 0) {
    return {
      stats: { total: 0, valid: 0, orphaned: 0, deleted: 0 },
      orphanedRecords: [],
    }
  }

  const orphanedRecords: OrphanedRecord[] = []

  // Check each file
  for (const record of records) {
    try {
      const response = await drive.files.get({
        fileId: record.gdrive_file_id!,
        fields: 'id, trashed',
        supportsAllDrives: true,
      })

      // If file is trashed, mark as orphaned
      if (response.data.trashed) {
        orphanedRecords.push({
          id: record.id,
          gdrive_file_id: record.gdrive_file_id,
          display_name: record[displayNameField] || 'Unknown',
        })
      }
    } catch (error: any) {
      // File not found (404) or other errors - mark as orphaned
      if (error.code === 404 || error.status === 404) {
        orphanedRecords.push({
          id: record.id,
          gdrive_file_id: record.gdrive_file_id,
          display_name: record[displayNameField] || 'Unknown',
        })
      } else {
        console.error(`Error checking file ${record.gdrive_file_id}:`, error.message)
        // For other errors, also mark as orphaned to be safe
        orphanedRecords.push({
          id: record.id,
          gdrive_file_id: record.gdrive_file_id,
          display_name: record[displayNameField] || 'Unknown',
        })
      }
    }
  }

  const stats: TableStats = {
    total: records.length,
    valid: records.length - orphanedRecords.length,
    orphaned: orphanedRecords.length,
    deleted: 0,
  }

  // Delete orphaned records if not dry run
  if (!dryRun && orphanedRecords.length > 0) {
    const idsToDelete = orphanedRecords.map(r => r.id)

    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      throw new Error(`Failed to delete from ${tableName}: ${deleteError.message}`)
    }

    stats.deleted = orphanedRecords.length
  }

  return { stats, orphanedRecords }
}

/**
 * Admin endpoint to cleanup orphaned metadata
 * Removes Supabase records where Google Drive files are trashed or missing
 *
 * Usage:
 * POST /api/admin/cleanup-orphaned-metadata
 * Body: { dryRun: true } (optional, defaults to true)
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false // Default to true

    const supabase = await createServerSupabaseClient()

    // Initialize Google Drive
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })

    const drive = google.drive({ version: 'v3', auth })

    // Check all tables with storage sync
    const angledShotsResult = await checkTableForOrphans(
      supabase,
      drive,
      'angled_shots',
      'angle_name',
      dryRun
    )

    const productImagesResult = await checkTableForOrphans(
      supabase,
      drive,
      'product_images',
      'file_name',
      dryRun
    )

    const backgroundsResult = await checkTableForOrphans(
      supabase,
      drive,
      'backgrounds',
      'name',
      dryRun
    )

    const compositesResult = await checkTableForOrphans(
      supabase,
      drive,
      'composites',
      'name',
      dryRun
    )

    const totalOrphaned =
      angledShotsResult.stats.orphaned +
      productImagesResult.stats.orphaned +
      backgroundsResult.stats.orphaned +
      compositesResult.stats.orphaned
    const totalDeleted =
      angledShotsResult.stats.deleted +
      productImagesResult.stats.deleted +
      backgroundsResult.stats.deleted +
      compositesResult.stats.deleted

    return NextResponse.json({
      message: dryRun
        ? `Dry run complete - ${totalOrphaned} records would be deleted`
        : `Cleanup complete - ${totalDeleted} records deleted`,
      dryRun,
      summary: {
        totalOrphaned,
        totalDeleted,
      },
      tables: {
        angled_shots: {
          stats: angledShotsResult.stats,
          orphanedRecords: angledShotsResult.orphanedRecords,
        },
        product_images: {
          stats: productImagesResult.stats,
          orphanedRecords: productImagesResult.orphanedRecords,
        },
        backgrounds: {
          stats: backgroundsResult.stats,
          orphanedRecords: backgroundsResult.orphanedRecords,
        },
        composites: {
          stats: compositesResult.stats,
          orphanedRecords: compositesResult.orphanedRecords,
        },
      },
    })
  } catch (error: any) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
