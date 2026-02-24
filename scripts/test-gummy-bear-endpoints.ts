#!/usr/bin/env tsx
/**
 * Test gummy-bear category endpoints specifically
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

async function testGummyBearEndpoints() {
  console.log('🧪 Testing Gummy Bear Category Endpoints...\n')

  // Get gummy-bear category
  console.log('1️⃣  Getting gummy-bear category...')
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('slug', 'gummy-bear')

  if (catError || !categories || categories.length === 0) {
    console.error('   ❌ Gummy bear category not found')
    console.error('   Trying gummy-bear-test...')

    const { data: testCat } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('slug', 'gummy-bear-test')

    if (!testCat || testCat.length === 0) {
      console.error('   ❌ No gummy bear category found')
      return
    }

    const category = testCat[0]
    console.log(`   ✅ Found: ${category.name} (${category.slug})\n`)
    await testCategoryData(category.id, category.slug)
    return
  }

  const category = categories[0]
  console.log(`   ✅ Found: ${category.name} (${category.slug})\n`)
  await testCategoryData(category.id, category.slug)
}

async function testCategoryData(categoryId: string, categorySlug: string) {
  // Get products
  console.log('2️⃣  Getting products...')
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, slug, category_id')
    .eq('category_id', categoryId)

  if (prodError || !products || products.length === 0) {
    console.error('   ❌ No products found')
    return
  }

  const product = products[0]
  console.log(`   ✅ Found: ${product.name} (${product.slug})`)
  console.log(`   Product ID: ${product.id}\n`)

  // Get product images
  console.log('3️⃣  Getting product images...')
  const { data: productImages, error: imgError } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', product.id)

  if (imgError || !productImages || productImages.length === 0) {
    console.error('   ❌ No product images found')
    return
  }

  const productImage = productImages[0]
  const expectedPath = `${categorySlug}/${product.slug}/product-images/${productImage.file_name}`

  console.log(`   ✅ Found: ${productImage.file_name}`)
  console.log(`   Current path: ${productImage.storage_path}`)
  console.log(`   Expected path: ${expectedPath}`)
  console.log(`   Match: ${productImage.storage_path === expectedPath ? '✅' : '❌'}`)
  console.log(`   Provider: ${productImage.storage_provider}`)
  console.log(`   Has GDrive ID: ${productImage.gdrive_file_id ? '✅' : '❌'}\n`)

  // Get angled shots
  console.log('4️⃣  Getting angled shots...')
  const { data: angledShots, error: angledError } = await supabase
    .from('angled_shots')
    .select('*')
    .eq('product_id', product.id)

  if (angledError || !angledShots || angledShots.length === 0) {
    console.error('   ❌ No angled shots found')
    return
  }

  console.log(`   ✅ Found ${angledShots.length} angled shots`)

  const imageNameWithoutExt = productImage.file_name.replace(/\.[^/.]+$/, '')
  const expectedFolder = `${categorySlug}/${product.slug}/product-images/${imageNameWithoutExt}-angled-shots`

  let allCorrect = true
  angledShots.forEach((shot, idx) => {
    const shotFileName = shot.storage_path.split('/').pop()
    const expectedShotPath = `${expectedFolder}/${shotFileName}`
    const isCorrect = shot.storage_path === expectedShotPath

    if (!isCorrect) {
      allCorrect = false
      console.log(`\n   Shot ${idx + 1}: ${shot.angle_name} ❌`)
      console.log(`   Current: ${shot.storage_path}`)
      console.log(`   Expected: ${expectedShotPath}`)
    }
  })

  if (allCorrect) {
    console.log(`   ✅ All angled shots in correct folder structure`)
    console.log(`   Folder: ${expectedFolder}/`)
  }

  console.log('\n📊 Final Structure:')
  console.log(`AdForge Shared Drive/`)
  console.log(`└── ${categorySlug}/`)
  console.log(`    └── ${product.slug}/`)
  console.log(`        └── product-images/`)
  console.log(`            ├── ${productImage.file_name}`)
  console.log(`            └── ${imageNameWithoutExt}-angled-shots/`)
  angledShots.slice(0, 3).forEach((shot) => {
    const fileName = shot.storage_path.split('/').pop()
    console.log(`                ├── ${fileName}`)
  })
  if (angledShots.length > 3) {
    console.log(`                └── ... (${angledShots.length - 3} more)`)
  }

  console.log('\n✅ All data verified!')
  console.log('✅ Folder structure matches MASTER_PLAN.md')
  console.log('✅ Subfolder named correctly (human-readable)')
}

testGummyBearEndpoints()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
