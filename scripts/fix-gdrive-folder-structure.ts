#!/usr/bin/env tsx
/**
 * Fix Google Drive folder structure - Move file from UUID folder to human-readable folder
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
      console.log(`  ✓ Found folder: ${folderName} (${currentFolderId})`)
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
      console.log(`  + Created folder: ${folderName} (${currentFolderId})`)
    }
  }

  return currentFolderId
}

async function fixGDriveFolderStructure() {
  console.log('🔧 Fixing Google Drive folder structure...\n')

  const gdriveFileId = '1SZzg2EK1t-v2jHwJQoQqkwC_n6ObmPA8'

  try {
    // Get file details from Google Drive
    console.log('📋 Getting file details from Google Drive...')
    const { data: fileData } = await drive.files.get({
      fileId: gdriveFileId,
      fields: 'id, name, mimeType, parents, webViewLink',
      supportsAllDrives: true,
    })

    console.log(`   File name: ${fileData.name}`)
    console.log(`   MIME type: ${fileData.mimeType}`)
    console.log(`   File ID: ${fileData.id}`)
    console.log(`   Current parent(s): ${fileData.parents?.join(', ')}\n`)

    // Get the product image record to determine correct path
    const { data: image, error: fetchError } = await supabase
      .from('product_images')
      .select(`
        *,
        product:products!inner(id, slug, category:categories!inner(id, slug))
      `)
      .eq('gdrive_file_id', gdriveFileId)
      .single()

    if (fetchError || !image) {
      console.error('❌ Product image record not found in database')
      process.exit(1)
    }

    // Get category and product slugs for storage path
    const categorySlug = (image.product as any).category.slug
    const productSlug = (image.product as any).slug
    const targetFolderPath = `${categorySlug}/${productSlug}/product-images`

    console.log(`📁 Target folder structure: ${targetFolderPath}`)
    console.log('\n🔨 Creating/finding target folder structure...')

    // Get or create the target folder
    const targetFolderId = await getOrCreateFolder(targetFolderPath)

    console.log(`\n✅ Target folder ready: ${targetFolderId}`)

    // Check if file is already in the correct folder
    if (fileData.parents && fileData.parents.includes(targetFolderId)) {
      console.log('\n✓ File is already in the correct folder!')
      return
    }

    // Move the file to the correct folder
    console.log(`\n🚚 Moving file to correct folder...`)

    const previousParents = fileData.parents?.join(',')

    await drive.files.update({
      fileId: gdriveFileId,
      addParents: targetFolderId,
      removeParents: previousParents,
      supportsAllDrives: true,
      fields: 'id, name, parents',
    })

    console.log('   ✅ File moved successfully!')

    // Verify the move
    const { data: updatedFile } = await drive.files.get({
      fileId: gdriveFileId,
      fields: 'id, name, parents, webViewLink',
      supportsAllDrives: true,
    })

    console.log(`\n📋 Updated file details:`)
    console.log(`   File name: ${updatedFile.name}`)
    console.log(`   New parent(s): ${updatedFile.parents?.join(', ')}`)
    console.log(`   Web view link: ${updatedFile.webViewLink}`)

    // Update database record with correct storage_path
    const newStoragePath = `${targetFolderPath}/${fileData.name}`
    const { error: updateError } = await supabase
      .from('product_images')
      .update({
        storage_path: newStoragePath,
      })
      .eq('id', image.id)

    if (updateError) {
      console.error('❌ Failed to update database:', updateError)
    } else {
      console.log(`\n💾 Database updated with new storage path: ${newStoragePath}`)
    }

    console.log('\n🎉 Google Drive folder structure fixed!')
    console.log(`\nThe file is now at: ${targetFolderPath}/${fileData.name}`)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

fixGDriveFolderStructure()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
