import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })
const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || ''

async function listFolder(folderId: string, indent = '', name = 'Root'): Promise<void> {
  console.log(`${indent}📁 ${name}`)
  
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  for (const file of data.files || []) {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
    if (isFolder) {
      await listFolder(file.id!, indent + '  ', file.name!)
    } else {
      console.log(`${indent}  📄 ${file.name}`)
    }
  }
}

console.log('🔍 Google Drive Structure:\n')
listFolder(rootFolderId).catch(console.error)
