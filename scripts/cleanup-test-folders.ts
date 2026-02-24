/**
 * Cleanup test folders from Shared Drive
 */

import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function cleanupTestFolders() {
  console.log('🧹 Cleaning up test folders...\n')

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

    // List all items in Shared Drive
    console.log('📁 Finding test folders...')
    const { data } = await drive.files.list({
      q: `'${sharedDriveId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (!data.files || data.files.length === 0) {
      console.log('✅ No test folders found - Shared Drive is clean!')
      return
    }

    console.log(`Found ${data.files.length} item(s) in Shared Drive:\n`)

    const testFolders = data.files.filter(
      f => f.name?.startsWith('test') || f.name?.startsWith('product-images')
    )

    if (testFolders.length === 0) {
      console.log('✅ No test folders to clean up!')
      console.log('')
      console.log('Current folders:')
      data.files.forEach(f => console.log(`  - ${f.name}`))
      return
    }

    console.log('Test folders to delete:')
    testFolders.forEach(f => console.log(`  - ${f.name} (${f.mimeType})`))
    console.log('')

    // Delete test folders
    for (const folder of testFolders) {
      console.log(`Deleting: ${folder.name}...`)
      try {
        await drive.files.delete({
          fileId: folder.id!,
          supportsAllDrives: true,
        })
        console.log(`   ✅ Deleted`)
      } catch (error: any) {
        console.log(`   ⚠️  Error: ${error.message}`)
      }
    }

    console.log('')
    console.log('✅ Cleanup complete!')
    console.log('')
    console.log('Your Shared Drive is now clean and ready for production use.')
    console.log('')

  } catch (error: any) {
    console.log('❌ Error:', error.message)
  }
}

cleanupTestFolders()
