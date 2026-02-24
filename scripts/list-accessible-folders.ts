/**
 * List all folders accessible by the service account
 */

import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function listAccessibleFolders() {
  console.log('📁 Listing folders accessible by service account...\n')

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })

    // List all folders shared with this service account
    const { data } = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, owners, shared)',
      pageSize: 100,
    })

    if (data.files && data.files.length > 0) {
      console.log(`Found ${data.files.length} accessible folder(s):\n`)
      data.files.forEach((file, index) => {
        console.log(`${index + 1}. "${file.name}"`)
        console.log(`   ID: ${file.id}`)
        console.log(`   Shared: ${file.shared}`)
        console.log('')
      })

      console.log('💡 To use a folder, copy its ID to GOOGLE_DRIVE_FOLDER_ID in .env.local')
    } else {
      console.log('❌ No folders found!')
      console.log('')
      console.log('This means the service account has no access to any folders.')
      console.log('Make sure you:')
      console.log(
        '  1. Created a folder in Google Drive (e.g., "AdForge Files")'
      )
      console.log('  2. Shared it with:')
      console.log(`     ${process.env.GOOGLE_DRIVE_CLIENT_EMAIL}`)
      console.log('  3. Gave "Editor" permissions')
    }
  } catch (error: any) {
    console.log('❌ Error:', error.message)
  }
}

listAccessibleFolders()
