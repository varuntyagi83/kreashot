#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function fixAngledShots() {
  console.log('🔍 Checking angled shots...')

  // Get all angled shots
  const { data: allShots, error: fetchError } = await supabase
    .from('angled_shots')
    .select('id, format, width, height, angle_name')

  if (fetchError) {
    console.error('❌ Error fetching angled shots:', fetchError)
    process.exit(1)
  }

  console.log(`📊 Found ${allShots.length} total angled shots`)

  // Find shots that need fixing
  const shotsToFix = allShots.filter(shot =>
    !shot.format || shot.format === '' || !shot.width || !shot.height || shot.width === 0 || shot.height === 0
  )

  if (shotsToFix.length === 0) {
    console.log('✅ All angled shots already have format values set!')
    return
  }

  console.log(`🔧 Fixing ${shotsToFix.length} angled shots...`)

  // Update in batches
  const { error: updateError } = await supabase
    .from('angled_shots')
    .update({
      format: '1:1',
      width: 1080,
      height: 1080
    })
    .in('id', shotsToFix.map(s => s.id))

  if (updateError) {
    console.error('❌ Error updating angled shots:', updateError)
    process.exit(1)
  }

  console.log('✅ Successfully fixed angled shots!')
  console.log(`   - Total: ${allShots.length}`)
  console.log(`   - Fixed: ${shotsToFix.length}`)
  console.log(`   - Already OK: ${allShots.length - shotsToFix.length}`)
}

fixAngledShots().catch(console.error)
