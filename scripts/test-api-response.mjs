#!/usr/bin/env node
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Vitamin C Gummies category
const format = '1:1'

async function testApiResponse() {
  try {
    // We need to simulate an authenticated request
    // For now, just check the database directly
    const { createClient } = await import('@supabase/supabase-js')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: shots, error } = await supabase
      .from('angled_shots')
      .select(`
        id,
        angle_name,
        storage_url,
        storage_provider,
        product:products!inner(id, name, slug)
      `)
      .eq('category_id', categoryId)
      .eq('format', format)
      .limit(3)

    if (error) {
      console.error('Error:', error)
      return
    }

    console.log(`Sample angled shots for ${format} format:\n`)

shots.forEach(shot => {
      const publicUrl = shot.storage_url // This is what the API returns as public_url
      console.log(`${shot.angle_name}:`)
      console.log(`  Product: ${shot.product.name}`)
      console.log(`  Provider: ${shot.storage_provider}`)
      console.log(`  URL: ${publicUrl}`)
      console.log(`  URL length: ${publicUrl.length} chars`)
      console.log(`  Starts with: ${publicUrl.substring(0, 50)}...`)
      console.log()
    })

  } catch (error) {
    console.error('Error:', error)
  }
}

testApiResponse()
