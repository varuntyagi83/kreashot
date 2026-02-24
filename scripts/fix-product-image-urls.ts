#!/usr/bin/env tsx
/**
 * Fix product image URLs - Populate storage_url for existing records
 * Run this after migration 007 to populate storage URLs for existing product images
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function fixProductImageUrls() {
  console.log('🔧 Fixing product image URLs...\n')

  // Get all product images that are missing storage_url or have supabase storage
  const { data: images, error: fetchError } = await supabase
    .from('product_images')
    .select('*')
    .or('storage_url.is.null,storage_provider.eq.supabase')

  if (fetchError) {
    console.error('❌ Error fetching product images:', fetchError)
    process.exit(1)
  }

  if (!images || images.length === 0) {
    console.log('✅ No product images need fixing')
    return
  }

  console.log(`Found ${images.length} product images to fix\n`)

  let fixed = 0
  let failed = 0

  for (const image of images) {
    try {
      // Generate public URL from file_path
      if (image.file_path) {
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(image.file_path)

        // Update the record with storage sync fields
        const { error: updateError } = await supabase
          .from('product_images')
          .update({
            storage_provider: 'supabase',
            storage_path: image.file_path,
            storage_url: publicUrl,
          })
          .eq('id', image.id)

        if (updateError) {
          console.error(`❌ Failed to update ${image.file_name}:`, updateError)
          failed++
        } else {
          console.log(`✅ Fixed ${image.file_name}`)
          fixed++
        }
      } else {
        console.warn(`⚠️  Skipped ${image.file_name} - no file_path`)
        failed++
      }
    } catch (error) {
      console.error(`❌ Error processing ${image.file_name}:`, error)
      failed++
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   ✅ Fixed: ${fixed}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📝 Total: ${images.length}`)
}

fixProductImageUrls()
  .then(() => {
    console.log('\n🎉 Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
