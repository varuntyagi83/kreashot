#!/usr/bin/env tsx
/**
 * Migrate product images from Supabase Storage to Google Drive
 */

import { createClient } from '@supabase/supabase-js'
import { uploadFile } from '../src/lib/storage'
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

async function migrateProductImagesToGDrive() {
  console.log('🚀 Migrating product images from Supabase Storage to Google Drive...\n')

  // Get all product images stored in Supabase
  const { data: images, error: fetchError } = await supabase
    .from('product_images')
    .select(`
      *,
      product:products!inner(id, slug, category:categories!inner(id, slug))
    `)
    .eq('storage_provider', 'supabase')

  if (fetchError) {
    console.error('❌ Error fetching product images:', fetchError)
    process.exit(1)
  }

  if (!images || images.length === 0) {
    console.log('✅ No product images to migrate')
    return
  }

  console.log(`Found ${images.length} product image(s) to migrate\n`)

  let migrated = 0
  let failed = 0

  for (const image of images) {
    try {
      console.log(`Migrating: ${image.file_name}`)

      // Download from Supabase Storage
      const { data: blob, error: downloadError } = await supabase.storage
        .from('product-images')
        .download(image.file_path)

      if (downloadError || !blob) {
        console.error(`  ❌ Failed to download from Supabase:`, downloadError)
        failed++
        continue
      }

      // Convert blob to buffer
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Get category and product slugs
      const categorySlug = (image.product as any).category.slug
      const productSlug = (image.product as any).slug

      // Generate Google Drive path using slugs
      const fileExt = image.file_name.split('.').pop()
      const fileName = `${categorySlug}/${productSlug}/product-images/${image.file_name}`

      console.log(`  📤 Uploading to Google Drive: ${fileName}`)

      // Upload to Google Drive
      const storageFile = await uploadFile(buffer, fileName, {
        contentType: image.mime_type,
        provider: 'gdrive',
      })

      console.log(`  ✅ Uploaded to Google Drive`)
      console.log(`     URL: ${storageFile.publicUrl}`)

      // Update database record
      const { error: updateError } = await supabase
        .from('product_images')
        .update({
          storage_provider: 'gdrive',
          storage_path: storageFile.path,
          storage_url: storageFile.publicUrl,
          gdrive_file_id: storageFile.fileId || null,
        })
        .eq('id', image.id)

      if (updateError) {
        console.error(`  ❌ Failed to update database:`, updateError)
        failed++
        continue
      }

      // Delete from Supabase Storage
      console.log(`  🗑️  Deleting from Supabase Storage...`)
      const { error: deleteError } = await supabase.storage
        .from('product-images')
        .remove([image.file_path])

      if (deleteError) {
        console.warn(`  ⚠️  Failed to delete from Supabase (file migrated anyway):`, deleteError)
      } else {
        console.log(`  ✅ Deleted from Supabase Storage`)
      }

      migrated++
      console.log('')
    } catch (error) {
      console.error(`  ❌ Error:`, error)
      failed++
      console.log('')
    }
  }

  console.log(`\n📊 Migration Summary:`)
  console.log(`   ✅ Migrated: ${migrated}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📝 Total: ${images.length}`)
}

migrateProductImagesToGDrive()
  .then(() => {
    console.log('\n🎉 Migration complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
