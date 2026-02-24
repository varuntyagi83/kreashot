#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkAngledShots() {
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, format, width, height, angle_name')
    .order('created_at', { ascending: false })

  console.log(`Found ${shots.length} angled shots:\n`)

  const byFormat = {}
  shots.forEach(shot => {
    const fmt = shot.format || 'NULL'
    if (!byFormat[fmt]) byFormat[fmt] = []
    byFormat[fmt].push(shot)
  })

  Object.keys(byFormat).sort().forEach(format => {
    console.log(`📊 Format: ${format} - ${byFormat[format].length} shots`)
    byFormat[format].slice(0, 2).forEach(shot => {
      console.log(`     - ${shot.angle_name} (${shot.width}x${shot.height})`)
    })
    console.log()
  })
}

checkAngledShots().catch(console.error)
