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

async function checkTrashed() {
  // List all angled shot files including trashed ones
  const { data } = await drive.files.list({
    q: "name contains 'front' or name contains 'isometric' or name contains 'left' or name contains 'right' or name contains 'top'",
    fields: 'files(id, name, trashed, parents)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    spaces: 'drive',
  })

  console.log(`Found ${data.files.length} files\n`)

  const trashed = data.files.filter(f => f.trashed)
  const notTrashed = data.files.filter(f => !f.trashed)

  console.log(`✅ Not trashed: ${notTrashed.length}`)
  console.log(`🗑️  Trashed: ${trashed.length}`)

  if (trashed.length > 0) {
    console.log('\n🗑️  Trashed files:')
    trashed.forEach(f => {
      console.log(`   - ${f.name} (${f.id})`)
    })
  }
}

checkTrashed().catch(console.error)
