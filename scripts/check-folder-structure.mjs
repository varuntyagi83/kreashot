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

async function listFolders(parentId, indent = '') {
  const response = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: 'name'
  })

  const folders = response.data.files || []

  for (const folder of folders) {
    console.log(`${indent}📁 ${folder.name}`)
    await listFolders(folder.id, indent + '  ')
  }
}

async function checkStructure() {
  try {
    const category = await sql`
      SELECT gdrive_folder_id, slug
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    const catFolderId = category[0].gdrive_folder_id

    console.log('🔍 Checking Google Drive folder structure:\n')
    console.log('📁 Gummy Bear')
    await listFolders(catFolderId, '  ')

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await sql.end()
  }
}

checkStructure()
