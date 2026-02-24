/**
 * List all folders in Google Drive to find the category folder
 */

import { google } from 'googleapis'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

// Google Drive Service Account configuration
const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

async function listFolders() {
  console.log('🔍 Listing folders in Google Drive\n')
  console.log('Root folder ID:', ROOT_FOLDER_ID)
  console.log('='.repeat(60))

  try {
    // List folders in root
    const response = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      spaces: 'drive',
      orderBy: 'name'
    })

    const folders = response.data.files || []

    console.log(`\nFound ${folders.length} folders:\n`)

    folders.forEach((folder, i) => {
      console.log(`${i + 1}. ${folder.name}`)
      console.log(`   ID: ${folder.id}`)
      console.log(`   Created: ${folder.createdTime}`)
      console.log()
    })

    // Find gummy-bear folder
    const gummyBearFolder = folders.find(f => f.name === 'gummy-bear')

    if (gummyBearFolder) {
      console.log('=' .repeat(60))
      console.log('✅ Found "gummy-bear" folder!')
      console.log('=' .repeat(60))
      console.log(`Folder ID: ${gummyBearFolder.id}`)
      console.log('\nRun this command to update the database:')
      console.log(`\nnode -e "import postgres from 'postgres'; import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' }); (async () => { await sql\\\`UPDATE categories SET gdrive_folder_id = '\${gummyBearFolder.id}' WHERE slug = 'gummy-bear'\\\`; console.log('✅ Updated'); await sql.end(); })();" --input-type=module`)
    } else {
      console.log('=' .repeat(60))
      console.log('⚠️  "gummy-bear" folder not found')
      console.log('=' .repeat(60))
      console.log('Please check:')
      console.log('1. Folder exists in Google Drive')
      console.log('2. Folder is in the root storage folder')
      console.log('3. Folder name matches "gummy-bear" exactly (case-sensitive)')
    }

    return folders
  } catch (error) {
    console.error('❌ Error:', error.message)
    throw error
  }
}

listFolders().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
