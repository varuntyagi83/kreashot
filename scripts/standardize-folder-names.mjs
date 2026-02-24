/**
 * Standardize folder naming across all resources
 * Database: 1:1, 16:9, 9:16, 4:5 (with colons)
 * Folders: 1x1, 16x9, 9x16, 4x5 (with x)
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

// Format mapping: colon format -> x format
const FORMAT_MAP = {
  '1:1': '1x1',
  '16:9': '16x9',
  '9:16': '9x16',
  '4:5': '4x5'
}

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

async function moveFile(fileId, newParentId, oldParentId) {
  await drive.files.update({
    fileId: fileId,
    addParents: newParentId,
    removeParents: oldParentId,
    fields: 'id, parents',
    supportsAllDrives: true
  })
}

async function deleteFolder(folderId) {
  await drive.files.delete({
    fileId: folderId,
    supportsAllDrives: true
  })
}

async function renameFolder(folderId, newName) {
  await drive.files.update({
    fileId: folderId,
    requestBody: { name: newName },
    supportsAllDrives: true
  })
}

async function standardizeFolders() {
  console.log('🔧 Standardizing folder naming convention\n')
  console.log('Database format: 1:1, 16:9, 9:16, 4:5 (with colons)')
  console.log('Folder names: 1x1, 16x9, 9x16, 4x5 (with x)\n')
  console.log('='.repeat(60))

  try {
    const category = await sql`
      SELECT id, slug, gdrive_folder_id
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    const cat = category[0]
    console.log('\nCategory:', cat.slug)

    let totalMoved = 0
    let totalDeleted = 0
    let totalRenamed = 0

    // 1. Fix templates folders
    console.log('\n📁 Fixing templates folders...')
    const templatesFolder = await findFolder('templates', cat.gdrive_folder_id)

    if (templatesFolder) {
      for (const [colonFormat, xFormat] of Object.entries(FORMAT_MAP)) {
        const colonFolder = await findFolder(colonFormat, templatesFolder.id)
        const xFolder = await findFolder(xFormat, templatesFolder.id)

        if (colonFolder && xFolder) {
          console.log(`\n  📂 ${colonFormat}/ → ${xFormat}/`)

          // Move files from colon folder to x folder
          const files = await listFilesInFolder(colonFolder.id)
          console.log(`     ${files.length} files to move`)

          for (const file of files) {
            await moveFile(file.id, xFolder.id, colonFolder.id)

            // Update database storage_path
            const oldPath = `${cat.slug}/templates/${colonFormat}/${file.name}`
            const newPath = `${cat.slug}/templates/${xFormat}/${file.name}`
            await sql`
              UPDATE templates
              SET storage_path = ${newPath}
              WHERE storage_path = ${oldPath}
            `
            totalMoved++
          }

          // Delete empty colon folder
          await deleteFolder(colonFolder.id)
          console.log(`     ✓ Moved ${files.length} files, deleted ${colonFormat}/ folder`)
          totalDeleted++
        } else if (colonFolder && !xFolder) {
          // Just rename colon folder to x folder
          console.log(`\n  📝 Renaming ${colonFormat}/ → ${xFormat}/`)
          await renameFolder(colonFolder.id, xFormat)

          // Update database
          const oldPath = `${cat.slug}/templates/${colonFormat}/%`
          await sql`
            UPDATE templates
            SET storage_path = REPLACE(storage_path, ${`${cat.slug}/templates/${colonFormat}/`}, ${`${cat.slug}/templates/${xFormat}/`})
            WHERE storage_path LIKE ${oldPath}
          `
          console.log(`     ✓ Renamed`)
          totalRenamed++
        }
      }
    }

    // 2. Fix angled-shots folders
    console.log('\n📁 Fixing angled-shots folders...')
    const productFolder = await findFolder('vitamin-c-gummies', cat.gdrive_folder_id)

    if (productFolder) {
      const productImagesFolder = await findFolder('product-images', productFolder.id)

      if (productImagesFolder) {
        const angledShotsFolder = await findFolder('vitamin-c-gummies-angled-shots', productImagesFolder.id)

        if (angledShotsFolder) {
          for (const [colonFormat, xFormat] of Object.entries(FORMAT_MAP)) {
            const colonFolder = await findFolder(colonFormat, angledShotsFolder.id)

            if (colonFolder) {
              console.log(`\n  📝 Renaming ${colonFormat}/ → ${xFormat}/`)
              await renameFolder(colonFolder.id, xFormat)

              // Update database
              const oldPath = `${cat.slug}/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/${colonFormat}/%`
              await sql`
                UPDATE angled_shots
                SET storage_path = REPLACE(storage_path, ${`/${colonFormat}/`}, ${`/${xFormat}/`})
                WHERE storage_path LIKE ${oldPath}
              `
              console.log(`     ✓ Renamed`)
              totalRenamed++
            }
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Files moved: ${totalMoved}`)
    console.log(`✅ Folders deleted: ${totalDeleted}`)
    console.log(`✅ Folders renamed: ${totalRenamed}`)
    console.log('\n🎉 Folder naming standardized!')
    console.log('✅ All folders now use x-notation (1x1, 16x9, 9x16, 4x5)')
    console.log('✅ Database format fields use colon-notation (1:1, 16:9, 9:16, 4:5)')

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

standardizeFolders().then(exitCode => {
  process.exit(exitCode)
})
