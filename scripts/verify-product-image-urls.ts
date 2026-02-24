#!/usr/bin/env tsx
/**
 * Verify product image URLs are populated
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

async function verifyProductImageUrls() {
  console.log('🔍 Checking product image URLs...\n')

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

  console.log(`Found ${images.length} product image(s):\n`)

  images.forEach((img, index) => {
    console.log(`Image ${index + 1}:`)
    console.log(`  File: ${img.file_name}`)
    console.log(`  file_path: ${img.file_path}`)
    console.log(`  storage_provider: ${img.storage_provider}`)
    console.log(`  storage_path: ${img.storage_path}`)
    console.log(`  storage_url: ${img.storage_url}`)
    console.log(`  is_primary: ${img.is_primary}`)
    console.log('')
  })
}

verifyProductImageUrls()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
