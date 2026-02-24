#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function testQuery() {
  // Get categories first
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .limit(1)
    .single()

  console.log(`Testing with category: ${categories.name} (${categories.id})`)

  // Try the same query as the API
  const { data: angledShots, error } = await supabase
    .from('angled_shots')
    .select(`
      id,
      angle_name,
      angle_description,
      format,
      storage_url,
      product:products!inner(id, name, slug),
      product_image:product_images!inner(id, file_name)
    `)
    .eq('category_id', categories.id)
    .eq('format', '1:1')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Query error:', error)
  } else {
    console.log(`\n✅ Query returned ${angledShots.length} angled shots`)
    if (angledShots.length > 0) {
      console.log('\nSample:')
      console.log(`  - ${angledShots[0].angle_name}`)
      console.log(`  - Product: ${angledShots[0].product.name}`)
      console.log(`  - Image: ${angledShots[0].product_image.file_name}`)
    }
  }
}

testQuery().catch(console.error)
