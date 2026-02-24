import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!

async function listFolder(folderId: string) {
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return data.files || []
}

async function findFolder(parentId: string, name: string) {
  const files = await listFolder(parentId)
  return files.find(
    f => f.name === name && f.mimeType === 'application/vnd.google-apps.folder'
  )
}

async function checkStructure() {
  console.log('🔍 Checking actual Google Drive structure\n')

  // Navigate step by step
  const gummyBear = await findFolder(ROOT_FOLDER_ID, 'gummy-bear')
  if (!gummyBear) {
    console.log('❌ gummy-bear folder not found')
    return
  }
  console.log(`✅ gummy-bear/ (${gummyBear.id})`)

  const vitaminC = await findFolder(gummyBear.id!, 'vitamin-c-gummies')
  if (!vitaminC) {
    console.log('❌ vitamin-c-gummies folder not found')
    return
  }
  console.log(`✅ vitamin-c-gummies/ (${vitaminC.id})`)

  const productImages = await findFolder(vitaminC.id!, 'product-images')
  if (!productImages) {
    console.log('❌ product-images folder not found')
    return
  }
  console.log(`✅ product-images/ (${productImages.id})`)

  const angledShots = await findFolder(productImages.id!, 'vitamin-c-gummies-angled-shots')
  if (!angledShots) {
    console.log('❌ vitamin-c-gummies-angled-shots folder not found')
    return
  }
  console.log(`✅ vitamin-c-gummies-angled-shots/ (${angledShots.id})\n`)

  // List format folders
  const formatFolders = await listFolder(angledShots.id!)
  console.log('Format folders:')
  formatFolders
    .filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    .forEach(f => console.log(`   - ${f.name}/`))

  // Check 16x9 folder
  const folder16x9 = formatFolders.find(f => f.name === '16x9')
  if (folder16x9) {
    console.log(`\n✅ Found 16x9 folder! (${folder16x9.id})\n`)
    const files = await listFolder(folder16x9.id!)
    const imageFiles = files.filter(f => f.mimeType?.startsWith('image/'))

    console.log(`Images in 16x9 folder: ${imageFiles.length}`)
    imageFiles.forEach((file, i) => {
      console.log(`   ${i+1}. ${file.name}`)
      console.log(`      ID: ${file.id}`)
      console.log(`      Type: ${file.mimeType}`)
    })
  } else {
    console.log('\n❌ No 16x9 folder found')
  }
}

checkStructure().then(() => process.exit(0))
