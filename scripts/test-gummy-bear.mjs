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
  // Get Gummy Bear category
  const { data: category } = await supabase
    .from('categories')
    .select('id, name')
    .eq('name', 'Gummy Bear')
    .single()

  if (!category) {
    console.log('❌ Gummy Bear category not found')
    return
  }

  console.log(`Testing with category: ${category.name} (${category.id})`)

  // Try WITHOUT format filter
  const { data: all, error: e1 } = await supabase
    .from('angled_shots')
    .select('id, angle_name, format, category_id')
    .eq('category_id', category.id)

  console.log(`\nWithout format filter: ${all?.length || 0} shots`)
  if (all && all.length > 0) {
    console.log('  Formats:', [...new Set(all.map(s => s.format))].join(', '))
  }

  // Try WITH format filter
  const { data: filtered, error: e2 } = await supabase
    .from('angled_shots')
    .select('id, angle_name, format')
    .eq('category_id', category.id)
    .eq('format', '1:1')

  console.log(`\nWith format='1:1' filter: ${filtered?.length || 0} shots`)

  // Try with FULL query (like the API)
  const { data: full, error: e3 } = await supabase
    .from('angled_shots')
    .select(`
      id,
      angle_name,
      product:products!inner(id, name),
      product_image:product_images!inner(id, file_name)
    `)
    .eq('category_id', category.id)
    .eq('format', '1:1')

  console.log(`\nWith full query (joins): ${full?.length || 0} shots`)
  if (e3) console.error('Error:', e3)
}

testQuery().catch(console.error)
