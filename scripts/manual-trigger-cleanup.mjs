/**
 * Manually trigger deletion queue processing
 * (Simulates the Vercel cron job for local development)
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

async function processQueue() {
  console.log('🔄 Manually Processing Deletion Queue\n')
  console.log('='.repeat(60))

  try {
    // Get pending deletions (limit 50 per batch)
    const pending = await sql`
      SELECT *
      FROM deletion_queue
      WHERE status = 'pending'
      AND retry_count < max_retries
      ORDER BY created_at ASC
      LIMIT 50
    `

    if (pending.length === 0) {
      console.log('\n✅ No pending deletions')
      return 0
    }

    console.log(`\n📋 Found ${pending.length} pending deletions\n`)

    let successCount = 0
    let failCount = 0

    for (const deletion of pending) {
      try {
        // Mark as processing
        await sql`
          UPDATE deletion_queue
          SET status = 'processing'
          WHERE id = ${deletion.id}
        `

        console.log(`🗑️  Deleting: ${deletion.storage_path}`)

        // Delete from Google Drive
        if (deletion.gdrive_file_id) {
          await drive.files.delete({
            fileId: deletion.gdrive_file_id,
            supportsAllDrives: true
          })
          console.log(`   ✅ Deleted (ID: ${deletion.gdrive_file_id})`)
        } else {
          console.log(`   ⚠️  No file ID, skipping`)
        }

        // Mark as completed
        await sql`
          UPDATE deletion_queue
          SET 
            status = 'completed',
            processed_at = NOW()
          WHERE id = ${deletion.id}
        `

        successCount++

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`)

        const newRetryCount = deletion.retry_count + 1
        const newStatus = newRetryCount >= deletion.max_retries ? 'failed' : 'pending'

        await sql`
          UPDATE deletion_queue
          SET 
            status = ${newStatus},
            error_message = ${error.message},
            retry_count = ${newRetryCount},
            processed_at = ${newStatus === 'failed' ? sql`NOW()` : null}
          WHERE id = ${deletion.id}
        `

        failCount++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Successful: ${successCount}`)
    console.log(`❌ Failed: ${failCount}`)

    // Check remaining
    const remaining = await sql`
      SELECT COUNT(*) as count
      FROM deletion_queue
      WHERE status = 'pending'
    `

    const remainingCount = parseInt(remaining[0].count)
    if (remainingCount > 0) {
      console.log(`\n⚠️  ${remainingCount} deletions still pending (run again to continue)`)
    } else {
      console.log('\n🎉 All deletions processed!')
    }

    return failCount === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

processQueue().then(exitCode => {
  process.exit(exitCode)
})
