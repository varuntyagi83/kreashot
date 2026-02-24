#!/usr/bin/env node
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

async function checkPermissions() {
  // Test with one file ID
  const testFileId = '1djEmbt80S5BO9PpBmrZvU-3GUpwVwKbB'

  console.log(`Checking permissions for file: ${testFileId}\n`)

  try {
    // Get file metadata
    const { data: file } = await drive.files.get({
      fileId: testFileId,
      fields: 'id, name, mimeType, webViewLink, webContentLink, thumbnailLink',
      supportsAllDrives: true,
    })

    console.log('File metadata:')
    console.log(`  Name: ${file.name}`)
    console.log(`  MIME: ${file.mimeType}`)
    console.log(`  View Link: ${file.webViewLink}`)
    console.log(`  Content Link: ${file.webContentLink}`)
    console.log(`  Thumbnail: ${file.thumbnailLink}`)
    console.log()

    // Get permissions
    const { data: permissions } = await drive.permissions.list({
      fileId: testFileId,
      fields: 'permissions(id, type, role)',
      supportsAllDrives: true,
    })

    console.log('Permissions:')
    permissions.permissions.forEach(perm => {
      console.log(`  - Type: ${perm.type}, Role: ${perm.role}`)
    })

    // Check if file is publicly readable
    const isPublic = permissions.permissions.some(
      p => p.type === 'anyone' && p.role === 'reader'
    )

    console.log(`\n${isPublic ? '✅' : '❌'} File is ${isPublic ? '' : 'NOT '}publicly readable`)

    // Try different URL formats
    console.log('\n📋 Available URL formats:')
    console.log(`  1. uc?export=view: https://drive.google.com/uc?export=view&id=${testFileId}`)
    console.log(`  2. uc?id= (direct): https://drive.google.com/uc?id=${testFileId}`)
    console.log(`  3. Thumbnail API: ${file.thumbnailLink}`)
    console.log(`  4. Web View Link: ${file.webViewLink}`)

  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkPermissions().catch(console.error)
