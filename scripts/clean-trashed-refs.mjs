#!/usr/bin/env node
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
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
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function cleanTrashedRefs() {
  // Get all angled shots
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, gdrive_file_id, angle_name')
    .eq('storage_provider', 'gdrive')
    .not('gdrive_file_id', 'is', null)

  console.log(`Checking ${shots.length} angled shots...\n`)

  const toDelete = []

  for (const shot of shots) {
    try {
      // Check if file is trashed
      const { data } = await drive.files.get({
        fileId: shot.gdrive_file_id,
        fields: 'trashed',
        supportsAllDrives: true,
      })

      if (data.trashed) {
        toDelete.push(shot)
        console.log(`🗑️  ${shot.angle_name} - File is trashed`)
      }
    } catch (error) {
      if (error.code === 404) {
        toDelete.push(shot)
        console.log(`❌ ${shot.angle_name} - File not found`)
      }
    }
  }

  console.log(`\nFound ${toDelete.length} records pointing to trashed/missing files`)

  if (toDelete.length > 0) {
    const ids = toDelete.map(s => s.id)
    const { error } = await supabase
      .from('angled_shots')
      .delete()
      .in('id', ids)

    if (error) {
      console.log(`\n❌ Error deleting: ${error.message}`)
    } else {
      console.log(`✅ Deleted ${toDelete.length} database records`)
    }
  }
}

cleanTrashedRefs().catch(console.error)
