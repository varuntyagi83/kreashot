#!/usr/bin/env tsx
/**
 * Verify angled shots folder structure
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function verifyAngledShotsStructure() {
  console.log('🔍 Checking angled shots structure...\n')

  const { data: angledShots, error } = await supabase
    .from('angled_shots')
    .select(`
      *,
      product:products!inner(id, name, slug, category:categories!inner(id, slug)),
      product_image:product_images!inner(id, file_name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!angledShots || angledShots.length === 0) {
    console.log('No angled shots found')
    return
  }

  console.log(`Found ${angledShots.length} angled shot(s):\n`)

  angledShots.forEach((shot, index) => {
    const categorySlug = (shot.product as any).category.slug
    const productSlug = (shot.product as any).slug
    const productImageFileName = (shot.product_image as any).file_name
    const imageNameWithoutExt = productImageFileName.replace(/\.[^/.]+$/, '')

    const expectedPath = `${categorySlug}/${productSlug}/product-images/${imageNameWithoutExt}-angled-shots`
    const actualFolder = shot.storage_path.split('/').slice(0, -1).join('/')

    console.log(`Angled Shot ${index + 1}:`)
    console.log(`  Angle: ${shot.angle_name}`)
    console.log(`  Product: ${(shot.product as any).name}`)
    console.log(`  Original Image: ${productImageFileName}`)
    console.log(`  storage_provider: ${shot.storage_provider}`)
    console.log(`  storage_path: ${shot.storage_path}`)
    console.log(`  Expected folder: ${expectedPath}`)
    console.log(`  Actual folder: ${actualFolder}`)
    console.log(`  Correct: ${actualFolder === expectedPath ? '✅' : '❌'}`)
    console.log(`  storage_url: ${shot.storage_url}`)
    console.log(`  gdrive_file_id: ${shot.gdrive_file_id}`)
    console.log('')
  })
}

verifyAngledShotsStructure()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
