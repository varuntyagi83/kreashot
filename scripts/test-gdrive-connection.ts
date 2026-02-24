/**
 * Test script to verify Google Drive connection
 * Tests authentication, folder access, and upload capabilities
 */

import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function testGoogleDriveConnection() {
  console.log('🧪 Testing Google Drive Connection\n')

  // Step 1: Check environment variables
  console.log('📋 Step 1: Checking environment variables...')
  const requiredEnvVars = {
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
    GOOGLE_DRIVE_CLIENT_EMAIL: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    GOOGLE_DRIVE_PRIVATE_KEY: process.env.GOOGLE_DRIVE_PRIVATE_KEY,
  }

  let allPresent = true
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      console.log(`   ❌ ${key} is missing`)
      allPresent = false
    } else {
      console.log(`   ✅ ${key} is present`)
    }
  }

  if (!allPresent) {
    console.log('\n❌ Missing required environment variables!')
    console.log('Please check .env.local file\n')
    return
  }

  console.log('')

  // Step 2: Test authentication
  console.log('🔐 Step 2: Testing authentication...')
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })
    console.log('   ✅ Authentication successful')
    console.log('')

    // Step 3: Test folder access
    console.log('📁 Step 3: Testing folder access...')
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    const { data: folder } = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, permissions',
    })

    console.log(`   ✅ Folder accessible: "${folder.name}"`)
    console.log(`   ℹ️  Folder ID: ${folder.id}`)
    console.log('')

    // Step 4: Test folder creation
    console.log('🔨 Step 4: Testing folder creation...')
    const testFolderName = `test-${Date.now()}`

    const { data: testFolder } = await drive.files.create({
      requestBody: {
        name: testFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId],
      },
      fields: 'id, name',
    })

    console.log(`   ✅ Test folder created: "${testFolder.name}"`)
    console.log(`   ℹ️  Folder ID: ${testFolder.id}`)
    console.log('')

    // Step 5: Test file upload
    console.log('📤 Step 5: Testing file upload...')
    const testContent = Buffer.from('Test file content from AdForge')
    const { Readable } = require('stream')
    const stream = Readable.from(testContent)

    const { data: uploadedFile } = await drive.files.create({
      requestBody: {
        name: 'test-file.txt',
        parents: [testFolder.id!],
        mimeType: 'text/plain',
      },
      media: {
        mimeType: 'text/plain',
        body: stream,
      },
      fields: 'id, name, size',
    })

    console.log(`   ✅ File uploaded: "${uploadedFile.name}"`)
    console.log(`   ℹ️  File ID: ${uploadedFile.id}`)
    console.log(`   ℹ️  File size: ${uploadedFile.size} bytes`)
    console.log('')

    // Step 6: Test permissions (make file public)
    console.log('🔓 Step 6: Testing public permission...')
    await drive.permissions.create({
      fileId: uploadedFile.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    const publicUrl = `https://drive.google.com/uc?export=download&id=${uploadedFile.id}`
    console.log('   ✅ Public permission set')
    console.log(`   ℹ️  Public URL: ${publicUrl}`)
    console.log('')

    // Step 7: Cleanup - delete test folder and contents
    console.log('🧹 Step 7: Cleaning up test files...')
    await drive.files.delete({ fileId: testFolder.id! })
    console.log('   ✅ Test folder deleted')
    console.log('')

    // Success summary
    console.log('✅ ALL TESTS PASSED!')
    console.log('')
    console.log('Your Google Drive integration is working correctly!')
    console.log('You can now use Google Drive for storage in your AdForge application.')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Add these environment variables to Vercel')
    console.log('  2. Deploy your application')
    console.log('  3. Test file uploads in production')
    console.log('')
  } catch (error: any) {
    console.log('   ❌ Error occurred')
    console.log('')
    console.log('❌ TEST FAILED!')
    console.log('')
    console.log('Error details:')
    console.log(error.message)
    console.log('')

    if (error.message.includes('invalid_grant')) {
      console.log('💡 Troubleshooting:')
      console.log('  - Check that the private key is correct')
      console.log('  - Make sure the private key has proper line breaks (\\n)')
      console.log('  - Verify the service account email is correct')
    } else if (error.message.includes('File not found')) {
      console.log('💡 Troubleshooting:')
      console.log('  - Check that the folder ID is correct')
      console.log('  - Make sure the folder is shared with the service account')
      console.log('  - Verify the service account has "Editor" permissions')
    } else if (error.message.includes('insufficient permissions')) {
      console.log('💡 Troubleshooting:')
      console.log('  - Share the Google Drive folder with the service account')
      console.log('  - Grant "Editor" permissions to the service account')
      console.log(
        `  - Service account: ${process.env.GOOGLE_DRIVE_CLIENT_EMAIL}`
      )
    }
    console.log('')
  }
}

testGoogleDriveConnection()
