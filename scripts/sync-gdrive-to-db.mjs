#!/usr/bin/env node
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const formatMap = {
  '1x1': { format: '1:1', width: 1080, height: 1080 },
  '16x9': { format: '16:9', width: 1920, height: 1080 },
  '9x16': { format: '9:16', width: 1080, height: 1920 },
  '4x5': { format: '4:5', width: 1080, height: 1350 },
}

async function syncAngledShots() {
  // Get the product
  const { data: product } = await supabase
    .from('products')
    .select('id, category_id, user_id, slug')
    .eq('slug', 'vitamin-c-gummies')
    .single()

  if (!product) {
    console.log('Product not found')
    return
  }

  console.log(`Found product: ${product.slug}`)
  console.log(`Product ID: ${product.id}`)
  console.log(`Category ID: ${product.category_id}`)
  console.log(`User ID: ${product.user_id}`)

  // Get a product image to use as reference
  const { data: productImage } = await supabase
    .from('product_images')
    .select('id, file_name')
    .eq('product_id', product.id)
    .limit(1)
    .single()

  if (!productImage) {
    console.log('No product images found')
    return
  }

  console.log(`Using product_image_id: ${productImage.id}\n`)

  // Check existing angled shots in DB
  const { data: existing } = await supabase
    .from('angled_shots')
    .select('angle_name, format, storage_path')
    .eq('product_id', product.id)

  const existingPaths = new Set(existing?.map(s => s.storage_path) || [])
  console.log(`Existing DB records: ${existing?.length || 0}\n`)

  // Scan each format folder
  let totalAdded = 0

  for (const [folderName, dims] of Object.entries(formatMap)) {
    console.log(`\n📊 Processing ${dims.format} format...`)
    
    // List files in the format folder
    const path = `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/${folderName}`
    const files = await listFilesInPath(path)
    
    console.log(`   Found ${files.length} files in Google Drive`)

    for (const file of files) {
      const storagePath = `${path}/${file.name}`
      
      if (existingPaths.has(storagePath)) {
        console.log(`   ⏭️  Skip: ${file.name} (already in DB)`)
        continue
      }

      // Extract angle name from filename (e.g., "front_16:9_1771718577469.jpg" -> "front")
      const angleName = file.name.split('_')[0].replace('.jpeg', '').replace('.jpg', '')
      const angleDesc = angleName.replace(/_/g, ' ')
      
      // Create DB record
      const { error } = await supabase
        .from('angled_shots')
        .insert({
          product_id: product.id,
          product_image_id: productImage.id,
          category_id: product.category_id,
          user_id: product.user_id,
          angle_name: angleName,
          angle_description: angleDesc,
          prompt_used: null,
          format: dims.format,
          width: dims.width,
          height: dims.height,
          storage_provider: 'gdrive',
          storage_path: storagePath,
          storage_url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w2000`,
          gdrive_file_id: file.id,
          metadata: {},
        })

      if (error) {
        console.log(`   ❌ Error: ${file.name} - ${error.message}`)
      } else {
        console.log(`   ✅ Added: ${file.name}`)
        totalAdded++
      }
    }
  }

  console.log(`\n✨ Done! Added ${totalAdded} new angled shots to database`)
}

async function listFilesInPath(path) {
  const parts = path.split('/').filter(Boolean)
  let currentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  // Navigate to the folder
  for (const folderName of parts) {
    const { data } = await drive.files.list({
      q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (!data.files || data.files.length === 0) {
      return []
    }

    currentFolderId = data.files[0].id
  }

  // List files in the folder
  const { data } = await drive.files.list({
    q: `'${currentFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  return data.files || []
}

syncAngledShots().catch(console.error)
