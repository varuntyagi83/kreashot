/**
 * Test Google Drive access with service account
 */

import { google } from 'googleapis'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

console.log('Testing Google Drive access...\n')
console.log('Service account:', GOOGLE_DRIVE_CLIENT_EMAIL)
console.log('Root folder ID:', ROOT_FOLDER_ID)

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

try {
  // Try to get the root folder metadata (with Shared Drive support)
  console.log('\nAttempting to access root folder...')
  const folder = await drive.files.get({
    fileId: ROOT_FOLDER_ID,
    fields: 'id, name, mimeType, parents',
    supportsAllDrives: true
  })

  console.log('✅ Root folder accessible:')
  console.log('   ID:', folder.data.id)
  console.log('   Name:', folder.data.name)
  console.log('   Type:', folder.data.mimeType)
  console.log('   Parents:', folder.data.parents)

  // List all children (files and folders) - with Shared Drive support
  console.log('\nListing all children...')
  const children = await drive.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })

  console.log(`\nFound ${children.data.files.length} items:`)
  children.data.files.forEach(file => {
    const icon = file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'
    console.log(`  ${icon} ${file.name} (ID: ${file.id})`)
  })

  // Find gummy-bear folder
  const gummyBear = children.data.files.find(f => f.name === 'gummy-bear')
  if (gummyBear) {
    console.log('\n✅ Found gummy-bear folder!')
    console.log('   ID:', gummyBear.id)
  }

} catch (error) {
  console.error('❌ Error:', error.message)
  if (error.code === 404) {
    console.error('\nThe folder ID does not exist or service account has no access.')
    console.error('Please check:')
    console.error('1. Service account has been granted access to the folder')
    console.error('2. The folder ID is correct')
  }
  process.exit(1)
}
