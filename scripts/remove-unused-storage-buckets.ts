#!/usr/bin/env tsx
/**
 * Remove unused Supabase Storage buckets
 * All storage has been migrated to Google Drive
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const BUCKETS_TO_REMOVE = [
  'brand-assets',
  'assets',
  'angled-shots',
  'backgrounds',
  'angled-product-background',
  'copy-doc',
  'guidelines',
  'final-assets',
]

async function removeBuckets() {
  console.log('🗑️  Removing unused Supabase Storage buckets...\n')

  let successCount = 0
  let failCount = 0

  for (const bucketId of BUCKETS_TO_REMOVE) {
    try {
      // First, try to list files to verify it's empty
      const { data: files, error: listError } = await supabase.storage
        .from(bucketId)
        .list()

      if (listError) {
        console.log(`   ⚠️  ${bucketId}: Bucket doesn't exist or can't be accessed`)
        continue
      }

      if (files && files.length > 0) {
        console.log(
          `   ⚠️  ${bucketId}: Contains ${files.length} files - skipping (empty it first)`
        )
        failCount++
        continue
      }

      // Delete the bucket
      const { error: deleteError } = await supabase.storage.deleteBucket(bucketId)

      if (deleteError) {
        console.error(`   ❌ ${bucketId}: ${deleteError.message}`)
        failCount++
      } else {
        console.log(`   ✅ ${bucketId}: Deleted successfully`)
        successCount++
      }
    } catch (error) {
      console.error(`   ❌ ${bucketId}: ${error}`)
      failCount++
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   ✅ Deleted: ${successCount}`)
  console.log(`   ❌ Failed: ${failCount}`)
  console.log(`   📦 Total: ${BUCKETS_TO_REMOVE.length}`)

  if (successCount === BUCKETS_TO_REMOVE.length) {
    console.log(`\n🎉 All unused storage buckets removed!`)
    console.log('   AdForge now uses Google Drive exclusively for storage.')
  } else if (failCount > 0) {
    console.log(`\n⚠️  Some buckets couldn't be deleted.`)
    console.log('   Check the errors above for details.')
  }
}

removeBuckets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
