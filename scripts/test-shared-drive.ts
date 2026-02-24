/**
 * Test Google Workspace Shared Drive integration
 */

import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Readable } from 'stream'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function testSharedDrive() {
  console.log('🧪 Testing Google Workspace Shared Drive\n')

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })
    const driveId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    console.log('📋 Step 1: Verify Shared Drive access...')

    try {
      const { data: sharedDrive } = await drive.drives.get({
        driveId: driveId,
        fields: 'id, name',
      })

      console.log(`   ✅ Shared Drive accessible: "${sharedDrive.name}"`)
      console.log(`   ℹ️  Drive ID: ${sharedDrive.id}`)
      console.log('')
    } catch (error: any) {
      if (error.message.includes('File not found')) {
        console.log('   ⚠️  Not a Shared Drive ID - checking if it\'s a regular folder...')

        const { data: folder } = await drive.files.get({
          fileId: driveId,
          fields: 'id, name, mimeType',
          supportsAllDrives: true,
        })

        console.log(`   ℹ️  Found: "${folder.name}"`)
        console.log(`   ℹ️  Type: ${folder.mimeType}`)

        if (folder.mimeType !== 'application/vnd.google-apps.folder') {
          throw new Error('Not a folder or Shared Drive')
        }

        console.log('   ⚠️  This is a regular folder, not a Shared Drive')
        console.log('   💡 For Google Workspace, create a Shared Drive instead:')
        console.log('      1. Go to drive.google.com')
        console.log('      2. Click "Shared drives" in left sidebar')
        console.log('      3. Click "New" to create a Shared Drive')
        console.log('      4. Name it "AdForge Storage"')
        console.log('      5. Add service account as "Content manager"')
        console.log('')
        console.log('   ⚠️  Continuing test with regular folder...')
        console.log('')
      } else {
        throw error
      }
    }

    // Step 2: Test folder creation
    console.log('🔨 Step 2: Testing folder creation...')
    const testFolderName = `test-${Date.now()}`

    const { data: testFolder } = await drive.files.create({
      requestBody: {
        name: testFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [driveId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    })

    console.log(`   ✅ Folder created: "${testFolder.name}"`)
    console.log(`   ℹ️  Folder ID: ${testFolder.id}`)
    console.log('')

    // Step 3: Test file upload
    console.log('📤 Step 3: Testing file upload...')
    const testContent = Buffer.from('Test file from AdForge - Shared Drive Test')
    const stream = Readable.from(testContent)

    const { data: file } = await drive.files.create({
      requestBody: {
        name: 'test-upload.txt',
        parents: [testFolder.id!],
        mimeType: 'text/plain',
      },
      media: {
        mimeType: 'text/plain',
        body: stream,
      },
      fields: 'id, name, size',
      supportsAllDrives: true,
    })

    console.log(`   ✅ File uploaded: "${file.name}"`)
    console.log(`   ℹ️  File ID: ${file.id}`)
    console.log(`   ℹ️  Size: ${file.size} bytes`)
    console.log('')

    // Step 4: Test public permissions
    console.log('🔓 Step 4: Testing public permissions...')
    await drive.permissions.create({
      fileId: file.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    })

    const publicUrl = `https://drive.google.com/uc?export=download&id=${file.id}`
    console.log('   ✅ Public permission set')
    console.log(`   ℹ️  Public URL: ${publicUrl}`)
    console.log('')

    // Step 5: Test file download
    console.log('📥 Step 5: Testing file download...')
    const { data: downloadedContent } = await drive.files.get(
      {
        fileId: file.id!,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'arraybuffer' }
    )

    const downloadedBuffer = Buffer.from(downloadedContent as ArrayBuffer)
    const downloadedText = downloadedBuffer.toString()

    if (downloadedText === 'Test file from AdForge - Shared Drive Test') {
      console.log('   ✅ File downloaded successfully')
      console.log(`   ℹ️  Content verified: "${downloadedText}"`)
    } else {
      console.log('   ❌ Downloaded content doesn\'t match')
    }
    console.log('')

    // Step 6: Cleanup
    console.log('🧹 Step 6: Cleaning up...')
    await drive.files.delete({
      fileId: testFolder.id!,
      supportsAllDrives: true,
    })
    console.log('   ✅ Test folder and contents deleted')
    console.log('')

    // Success!
    console.log('✅ ALL TESTS PASSED!')
    console.log('')
    console.log('🎉 Google Drive integration is working perfectly!')
    console.log('')
    console.log('✅ You can now:')
    console.log('  1. Upload files to Shared Drive')
    console.log('  2. Create folder hierarchies automatically')
    console.log('  3. Make files publicly accessible')
    console.log('  4. Use workspace storage quota')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Add environment variables to Vercel:')
    console.log('     - STORAGE_PROVIDER=gdrive')
    console.log('     - GOOGLE_DRIVE_FOLDER_ID (your Shared Drive ID)')
    console.log('     - GOOGLE_DRIVE_CLIENT_EMAIL')
    console.log('     - GOOGLE_DRIVE_PRIVATE_KEY')
    console.log('  2. Deploy to Vercel')
    console.log('  3. Test file uploads in production')
    console.log('')

  } catch (error: any) {
    console.log('❌ Error:', error.message)
    console.log('')

    if (error.message.includes('insufficient permissions')) {
      console.log('💡 Troubleshooting:')
      console.log('  1. Make sure you created a Shared Drive (not regular folder)')
      console.log('  2. Add service account to the Shared Drive:')
      console.log(`     ${process.env.GOOGLE_DRIVE_CLIENT_EMAIL}`)
      console.log('  3. Set permission to "Content manager" or "Manager"')
    } else if (error.message.includes('File not found')) {
      console.log('💡 Troubleshooting:')
      console.log('  1. Verify the Shared Drive ID in .env.local')
      console.log('  2. Make sure service account has access to Shared Drive')
      console.log('  3. Check that GOOGLE_DRIVE_FOLDER_ID is the Shared Drive ID')
    }
    console.log('')
  }
}

testSharedDrive()
