/**
 * Clean up deletion queue for files already deleted from Google Drive
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function cleanupOrphaned() {
  console.log('🧹 Cleaning up orphaned deletion queue entries\n')
  console.log('='.repeat(60))

  try {
    // Mark all "file not found" errors as completed (files already deleted)
    const updated = await sql`
      UPDATE deletion_queue
      SET 
        status = 'completed',
        processed_at = NOW(),
        error_message = 'File already deleted from Google Drive'
      WHERE status IN ('pending', 'failed')
      AND (
        error_message LIKE '%File not found%'
        OR error_message LIKE '%not found%'
      )
      RETURNING id, storage_path
    `

    console.log(`\n✅ Marked ${updated.length} orphaned entries as completed\n`)
    
    updated.slice(0, 10).forEach(entry => {
      console.log(`   - ${entry.storage_path}`)
    })
    
    if (updated.length > 10) {
      console.log(`   ... and ${updated.length - 10} more`)
    }

    // Check remaining pending
    const remaining = await sql`
      SELECT COUNT(*) as count
      FROM deletion_queue
      WHERE status = 'pending'
    `

    console.log(`\n📊 Remaining pending: ${remaining[0].count}`)

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

cleanupOrphaned().then(exitCode => {
  process.exit(exitCode)
})
