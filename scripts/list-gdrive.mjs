#!/usr/bin/env node
import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID
const CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n')

const auth = new google.auth.JWT(
  CLIENT_EMAIL,
  null,
  PRIVATE_KEY,
  ['https://www.googleapis.com/auth/drive.readonly']
)

const drive = google.drive({ version: 'v3', auth })

async function listFolderStructure(folderId, indent = '') {
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name'
  })

  for (const file of data.files) {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
    const icon = isFolder ? '📁' : '📄'
    console.log(`${indent}${icon} ${file.name}`)
    
    if (isFolder) {
      await listFolderStructure(file.id, indent + '  ')
    }
  }
}

console.log('🔍 Google Drive folder structure:\n')
listFolderStructure(FOLDER_ID).catch(console.error)
