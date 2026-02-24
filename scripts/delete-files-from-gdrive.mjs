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

async function deleteFromGDrive() {
  console.log('🗑️  Deleting files from Google Drive\n')
  console.log('='.repeat(60))

  try {
    // Get files from deletion queue
    const queuedFiles = await sql`
      SELECT id, resource_type, gdrive_file_id, storage_path, metadata
      FROM deletion_queue
      WHERE resource_type = 'background'
      AND gdrive_file_id IS NOT NULL
      ORDER BY created_at DESC
    `

    console.log(`\n📋 Found ${queuedFiles.length} files queued for deletion\n`)

    if (queuedFiles.length === 0) {
      console.log('✅ No files to delete')
      return 0
    }

    const results = []

    for (const file of queuedFiles) {
      try {
        console.log(`🗑️  Deleting: ${file.storage_path}`)
        console.log(`   GDrive ID: ${file.gdrive_file_id}`)

        // Delete from Google Drive
        await drive.files.delete({
          fileId: file.gdrive_file_id,
          supportsAllDrives: true
        })

        console.log(`   ✅ Deleted from Google Drive`)

        // Remove from deletion queue
        await sql`
          DELETE FROM deletion_queue
          WHERE id = ${file.id}
        `

        console.log(`   ✅ Removed from deletion queue\n`)

        results.push({
          path: file.storage_path,
          success: true
        })

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}\n`)
        results.push({
          path: file.storage_path,
          success: false,
          error: error.message
        })
      }
    }

    // Summary
    console.log('='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))

    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    console.log(`✅ Successfully deleted: ${successful.length}/${results.length}`)
    successful.forEach(r => {
      console.log(`   - ${r.path}`)
    })

    if (failed.length > 0) {
      console.log(`\n❌ Failed: ${failed.length}/${results.length}`)
      failed.forEach(r => {
        console.log(`   - ${r.path}: ${r.error}`)
      })
    }

    console.log('\n🎉 Cleanup complete!')

    return failed.length === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

deleteFromGDrive().then(exitCode => {
  process.exit(exitCode)
})
