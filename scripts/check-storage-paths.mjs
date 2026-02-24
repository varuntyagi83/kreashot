#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkPaths() {
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, angle_name, storage_path, format')
    .order('created_at', { ascending: false })

  console.log(`Checking storage paths for ${shots.length} angled shots:\n`)

  const formatFromPath = {}
  shots.forEach(shot => {
    const path = shot.storage_path
    // Extract format from path: gummy-bear/product/angled-shots/{FORMAT}/...
    const match = path.match(/angled-shots\/([^\/]+)\//)
    const pathFormat = match ? match[1] : 'unknown'
    const dbFormat = shot.format

    if (!formatFromPath[pathFormat]) formatFromPath[pathFormat] = []
    formatFromPath[pathFormat].push({ ...shot, pathFormat })

    if (pathFormat !== dbFormat && pathFormat !== 'unknown') {
      console.log(`⚠️  ${shot.angle_name}:`)
      console.log(`   Path: ${pathFormat}`)
      console.log(`   DB:   ${dbFormat}`)
      console.log(`   Storage: ${path}`)
      console.log()
    }
  })

  console.log('\n📊 Summary by path format:')
  Object.keys(formatFromPath).forEach(fmt => {
    console.log(`  ${fmt}: ${formatFromPath[fmt].length} shots`)
  })
}

checkPaths().catch(console.error)
