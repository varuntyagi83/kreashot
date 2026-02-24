/**
 * Fix Google Drive folder structure for angled shots
 *
 * WRONG (current):
 *   gummy-bear/angled-shots/1x1/
 *   gummy-bear/angled-shots/16x9/
 *   gummy-bear/angled-shots/9x16/
 *   gummy-bear/angled-shots/4x5/
 *
 * CORRECT (target):
 *   gummy-bear/angled-shots/  (all files here, no subfolders)
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

async function getCategoryFolder() {
  const category = await sql`
    SELECT gdrive_folder_id, slug
    FROM categories
    WHERE slug = 'gummy-bear'
    LIMIT 1
  `

  if (!category || !category[0]) {
    throw new Error('Gummy Bear category not found')
  }

  return category[0]
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
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, parents, mimeType)',
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

async function fixStructure() {
  console.log('🔧 Fixing Google Drive folder structure for angled shots\n')
  console.log('=' .repeat(60))

  try {
    // Get category folder
    const category = await getCategoryFolder()
    console.log('Category:', category.slug)
    console.log('Google Drive Folder:', category.gdrive_folder_id)

    // Find angled-shots folder
    const angledShotsFolder = await findFolder('angled-shots', category.gdrive_folder_id)
    if (!angledShotsFolder) {
      throw new Error('angled-shots folder not found')
    }
    console.log('Angled Shots Folder:', angledShotsFolder.id)

    // Find format subfolders (use actual folder names with colons)
    const formatFolders = ['1x1', '16:9', '9:16', '4:5']
    const foldersToDelete = []
    let totalMoved = 0

    for (const formatName of formatFolders) {
      console.log(`\n📂 Processing ${formatName} subfolder...`)

      const formatFolder = await findFolder(formatName, angledShotsFolder.id)
      if (!formatFolder) {
        console.log(`   ⚠ ${formatName} folder not found, skipping`)
        continue
      }

      console.log(`   Found folder: ${formatFolder.id}`)

      // List all files in this format folder
      const files = await listFilesInFolder(formatFolder.id)
      console.log(`   Files to move: ${files.length}`)

      // Move each file to parent angled-shots folder
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          console.log(`   Skipping subfolder: ${file.name}`)
          continue
        }

        console.log(`   → Moving: ${file.name}`)
        await moveFile(file.id, angledShotsFolder.id, formatFolder.id)

        // Update database storage_path
        const oldPath = `${category.slug}/angled-shots/${formatName}/${file.name}`
        const newPath = `${category.slug}/angled-shots/${file.name}`

        const updated = await sql`
          UPDATE angled_shots
          SET storage_path = ${newPath}
          WHERE storage_path = ${oldPath}
          RETURNING id, angle_name
        `

        if (updated.length > 0) {
          console.log(`   ✓ Updated database: ${updated[0].angle_name}`)
        }

        totalMoved++
      }

      // Mark folder for deletion
      foldersToDelete.push({ id: formatFolder.id, name: formatName })
    }

    // Delete empty format subfolders
    console.log(`\n🗑️  Deleting empty format subfolders...`)
    for (const folder of foldersToDelete) {
      console.log(`   → Deleting: ${folder.name}`)
      await deleteFolder(folder.id)
      console.log(`   ✓ Deleted`)
    }

    // Verify final structure
    console.log(`\n✅ Verification...`)
    const finalFiles = await listFilesInFolder(angledShotsFolder.id)
    const imageFiles = finalFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
    const subfolders = finalFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder')

    console.log(`   Images in angled-shots/: ${imageFiles.length}`)
    console.log(`   Subfolders remaining: ${subfolders.length}`)

    if (subfolders.length > 0) {
      console.log(`   ⚠ Warning: Found unexpected subfolders:`)
      subfolders.forEach(f => console.log(`     - ${f.name}`))
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Files moved to angled-shots/: ${totalMoved}`)
    console.log(`✅ Format subfolders deleted: ${foldersToDelete.length}`)
    console.log(`✅ Total images in angled-shots/: ${imageFiles.length}`)
    console.log('\n🎉 Folder structure fixed!')
    console.log('✅ All angled shots now in: gummy-bear/angled-shots/')
    console.log('✅ No format-specific subfolders')

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

fixStructure().then(exitCode => {
  process.exit(exitCode)
})
