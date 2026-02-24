#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkUrls() {
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, angle_name, format, storage_url, gdrive_file_id')
    .order('format', { ascending: true })
    .limit(8) // 2 from each format

  console.log('Sample URLs from database:\n')

  shots.forEach(shot => {
    console.log(`${shot.format} - ${shot.angle_name}:`)
    console.log(`  URL: ${shot.storage_url}`)
    console.log(`  File ID: ${shot.gdrive_file_id}`)
    console.log()
  })

  // Show what the URL format should be
  console.log('\n✅ Correct Google Drive URL formats:')
  console.log('  Direct view (no rate limits): https://drive.google.com/uc?export=view&id=FILE_ID')
  console.log('  Open in Drive: https://drive.google.com/file/d/FILE_ID/view')
  console.log('  Thumbnail (has rate limits): https://drive.google.com/thumbnail?id=FILE_ID&sz=w2000')
}

checkUrls().catch(console.error)
