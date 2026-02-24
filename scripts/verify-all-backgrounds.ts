#!/usr/bin/env tsx
/**
 * Verify all backgrounds across all categories
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
  console.log('🔍 Verifying All Backgrounds\n')
  console.log('='.repeat(70))

  // Get all categories
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('name')

  if (!categories || categories.length === 0) {
    console.log('❌ No categories found')
    return
  }

  let totalBackgrounds = 0

  for (const category of categories) {
    // Get backgrounds for this category
    const { data: backgrounds } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('category_id', category.id)
      .order('created_at', { ascending: false })

    const count = backgrounds?.length || 0
    totalBackgrounds += count

    console.log(`\n📁 ${category.name} (${category.slug})`)
    console.log('-'.repeat(70))

    if (count === 0) {
      console.log('   No backgrounds yet')
    } else {
      console.log(`   Found ${count} background(s):\n`)

      backgrounds?.forEach((bg, idx) => {
        console.log(`   ${idx + 1}. ${bg.name}`)
        console.log(`      Slug: ${bg.slug}`)
        console.log(`      Path: ${bg.storage_path}`)
        console.log(`      File ID: ${bg.gdrive_file_id || '(none)'}`)
        console.log(`      URL: ${bg.storage_url}`)
        console.log(`      Created: ${new Date(bg.created_at).toLocaleString()}`)
        if (bg.description) {
          console.log(`      Description: ${bg.description}`)
        }
        console.log()
      })
    }
  }

  // Summary
  console.log('='.repeat(70))
  console.log(`\n📊 Summary:`)
  console.log(`   Total categories: ${categories.length}`)
  console.log(`   Total backgrounds: ${totalBackgrounds}`)
  console.log('\n✅ Verification complete!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
