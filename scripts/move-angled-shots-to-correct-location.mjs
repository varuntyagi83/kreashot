/**
 * Move angled shots to CORRECT location:
 * Gummy Bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/[format]/
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

const FORMATS = [
  { name: '1:1', dbFormat: '1:1' },
  { name: '16:9', dbFormat: '16:9' },
  { name: '9:16', dbFormat: '9:16' },
  { name: '4:5', dbFormat: '4:5' }
]

async function findFolder(name, parentId) {
  const response = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  return response.data.files?.[0]
}

async function createFolder(name, parentId) {
  const fileMetadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
    supportsAllDrives: true
  })

  return folder.data.id
}

async function findOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId)
  if (existing) {
    return existing.id
  }
  return await createFolder(name, parentId)
}

async function listFilesInFolder(folderId) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name, parents)',
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

async function moveToCorrectLocation() {
  console.log('🔧 Moving angled shots to CORRECT product-specific location\n')
  console.log('=' .repeat(70))

  try {
    // Get category
    const category = await sql`
      SELECT gdrive_folder_id, slug
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `
    const cat = category[0]
    console.log('Category:', cat.slug)
    console.log('Category Folder ID:', cat.gdrive_folder_id)

    // Navigate to correct location: vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/
    console.log('\n📂 Navigating to product-specific angled-shots folder...')

    const productFolder = await findFolder('vitamin-c-gummies', cat.gdrive_folder_id)
    if (!productFolder) {
      throw new Error('vitamin-c-gummies folder not found')
    }
    console.log('   ✓ Found: vitamin-c-gummies/', productFolder.id)

    const productImagesFolder = await findFolder('product-images', productFolder.id)
    if (!productImagesFolder) {
      throw new Error('product-images folder not found')
    }
    console.log('   ✓ Found: product-images/', productImagesFolder.id)

    const angledShotsFolder = await findFolder('vitamin-c-gummies-angled-shots', productImagesFolder.id)
    if (!angledShotsFolder) {
      throw new Error('vitamin-c-gummies-angled-shots folder not found')
    }
    console.log('   ✓ Found: vitamin-c-gummies-angled-shots/', angledShotsFolder.id)

    // Create format subfolders
    console.log('\n📁 Creating format subfolders...')
    const formatFolders = {}
    for (const format of FORMATS) {
      const folderId = await findOrCreateFolder(format.name, angledShotsFolder.id)
      formatFolders[format.name] = folderId
      console.log(`   ✓ ${format.name}/`, folderId)
    }

    // Move original 1:1 files into 1:1 subfolder
    console.log('\n📦 Moving original 1:1 files into 1:1/ subfolder...')
    const originalFiles = await listFilesInFolder(angledShotsFolder.id)
    console.log(`   Found ${originalFiles.length} files in root angled-shots folder`)

    for (const file of originalFiles) {
      console.log(`   → Moving: ${file.name}`)
      await moveFile(file.id, formatFolders['1:1'], angledShotsFolder.id)

      // Update database
      const oldPath = `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/${file.name}`
      const newPath = `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/1:1/${file.name}`

      await sql`
        UPDATE angled_shots
        SET storage_path = ${newPath}
        WHERE storage_path = ${oldPath}
      `
      console.log(`   ✓ Moved to 1:1/`)
    }

    // Move Gemini-generated files from wrong location
    console.log('\n📦 Moving Gemini-generated files from wrong location...')
    const wrongAngledShotsFolder = await findFolder('angled-shots', cat.gdrive_folder_id)
    if (wrongAngledShotsFolder) {
      console.log(`   Found wrong folder: angled-shots/ (${wrongAngledShotsFolder.id})`)
      const wrongFiles = await listFilesInFolder(wrongAngledShotsFolder.id)
      console.log(`   Found ${wrongFiles.length} files to move`)

      for (const file of wrongFiles) {
        // Determine format from filename
        let targetFormat = null
        if (file.name.includes('_16:9_')) {
          targetFormat = '16:9'
        } else if (file.name.includes('_9:16_')) {
          targetFormat = '9:16'
        } else if (file.name.includes('_4:5_')) {
          targetFormat = '4:5'
        } else {
          console.log(`   ⚠ Skipping unknown format: ${file.name}`)
          continue
        }

        console.log(`   → Moving [${targetFormat}]: ${file.name}`)
        await moveFile(file.id, formatFolders[targetFormat], wrongAngledShotsFolder.id)

        // Update database
        const oldPath = `gummy-bear/angled-shots/${file.name}`
        const newPath = `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/${targetFormat}/${file.name}`

        const updated = await sql`
          UPDATE angled_shots
          SET storage_path = ${newPath}
          WHERE storage_path = ${oldPath}
          RETURNING angle_name
        `

        if (updated.length > 0) {
          console.log(`   ✓ Moved to ${targetFormat}/`)
        }
      }

      // Delete wrong folder
      console.log('\n🗑️  Deleting wrong angled-shots folder...')
      await deleteFolder(wrongAngledShotsFolder.id)
      console.log('   ✓ Deleted')
    }

    // Verify final structure
    console.log('\n✅ Verifying final structure...')
    for (const format of FORMATS) {
      const files = await listFilesInFolder(formatFolders[format.name])
      console.log(`   ${format.name}/: ${files.length} files`)
    }

    // Verify database
    const dbCounts = await sql`
      SELECT format, COUNT(*) as count
      FROM angled_shots
      GROUP BY format
      ORDER BY format
    `
    console.log('\n📊 Database counts:')
    dbCounts.forEach(row => {
      console.log(`   ${row.format}: ${row.count} shots`)
    })

    console.log('\n' + '='.repeat(70))
    console.log('🎉 SUCCESS!')
    console.log('✅ All angled shots now in CORRECT location:')
    console.log('   Gummy Bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/[format]/')

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

moveToCorrectLocation().then(exitCode => {
  process.exit(exitCode)
})
