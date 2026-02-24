#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function checkReferences() {
  // Get angled shots
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, angle_name, product_id, product_image_id')

  console.log(`Checking ${shots.length} angled shots...`)

  // Check product references
  const productIds = [...new Set(shots.map(s => s.product_id))]
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .in('id', productIds)

  console.log(`\n📦 Products: ${products.length}/${productIds.length} exist`)

  // Check product_image references  
  const imageIds = [...new Set(shots.map(s => s.product_image_id))]
  const { data: images } = await supabase
    .from('product_images')
    .select('id, file_name')
    .in('id', imageIds)

  console.log(`🖼️  Product Images: ${images.length}/${imageIds.length} exist`)

  if (images.length < imageIds.length) {
    const existingIds = new Set(images.map(i => i.id))
    const missingIds = imageIds.filter(id => !existingIds.has(id))
    console.log(`\n❌ Missing product_image_ids:`)
    missingIds.forEach(id => console.log(`   - ${id}`))
    
    const orphanedShots = shots.filter(s => missingIds.includes(s.product_image_id))
    console.log(`\n⚠️  ${orphanedShots.length} angled shots reference missing product_images`)
  }
}

checkReferences().catch(console.error)
