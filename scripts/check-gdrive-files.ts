import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

// Initialize Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!

async function listFolderContents(folderId: string, folderPath: string = '') {
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  return data.files || []
}

async function navigatePath(pathParts: string[]) {
  let currentFolderId = ROOT_FOLDER_ID
  let currentPath = ''

  console.log(`Starting from root: ${ROOT_FOLDER_ID}\n`)

  for (const part of pathParts) {
    const files = await listFolderContents(currentFolderId, currentPath)
    const folder = files.find(
      (f) => f.name === part && f.mimeType === 'application/vnd.google-apps.folder'
    )

    if (!folder) {
      console.log(`❌ Folder "${part}" not found in path: ${currentPath || 'root'}`)
      console.log(`\nAvailable folders:`)
      const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
      folders.forEach(f => console.log(`   - ${f.name}`))
      return null
    }

    currentPath = currentPath ? `${currentPath}/${part}` : part
    currentFolderId = folder.id!
    console.log(`✅ Found: ${currentPath} (ID: ${currentFolderId})`)
  }

  return currentFolderId
}

async function checkVitaminCGummiesAngledShots() {
  console.log('🔍 Checking Google Drive for Vitamin C Gummies 16:9 angled shots\n')

  // Navigate to: gummy-bear/vitamin-c-gummies/product-images/angled-shots/16x9
  const pathParts = ['gummy-bear', 'vitamin-c-gummies', 'product-images', 'angled-shots', '16x9']

  const folderId = await navigatePath(pathParts)

  if (folderId) {
    console.log(`\n✅ Found folder: ${pathParts.join('/')}\n`)
    console.log('Files in this folder:')
    const files = await listFolderContents(folderId)
    const imageFiles = files.filter(f => f.mimeType?.startsWith('image/'))

    if (imageFiles.length === 0) {
      console.log('   (empty)')
    } else {
      imageFiles.forEach((file, i) => {
        console.log(`   ${i+1}. ${file.name}`)
        console.log(`      ID: ${file.id}`)
        console.log(`      Type: ${file.mimeType}`)
      })
    }
  } else {
    console.log('\n❌ Path does not exist in Google Drive')
    console.log('\nNeed to create the structure and upload 16:9 angled shots')
  }
}

checkVitaminCGummiesAngledShots().then(() => process.exit(0))
