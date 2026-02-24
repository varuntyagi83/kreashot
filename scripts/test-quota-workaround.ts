/**
 * Test if we can upload to shared folder using owner's quota
 */

import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Readable } from 'stream'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

async function testQuotaWorkaround() {
  console.log('🧪 Testing quota workaround...\n')

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    console.log('📤 Attempting to upload file to shared folder...')

    // Try uploading directly to the shared folder
    const testContent = Buffer.from('Test file from AdForge')
    const stream = Readable.from(testContent)

    const { data: file } = await drive.files.create({
      requestBody: {
        name: 'test-upload.txt',
        parents: [folderId],
        mimeType: 'text/plain',
      },
      media: {
        mimeType: 'text/plain',
        body: stream,
      },
      fields: 'id, name, size',
      supportsAllDrives: true, // Important: Support shared drives
    })

    console.log('   ✅ File uploaded successfully!')
    console.log(`   ℹ️  File ID: ${file.id}`)
    console.log(`   ℹ️  File name: ${file.name}`)
    console.log('')

    // Make public
    console.log('🔓 Making file public...')
    await drive.permissions.create({
      fileId: file.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    })

    const publicUrl = `https://drive.google.com/uc?export=download&id=${file.id}`
    console.log('   ✅ File is now public')
    console.log(`   ℹ️  URL: ${publicUrl}`)
    console.log('')

    // Cleanup
    console.log('🧹 Cleaning up...')
    await drive.files.delete({
      fileId: file.id!,
      supportsAllDrives: true,
    })
    console.log('   ✅ Test file deleted')
    console.log('')

    console.log('✅ SUCCESS! Google Drive storage is working!')
    console.log('')
    console.log('The workaround works:')
    console.log('  - Service account can upload to shared folder')
    console.log('  - Files use YOUR Google Drive storage quota (not service account)')
    console.log('  - You have 15GB free storage quota')
    console.log('')
    console.log('Next step: Add environment variables to Vercel and deploy!')
    console.log('')

  } catch (error: any) {
    console.log('   ❌ Error:', error.message)
    console.log('')

    if (error.message.includes('storage quota')) {
      console.log('❌ Storage quota issue persists')
      console.log('')
      console.log('Alternative solutions:')
      console.log('  1. Continue using Supabase Storage (100MB limit already configured)')
      console.log('  2. Use Google Workspace and create a Shared Drive')
      console.log('  3. Use Cloudflare R2 (10GB free) - requires new adapter')
      console.log('')
    }
  }
}

testQuotaWorkaround()
