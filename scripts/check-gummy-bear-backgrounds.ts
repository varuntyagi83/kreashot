#!/usr/bin/env tsx
/**
 * Check Gummy Bear category and create test background
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
  console.log('🔍 Checking Gummy Bear category and backgrounds\n')
  console.log('='.repeat(60))

  // Find Gummy Bear category
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, look_and_feel')
    .ilike('name', '%gummy%')

  if (!categories || categories.length === 0) {
    console.log('\n❌ No Gummy Bear category found')
    console.log('\nAvailable categories:')

    const { data: all } = await supabase
      .from('categories')
      .select('id, name, slug')
      .limit(10)

    all?.forEach(c => console.log(`   - ${c.name} (${c.slug})`))
    return
  }

  const category = categories[0]
  console.log(`\n✅ Found category: ${category.name}`)
  console.log(`   Slug: ${category.slug}`)
  console.log(`   ID: ${category.id}`)
  console.log(`   Look & Feel: ${category.look_and_feel || '(not set)'}`)

  // Check backgrounds
  console.log('\n' + '-'.repeat(60))
  console.log('📁 Expected Google Drive folder structure:')
  console.log(`   ${category.slug}/backgrounds/`)
  console.log('-'.repeat(60))

  const { data: backgrounds } = await supabase
    .from('backgrounds')
    .select('*')
    .eq('category_id', category.id)
    .order('created_at', { ascending: false })

  console.log(`\n💾 Backgrounds in database: ${backgrounds?.length || 0}`)

  if (backgrounds && backgrounds.length > 0) {
    console.log('\nExisting backgrounds:')
    backgrounds.forEach((bg, idx) => {
      console.log(`\n${idx + 1}. ${bg.name}`)
      console.log(`   Slug: ${bg.slug}`)
      console.log(`   Storage path: ${bg.storage_path}`)
      console.log(`   GDrive file ID: ${bg.gdrive_file_id || '(none)'}`)
      console.log(`   Created: ${new Date(bg.created_at).toLocaleString()}`)
    })
  } else {
    console.log('\n⚠️  No backgrounds found for this category yet')
    console.log('\nTo create a background for Gummy Bear:')
    console.log(`   Use the API: POST /api/categories/${category.id}/backgrounds/generate`)
    console.log('   Or use the UI once it\'s built')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Check complete')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
