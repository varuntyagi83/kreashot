#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

async function updateToCdnUrls() {
  console.log('🔍 Fetching all angled shots...')

  const { data: shots, error } = await supabase
    .from('angled_shots')
    .select('id, gdrive_file_id, storage_url, angle_name')

  if (error) {
    console.error('❌ Error fetching angled shots:', error)
    process.exit(1)
  }

  console.log(`📊 Found ${shots.length} angled shots\n`)

  let updated = 0
  let failed = 0

  for (const shot of shots) {
    try {
      // Get thumbnail link from Google Drive API
      const { data: file } = await drive.files.get({
        fileId: shot.gdrive_file_id,
        fields: 'thumbnailLink',
        supportsAllDrives: true,
      })

      if (!file.thumbnailLink) {
        console.log(`⚠️  No thumbnail link for ${shot.angle_name}`)
        failed++
        continue
      }

      // Modify size parameter from =s220 to =s2000 for high quality
      let cdnUrl = file.thumbnailLink
      if (cdnUrl.includes('=s220')) {
        cdnUrl = cdnUrl.replace('=s220', '=s2000')
      } else if (!cdnUrl.includes('=s')) {
        cdnUrl = cdnUrl + '=s2000'
      }

      // Update database
      const { error: updateError } = await supabase
        .from('angled_shots')
        .update({ storage_url: cdnUrl })
        .eq('id', shot.id)

      if (updateError) {
        console.error(`❌ Failed to update ${shot.angle_name}:`, updateError)
        failed++
      } else {
        console.log(`✅ Updated ${shot.angle_name}`)
        console.log(`   Old: ${shot.storage_url.substring(0, 60)}...`)
        console.log(`   New: ${cdnUrl.substring(0, 60)}...`)
        updated++
      }

      // Add small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error(`❌ Error processing ${shot.angle_name}:`, error.message)
      failed++
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   ✅ Updated: ${updated}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📝 Total: ${shots.length}`)
}

updateToCdnUrls().catch(console.error)
