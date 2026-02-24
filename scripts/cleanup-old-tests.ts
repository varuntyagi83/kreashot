/**
 * Clean up old test files from before Manager permissions
 */

import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function cleanupOldTests() {
  console.log('🧹 Cleaning up old test files...\n')

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })
    const sharedDriveId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    // List all items in root of Shared Drive
    console.log('📁 Finding all test files and folders...')
    const { data } = await drive.files.list({
      q: `'${sharedDriveId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (!data.files || data.files.length === 0) {
      console.log('✅ Shared Drive is already clean!')
      return
    }

    console.log(`Found ${data.files.length} item(s):\n`)
    data.files.forEach((file, i) => {
      console.log(`${i + 1}. ${file.name} (${file.mimeType === 'application/vnd.google-apps.folder' ? 'Folder' : 'File'})`)
    })
    console.log('')

    // Delete each item
    console.log('🗑️  Deleting with Manager permissions...\n')

    for (const file of data.files) {
      console.log(`Deleting: ${file.name}...`)
      try {
        await drive.files.delete({
          fileId: file.id!,
          supportsAllDrives: true,
        })
        console.log('   ✅ Deleted successfully')
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`)
      }
    }

    console.log('')
    console.log('✅ Cleanup complete!')
    console.log('')
    console.log('🎯 Now your Shared Drive is clean and ready for production.')
    console.log('')

  } catch (error: any) {
    console.log('❌ Error:', error.message)
  }
}

cleanupOldTests()
