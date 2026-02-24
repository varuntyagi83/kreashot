#!/usr/bin/env tsx
/**
 * Re-upload vitamin-c-gummies image from Google Drive to AdForge folder
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { uploadFile } from '../src/lib/storage'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL!
const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')!

if (!supabaseUrl || !supabaseServiceKey || !clientEmail || !privateKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Initialize Google Drive
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

async function reuploadVitaminCImage() {
  console.log('🔄 Re-uploading Vitamin C Gummies image to Google Drive...\n')

  // Source file ID from the provided link
  const sourceFileId = '1SZzg2EK1t-v2jHwJQoQqkwC_n6ObmPA8'

  try {
    // Download the file from Google Drive
    console.log('📥 Downloading image from Google Drive...')
    const response = await drive.files.get(
      {
        fileId: sourceFileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(response.data as ArrayBuffer)
    console.log(`   ✅ Downloaded ${buffer.length} bytes`)

    // Get the product image record
    const { data: image, error: fetchError } = await supabase
      .from('product_images')
      .select(`
        *,
        product:products!inner(id, slug, category:categories!inner(id, slug))
      `)
      .eq('file_name', 'vitamin-c-gummies.jpg')
      .single()

    if (fetchError || !image) {
      console.error('❌ Product image record not found in database')
      process.exit(1)
    }

    // Get category and product slugs
    const categorySlug = (image.product as any).category.slug
    const productSlug = (image.product as any).slug

    console.log(`   Category: ${categorySlug}`)
    console.log(`   Product: ${productSlug}`)

    // Upload to Google Drive at correct path
    const fileName = `${categorySlug}/${productSlug}/product-images/${image.file_name}`
    console.log(`\n📤 Uploading to: ${fileName}`)

    const storageFile = await uploadFile(buffer, fileName, {
      contentType: 'image/jpeg',
      provider: 'gdrive',
    })

    console.log(`   ✅ Uploaded successfully`)
    console.log(`   📍 URL: ${storageFile.publicUrl}`)
    console.log(`   🆔 File ID: ${storageFile.fileId}`)

    // Update database record
    console.log(`\n💾 Updating database...`)
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
      console.error('❌ Failed to update database:', updateError)
      process.exit(1)
    }

    console.log('   ✅ Database updated')

    console.log('\n🎉 Image successfully re-uploaded to Google Drive!')
    console.log(`\nNew storage details:`)
    console.log(`  Provider: gdrive`)
    console.log(`  Path: ${storageFile.path}`)
    console.log(`  URL: ${storageFile.publicUrl}`)
    console.log(`  File ID: ${storageFile.fileId}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

reuploadVitaminCImage()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
