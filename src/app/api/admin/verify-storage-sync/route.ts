import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Mark route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic'

/**
 * Verify storage sync: Check if files in database still exist in Google Drive
 * Delete orphaned database records
 * POST /api/admin/verify-storage-sync
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔍 Starting storage sync verification...')

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize Google Drive
    const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL!
    const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(
      /\\n/g,
      '\n'
    )!

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: GOOGLE_DRIVE_PRIVATE_KEY,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })

    const tables = [
      'backgrounds',
      'angled_shots',
      'composites',
      'templates',
      'guidelines',
      'final_assets',
      'copy_docs',
    ]

    const results: Record<
      string,
      { total: number; orphaned: number; deleted: number }
    > = {}

    for (const table of tables) {
      try {
        console.log(`\n📊 Checking ${table}...`)

        // Get all records with gdrive_file_id
        const { data: records, error: fetchError } = await supabase
          .from(table)
          .select('id, gdrive_file_id, storage_path')
          .eq('storage_provider', 'gdrive')
          .not('gdrive_file_id', 'is', null)

        if (fetchError) {
          console.error(`   ❌ Error fetching ${table}:`, fetchError)
          results[table] = { total: 0, orphaned: 0, deleted: 0 }
          continue
        }

        if (!records || records.length === 0) {
          console.log(`   ✓ No records to check`)
          results[table] = { total: 0, orphaned: 0, deleted: 0 }
          continue
        }

        console.log(`   Found ${records.length} records to verify`)

        const orphanedIds: string[] = []

        // Check each file in batches to avoid rate limits
        for (let i = 0; i < records.length; i++) {
          const record = records[i]

          try {
            // Try to get file metadata from Google Drive
            const response = await drive.files.get({
              fileId: record.gdrive_file_id,
              fields: 'id, trashed',
              supportsAllDrives: true,
            })

            // Check if file is trashed
            if (response.data.trashed) {
              console.log(
                `   🗑️  Trashed: ${record.storage_path} (${record.gdrive_file_id})`
              )
              orphanedIds.push(record.id)
            }

            // File exists and not trashed, all good
          } catch (error: any) {
            // File not found (404) or other error
            if (error.code === 404 || error.message?.includes('not found')) {
              console.log(
                `   🗑️  Not found: ${record.storage_path} (${record.gdrive_file_id})`
              )
              orphanedIds.push(record.id)
            } else {
              console.error(`   ⚠️  Error checking ${record.gdrive_file_id}:`, error.message)
            }
          }

          // Rate limiting: wait 100ms between checks
          if (i % 10 === 0 && i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        }

        // Delete orphaned records
        let deletedCount = 0
        if (orphanedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .in('id', orphanedIds)

          if (deleteError) {
            console.error(`   ❌ Error deleting orphaned records:`, deleteError)
          } else {
            deletedCount = orphanedIds.length
            console.log(`   ✅ Deleted ${deletedCount} orphaned records`)
          }
        }

        results[table] = {
          total: records.length,
          orphaned: orphanedIds.length,
          deleted: deletedCount,
        }
      } catch (error: any) {
        console.error(`   ❌ Error processing ${table}:`, error.message)
        results[table] = { total: 0, orphaned: 0, deleted: 0 }
      }
    }

    // Summary
    const totalChecked = Object.values(results).reduce(
      (sum, r) => sum + r.total,
      0
    )
    const totalOrphaned = Object.values(results).reduce(
      (sum, r) => sum + r.orphaned,
      0
    )
    const totalDeleted = Object.values(results).reduce(
      (sum, r) => sum + r.deleted,
      0
    )

    console.log('\n✅ Storage sync verification complete')
    console.log(`   Total checked: ${totalChecked}`)
    console.log(`   Orphaned found: ${totalOrphaned}`)
    console.log(`   Deleted: ${totalDeleted}`)

    return NextResponse.json({
      message: 'Storage sync verification complete',
      summary: {
        totalChecked,
        totalOrphaned,
        totalDeleted,
      },
      details: results,
    })
  } catch (error: any) {
    console.error('Error verifying storage sync:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/verify-storage-sync
 * Get information about the sync verification job
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const tables = [
      'backgrounds',
      'angled_shots',
      'composites',
      'templates',
      'guidelines',
      'final_assets',
      'copy_docs',
    ]

    const counts: Record<string, number> = {}

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('storage_provider', 'gdrive')
        .not('gdrive_file_id', 'is', null)

      counts[table] = error ? 0 : count || 0
    }

    return NextResponse.json({
      message: 'Storage sync verification status',
      recordCounts: counts,
      totalRecords: Object.values(counts).reduce((sum, c) => sum + c, 0),
    })
  } catch (error: any) {
    console.error('Error getting sync status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
