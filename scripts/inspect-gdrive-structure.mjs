/**
 * Inspect Google Drive folder structure to understand the correct hierarchy
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

async function listFolderContents(folderId, name, depth = 0) {
  const indent = '  '.repeat(depth)
  console.log(`${indent}📁 ${name} (${folderId})`)

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    orderBy: 'folder,name'
  })

  const folders = response.data.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
  const files = response.data.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')

  for (const folder of folders) {
    await listFolderContents(folder.id, folder.name, depth + 1)
  }

  if (files.length > 0) {
    console.log(`${indent}  📄 ${files.length} files`)
    if (files.length <= 10) {
      files.forEach(f => console.log(`${indent}    - ${f.name}`))
    }
  }
}

async function inspect() {
  try {
    console.log('🔍 Inspecting Google Drive folder structure\n')
    console.log('=' .repeat(60))

    // Get category folder
    const category = await sql`
      SELECT gdrive_folder_id, slug, name
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    if (!category || !category[0]) {
      throw new Error('Gummy Bear category not found')
    }

    const cat = category[0]
    console.log(`\nCategory: ${cat.name}`)
    console.log(`Slug: ${cat.slug}`)
    console.log(`Folder ID: ${cat.gdrive_folder_id}\n`)

    // List full hierarchy
    await listFolderContents(cat.gdrive_folder_id, cat.name || cat.slug, 0)

    console.log('\n' + '=' .repeat(60))

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await sql.end()
  }
}

inspect()
