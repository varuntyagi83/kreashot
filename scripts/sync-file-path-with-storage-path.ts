#!/usr/bin/env tsx
/**
 * Sync file_path with storage_path for consistency
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

async function syncFilePathWithStoragePath() {
  console.log('🔄 Syncing file_path with storage_path...\n')

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

  let updated = 0

  for (const img of images) {
    if (img.file_path !== img.storage_path) {
      console.log(`Updating: ${img.file_name}`)
      console.log(`  Old file_path: ${img.file_path}`)
      console.log(`  New file_path: ${img.storage_path}`)

      const { error: updateError } = await supabase
        .from('product_images')
        .update({
          file_path: img.storage_path,
        })
        .eq('id', img.id)

      if (updateError) {
        console.error(`  ❌ Failed to update:`, updateError)
      } else {
        updated++
        console.log(`  ✅ Updated\n`)
      }
    }
  }

  console.log(`✅ Synced ${updated} product image(s)`)
}

syncFilePathWithStoragePath()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
