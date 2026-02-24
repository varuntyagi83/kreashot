/**
 * Manually verify storage sync between Google Drive and Supabase
 * Checks if files in database still exist in Google Drive
 * Deletes orphaned records
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

const TABLES = [
  'backgrounds',
  'angled_shots',
  'composites',
  'templates',
  'guidelines',
  'final_assets',
  'copy_docs'
]

async function verifySync() {
  console.log('🔍 Storage Sync Verification\n')
  console.log('='.repeat(60))
  console.log('Checking if database files still exist in Google Drive...\n')

  const results = {}

  try {
    for (const table of TABLES) {
      console.log(`\n📊 Checking ${table}...`)

      // Get all records with gdrive_file_id
      const records = await sql`
        SELECT id, gdrive_file_id, storage_path
        FROM ${sql(table)}
        WHERE storage_provider = 'gdrive'
        AND gdrive_file_id IS NOT NULL
      `

      if (records.length === 0) {
        console.log(`   ✓ No records to check`)
        results[table] = { total: 0, orphaned: 0, deleted: 0 }
        continue
      }

      console.log(`   Found ${records.length} records to verify`)

      const orphanedIds = []

      // Check each file
      for (let i = 0; i < records.length; i++) {
        const record = records[i]

        try {
          // Try to get file from Google Drive
          const response = await drive.files.get({
            fileId: record.gdrive_file_id,
            fields: 'id, trashed',
            supportsAllDrives: true
          })

          // Check if file is trashed
          if (response.data.trashed) {
            console.log(`   🗑️  Trashed: ${record.storage_path}`)
            orphanedIds.push(record.id)
          } else {
            // File exists and not trashed
            if (i % 10 === 0 && i > 0) {
              console.log(`   ✓ Verified ${i}/${records.length}...`)
            }
          }

        } catch (error) {
          // File not found
          if (error.code === 404 || error.message?.includes('not found')) {
            console.log(`   🗑️  Not found: ${record.storage_path}`)
            orphanedIds.push(record.id)
          } else {
            console.error(`   ⚠️  Error: ${error.message}`)
          }
        }

        // Rate limiting
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // Delete orphaned records
      let deletedCount = 0
      if (orphanedIds.length > 0) {
        console.log(`\n   🗑️  Deleting ${orphanedIds.length} orphaned records...`)

        const deleted = await sql`
          DELETE FROM ${sql(table)}
          WHERE id = ANY(${orphanedIds})
          RETURNING id
        `

        deletedCount = deleted.length
        console.log(`   ✅ Deleted ${deletedCount} orphaned records`)
      } else {
        console.log(`   ✅ All records verified (no orphaned records)`)
      }

      results[table] = {
        total: records.length,
        orphaned: orphanedIds.length,
        deleted: deletedCount
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))

    const totalChecked = Object.values(results).reduce((sum, r) => sum + r.total, 0)
    const totalOrphaned = Object.values(results).reduce((sum, r) => sum + r.orphaned, 0)
    const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0)

    console.log(`\nTotal checked: ${totalChecked}`)
    console.log(`Orphaned found: ${totalOrphaned}`)
    console.log(`Deleted: ${totalDeleted}`)

    console.log('\n📋 Details by table:')
    Object.entries(results).forEach(([table, stats]) => {
      if (stats.total > 0) {
        console.log(`   ${table}: ${stats.total} checked, ${stats.orphaned} orphaned, ${stats.deleted} deleted`)
      }
    })

    console.log('\n✅ Sync verification complete!')

    return totalOrphaned === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

verifySync().then(exitCode => {
  process.exit(exitCode)
})
