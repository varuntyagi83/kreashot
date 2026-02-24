#!/usr/bin/env tsx
/**
 * Link vitamin-c-gummies database record to existing Google Drive file
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
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

async function linkVitaminCImageToGDrive() {
  console.log('🔗 Linking Vitamin C Gummies image to Google Drive...\n')

  // File ID from the provided link
  const gdriveFileId = '1SZzg2EK1t-v2jHwJQoQqkwC_n6ObmPA8'

  try {
    // Get file details from Google Drive
    console.log('📋 Getting file details from Google Drive...')
    const { data: fileData } = await drive.files.get({
      fileId: gdriveFileId,
      fields: 'id, name, mimeType, webViewLink, parents',
      supportsAllDrives: true,
    })

    console.log(`   File name: ${fileData.name}`)
    console.log(`   MIME type: ${fileData.mimeType}`)
    console.log(`   File ID: ${fileData.id}`)

    // Generate thumbnail URL
    const thumbnailUrl = `https://drive.google.com/thumbnail?id=${gdriveFileId}&sz=w2000`
    console.log(`   Thumbnail URL: ${thumbnailUrl}`)

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

    // Get category and product slugs for storage path
    const categorySlug = (image.product as any).category.slug
    const productSlug = (image.product as any).slug
    const storagePath = `${categorySlug}/${productSlug}/product-images/${fileData.name}`

    console.log(`\n💾 Updating database...`)
    console.log(`   Storage path: ${storagePath}`)

    // Update database record
    const { error: updateError } = await supabase
      .from('product_images')
      .update({
        storage_provider: 'gdrive',
        storage_path: storagePath,
        storage_url: thumbnailUrl,
        gdrive_file_id: gdriveFileId,
      })
      .eq('id', image.id)

    if (updateError) {
      console.error('❌ Failed to update database:', updateError)
      process.exit(1)
    }

    console.log('   ✅ Database updated')

    console.log('\n🎉 Image successfully linked to Google Drive!')
    console.log(`\nStorage details:`)
    console.log(`  Provider: gdrive`)
    console.log(`  Path: ${storagePath}`)
    console.log(`  URL: ${thumbnailUrl}`)
    console.log(`  File ID: ${gdriveFileId}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

linkVitaminCImageToGDrive()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
