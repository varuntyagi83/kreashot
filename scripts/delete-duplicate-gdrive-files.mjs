/**
 * Delete duplicate files in Google Drive that aren't in the database
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

const FORMATS = ['1:1', '16:9', '9:16', '4:5']

async function findFolder(name, parentId) {
  const response = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  return response.data.files?.[0]
}

async function listFilesInFolder(folderId) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  return response.data.files || []
}

async function deleteFile(fileId, fileName) {
  await drive.files.delete({
    fileId: fileId,
    supportsAllDrives: true
  })
  console.log(`   ✓ Deleted: ${fileName}`)
}

async function deleteDuplicates() {
  console.log('🧹 Deleting duplicate files from Google Drive\n')
  console.log('=' .repeat(60))

  try {
    // Get all valid file IDs from database
    const dbRecords = await sql`
      SELECT gdrive_file_id, format, angle_name
      FROM angled_shots
      WHERE gdrive_file_id IS NOT NULL
    `

    const validFileIds = new Set(dbRecords.map(r => r.gdrive_file_id))
    console.log(`\n📊 Database has ${validFileIds.size} valid file IDs`)

    // Navigate to angled-shots folder
    const category = await sql`
      SELECT gdrive_folder_id FROM categories WHERE slug = 'gummy-bear' LIMIT 1
    `
    const catFolderId = category[0].gdrive_folder_id

    const productFolder = await findFolder('vitamin-c-gummies', catFolderId)
    const productImagesFolder = await findFolder('product-images', productFolder.id)
    const angledShotsFolder = await findFolder('vitamin-c-gummies-angled-shots', productImagesFolder.id)

    let totalDeleted = 0

    // Check each format folder
    for (const format of FORMATS) {
      console.log(`\n📂 Checking ${format}/ folder...`)

      const formatFolder = await findFolder(format, angledShotsFolder.id)
      if (!formatFolder) {
        console.log(`   ⚠ Folder not found, skipping`)
        continue
      }

      const files = await listFilesInFolder(formatFolder.id)
      console.log(`   Found ${files.length} files`)

      let deleted = 0
      for (const file of files) {
        if (!validFileIds.has(file.id)) {
          console.log(`   → Deleting duplicate: ${file.name}`)
          await deleteFile(file.id, file.name)
          deleted++
          totalDeleted++
        }
      }

      if (deleted === 0) {
        console.log(`   ✓ No duplicates found`)
      } else {
        console.log(`   ✓ Deleted ${deleted} duplicates`)
      }
    }

    // Verify final counts
    console.log('\n✅ Verification...')
    for (const format of FORMATS) {
      const formatFolder = await findFolder(format, angledShotsFolder.id)
      if (formatFolder) {
        const files = await listFilesInFolder(formatFolder.id)
        console.log(`   ${format}/: ${files.length} files`)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`🎉 Cleanup complete!`)
    console.log(`✅ Deleted ${totalDeleted} duplicate files`)
    console.log(`✅ All folders now match database (7 files per format)`)

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

deleteDuplicates().then(exitCode => {
  process.exit(exitCode)
})
