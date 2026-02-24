#!/usr/bin/env tsx
/**
 * Fix product image paths - Remove duplicate bucket name from file_path
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

async function fixProductImagePaths() {
  console.log('🔧 Fixing product image paths...\n')

  const { data: images, error } = await supabase
    .from('product_images')
    .select('*')

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!images || images.length === 0) {
    console.log('No product images found')
    return
  }

  let fixed = 0

  for (const img of images) {
    let filePath = img.file_path

    // Remove 'product-images/' prefix if it exists
    if (filePath && filePath.startsWith('product-images/')) {
      filePath = filePath.replace('product-images/', '')

      // Generate correct public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)

      console.log(`Fixing: ${img.file_name}`)
      console.log(`  Old path: ${img.file_path}`)
      console.log(`  New path: ${filePath}`)
      console.log(`  Old URL: ${img.storage_url}`)
      console.log(`  New URL: ${publicUrl}`)
      console.log('')

      // Update the record
      const { error: updateError } = await supabase
        .from('product_images')
        .update({
          file_path: filePath,
          storage_path: filePath,
          storage_url: publicUrl,
        })
        .eq('id', img.id)

      if (updateError) {
        console.error(`❌ Failed to update:`, updateError)
      } else {
        fixed++
      }
    }
  }

  console.log(`\n✅ Fixed ${fixed} product image(s)`)
}

fixProductImagePaths()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
