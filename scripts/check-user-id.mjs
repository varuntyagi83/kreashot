#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkUserIds() {
  // Get Gummy Bear category with user_id
  const { data: category } = await supabase
    .from('categories')
    .select('id, name, user_id')
    .eq('name', 'Gummy Bear')
    .single()

  console.log(`Category user_id: ${category.user_id}`)

  // Get angled shots
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, angle_name, user_id')
    .eq('category_id', category.id)
    .limit(5)

  console.log(`\nAngled shots user_ids:`)
  shots.forEach(s => {
    const match = s.user_id === category.user_id ? '✅' : '❌'
    console.log(`  ${match} ${s.angle_name}: ${s.user_id}`)
  })

  const mismatch = shots.filter(s => s.user_id !== category.user_id)
  if (mismatch.length > 0) {
    console.log(`\n⚠️  Found ${mismatch.length} angled shots with wrong user_id!`)
    console.log(`   Fixing...`)
    
    await supabase
      .from('angled_shots')
      .update({ user_id: category.user_id })
      .eq('category_id', category.id)
    
    console.log(`✅ Fixed!`)
  }
}

checkUserIds().catch(console.error)
