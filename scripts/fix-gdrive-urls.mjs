#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function fixUrls() {
  // Get all angled shots with gdrive storage
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, gdrive_file_id, storage_url')
    .eq('storage_provider', 'gdrive')
    .not('gdrive_file_id', 'is', null)

  console.log(`Found ${shots.length} angled shots to update\n`)

  let updated = 0
  for (const shot of shots) {
    // Change from thumbnail URL to direct view URL (no rate limits)
    const newUrl = `https://drive.google.com/uc?export=view&id=${shot.gdrive_file_id}`
    
    if (shot.storage_url !== newUrl) {
      const { error } = await supabase
        .from('angled_shots')
        .update({ storage_url: newUrl })
        .eq('id', shot.id)

      if (error) {
        console.log(`❌ Error updating ${shot.id}: ${error.message}`)
      } else {
        updated++
        if (updated % 10 === 0) {
          console.log(`✅ Updated ${updated}/${shots.length}...`)
        }
      }
    }
  }

  console.log(`\n✨ Done! Updated ${updated} URLs to use direct view format`)
  console.log('This format has no rate limits and loads faster!')
}

fixUrls().catch(console.error)
