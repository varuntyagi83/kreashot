#!/usr/bin/env tsx
/**
 * Reorganize Google Drive folder structure to match new hierarchy
 * Move files from old structure to new structure:
 * OLD: {category}/{product}/angled-shots/{file}
 * NEW: {category}/{product}/product-images/{image-name}-angled-shots/{file}
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
const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID!

if (!supabaseUrl || !supabaseServiceKey || !clientEmail || !privateKey || !rootFolderId) {
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

/**
 * Get or create a folder in Google Drive
 */
async function getOrCreateFolder(folderPath: string): Promise<string> {
  const pathParts = folderPath.split('/').filter(Boolean)
  let currentFolderId = rootFolderId

  for (const folderName of pathParts) {
    // Check if folder exists (support Shared Drives)
    const { data } = await drive.files.list({
      q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (data.files && data.files.length > 0) {
      currentFolderId = data.files[0].id!
    } else {
      // Create folder (support Shared Drives)
      const { data: folder } = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentFolderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      })
      currentFolderId = folder.id!
      console.log(`  + Created folder: ${folderName}`)
    }
  }

  return currentFolderId
}

async function reorganizeGDriveStructure() {
  console.log('🔄 Reorganizing Google Drive folder structure...\n')

  // Get all angled shots from database
  const { data: angledShots, error: fetchError } = await supabase
    .from('angled_shots')
    .select(`
      *,
      product:products!inner(id, slug, category:categories!inner(id, slug)),
      product_image:product_images!inner(id, file_name)
    `)
    .eq('storage_provider', 'gdrive')

  if (fetchError) {
    console.error('❌ Error fetching angled shots:', fetchError)
    process.exit(1)
  }

  if (!angledShots || angledShots.length === 0) {
    console.log('✅ No angled shots found to reorganize')

    // Check product images structure
    console.log('\n📋 Checking product images structure...')
    const { data: productImages } = await supabase
      .from('product_images')
      .select(`
        *,
        product:products!inner(id, slug, category:categories!inner(id, slug))
      `)
      .eq('storage_provider', 'gdrive')

    if (productImages && productImages.length > 0) {
      console.log(`Found ${productImages.length} product image(s):\n`)

      for (const image of productImages) {
        const categorySlug = (image.product as any).category.slug
        const productSlug = (image.product as any).slug
        const expectedPath = `${categorySlug}/${productSlug}/product-images/${image.file_name}`

        console.log(`Image: ${image.file_name}`)
        console.log(`  Current path: ${image.storage_path}`)
        console.log(`  Expected path: ${expectedPath}`)
        console.log(`  Match: ${image.storage_path === expectedPath ? '✅' : '❌'}`)

        if (image.storage_path !== expectedPath) {
          console.log(`  Need to update storage_path in database`)

          const { error: updateError } = await supabase
            .from('product_images')
            .update({ storage_path: expectedPath })
            .eq('id', image.id)

          if (updateError) {
            console.error(`  ❌ Failed to update:`, updateError)
          } else {
            console.log(`  ✅ Updated storage_path`)
          }
        }
        console.log('')
      }
    }

    return
  }

  console.log(`Found ${angledShots.length} angled shot(s) to reorganize\n`)

  let reorganized = 0
  let failed = 0
  let skipped = 0

  for (const shot of angledShots) {
    try {
      const categorySlug = (shot.product as any).category.slug
      const productSlug = (shot.product as any).slug
      const productImageFileName = (shot.product_image as any).file_name
      const imageNameWithoutExt = productImageFileName.replace(/\.[^/.]+$/, '')

      // Extract the angled shot filename from storage_path
      const shotFileName = shot.storage_path.split('/').pop()

      // Build correct paths
      const oldPath = shot.storage_path
      const newPath = `${categorySlug}/${productSlug}/product-images/${imageNameWithoutExt}-angled-shots/${shotFileName}`

      console.log(`Processing: ${shot.angle_name}`)
      console.log(`  Current path: ${oldPath}`)
      console.log(`  New path: ${newPath}`)

      // Check if already in correct location
      if (oldPath === newPath) {
        console.log(`  ✅ Already in correct location\n`)
        skipped++
        continue
      }

      // Get file ID from Google Drive
      if (!shot.gdrive_file_id) {
        console.log(`  ⚠️  No gdrive_file_id, skipping\n`)
        skipped++
        continue
      }

      // Get file details
      const { data: fileData } = await drive.files.get({
        fileId: shot.gdrive_file_id,
        fields: 'id, name, parents',
        supportsAllDrives: true,
      })

      console.log(`  File ID: ${fileData.id}`)
      console.log(`  File name: ${fileData.name}`)

      // Create new folder structure
      const newFolderPath = `${categorySlug}/${productSlug}/product-images/${imageNameWithoutExt}-angled-shots`
      console.log(`  Creating folder: ${newFolderPath}`)
      const targetFolderId = await getOrCreateFolder(newFolderPath)

      // Move file to new location
      const previousParents = fileData.parents?.join(',')
      await drive.files.update({
        fileId: shot.gdrive_file_id,
        addParents: targetFolderId,
        removeParents: previousParents,
        supportsAllDrives: true,
        fields: 'id, parents',
      })

      console.log(`  🚚 Moved file to new location`)

      // Update database with new path
      const { error: updateError } = await supabase
        .from('angled_shots')
        .update({
          storage_path: newPath,
        })
        .eq('id', shot.id)

      if (updateError) {
        console.error(`  ❌ Failed to update database:`, updateError)
        failed++
      } else {
        console.log(`  💾 Updated database`)
        reorganized++
      }

      console.log('')
    } catch (error) {
      console.error(`  ❌ Error:`, error)
      failed++
      console.log('')
    }
  }

  console.log(`\n📊 Reorganization Summary:`)
  console.log(`   ✅ Reorganized: ${reorganized}`)
  console.log(`   ⏭️  Skipped (already correct): ${skipped}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📝 Total: ${angledShots.length}`)
}

reorganizeGDriveStructure()
  .then(() => {
    console.log('\n🎉 Reorganization complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
