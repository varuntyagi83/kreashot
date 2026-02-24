/**
 * Create format-specific subfolders in backgrounds/ folder
 * Folder structure: backgrounds/1x1/, backgrounds/16x9/, backgrounds/9x16/, backgrounds/4x5/
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

// Format folders to create (x-notation for filesystem)
const FORMAT_FOLDERS = ['1x1', '16x9', '9x16', '4x5']

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
  const response = await drive.files.create({
    requestBody: {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id, name',
    supportsAllDrives: true
  })
  return response.data
}

async function findOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId)
  if (existing) {
    console.log(`   ✓ Found existing folder: ${name}`)
    return existing.id
  }
  const created = await createFolder(name, parentId)
  console.log(`   ✅ Created folder: ${name}`)
  return created.id
}

async function setupBackgroundsFolders() {
  console.log('🗂️  Setting up backgrounds/ format folders\n')
  console.log('='.repeat(60))

  try {
    // Get category from database
    const category = await sql`
      SELECT id, slug, gdrive_folder_id
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    const cat = category[0]
    console.log('\n📂 Category:', cat.slug)
    console.log('   Google Drive ID:', cat.gdrive_folder_id)

    // Find backgrounds folder
    console.log('\n📁 Finding backgrounds folder...')
    const backgroundsFolder = await findFolder('backgrounds', cat.gdrive_folder_id)

    if (!backgroundsFolder) {
      console.error('❌ backgrounds/ folder not found')
      console.log('   Creating backgrounds/ folder first...')
      const newBackgroundsFolder = await createFolder('backgrounds', cat.gdrive_folder_id)
      console.log('   ✅ Created backgrounds/ folder')

      // Create format subfolders
      console.log('\n📁 Creating format subfolders...')
      for (const format of FORMAT_FOLDERS) {
        await findOrCreateFolder(format, newBackgroundsFolder.id)
      }
    } else {
      console.log('   ✓ Found backgrounds/ folder')

      // Create format subfolders
      console.log('\n📁 Creating format subfolders in backgrounds/...')
      for (const format of FORMAT_FOLDERS) {
        await findOrCreateFolder(format, backgroundsFolder.id)
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log('✅ Folder structure created:')
    console.log('   backgrounds/')
    for (const format of FORMAT_FOLDERS) {
      console.log(`   ├── ${format}/`)
    }
    console.log('\n🎉 Ready to generate backgrounds in all formats!')
    console.log('📝 Next step: Test background generation with different aspect ratios')

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

setupBackgroundsFolders().then(exitCode => {
  process.exit(exitCode)
})
