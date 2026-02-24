#!/usr/bin/env tsx
/**
 * Fix Google Drive file permissions to ensure files are publicly accessible
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

async function checkAndFixPermissions(fileId: string, fileName: string) {
  try {
    console.log(`\nChecking: ${fileName}`)
    console.log(`  File ID: ${fileId}`)

    // Get current permissions
    const { data: permissions } = await drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id, type, role)',
      supportsAllDrives: true,
    })

    console.log(`  Current permissions:`, permissions.permissions)

    // Check if file has "anyone" permission
    const hasPublicPermission = permissions.permissions?.some(
      (p) => p.type === 'anyone' && p.role === 'reader'
    )

    if (hasPublicPermission) {
      console.log(`  ✅ Already publicly accessible`)
      return true
    }

    // Add public permission
    console.log(`  📝 Adding public permission...`)
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    })

    console.log(`  ✅ Permission added - file is now publicly accessible`)
    return true
  } catch (error: any) {
    console.error(`  ❌ Error:`, error.message)
    return false
  }
}

async function testFileAccess(fileId: string, fileName: string) {
  const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`
  const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`

  console.log(`\nTesting URLs for ${fileName}:`)
  console.log(`  Thumbnail: ${thumbnailUrl}`)
  console.log(`  Direct: ${directUrl}`)

  try {
    // Test with fetch
    const response = await fetch(thumbnailUrl)
    console.log(`  Thumbnail status: ${response.status} ${response.statusText}`)

    if (response.status === 200) {
      console.log(`  ✅ Thumbnail URL is accessible`)
    } else {
      console.log(`  ❌ Thumbnail URL returned ${response.status}`)
      console.log(`  💡 Try direct URL instead`)
    }
  } catch (error: any) {
    console.error(`  ❌ Fetch error:`, error.message)
  }
}

async function fixGDrivePermissions() {
  console.log('🔧 Checking and fixing Google Drive file permissions...\n')

  // Get all files stored in Google Drive
  const { data: productImages, error: imgError } = await supabase
    .from('product_images')
    .select('id, file_name, gdrive_file_id, storage_url')
    .eq('storage_provider', 'gdrive')

  if (imgError) {
    console.error('❌ Error fetching product images:', imgError)
    return
  }

  const { data: angledShots, error: shotError } = await supabase
    .from('angled_shots')
    .select('id, angle_name, gdrive_file_id, storage_url')
    .eq('storage_provider', 'gdrive')

  if (shotError) {
    console.error('❌ Error fetching angled shots:', shotError)
    return
  }

  console.log(
    `Found ${productImages?.length || 0} product images and ${angledShots?.length || 0} angled shots\n`
  )

  // Fix product image permissions
  console.log('📷 Product Images:')
  console.log('==================')
  let fixed = 0
  let failed = 0

  for (const image of productImages || []) {
    if (!image.gdrive_file_id) {
      console.log(`⚠️  ${image.file_name} - no gdrive_file_id`)
      continue
    }

    const success = await checkAndFixPermissions(
      image.gdrive_file_id,
      image.file_name
    )
    if (success) {
      await testFileAccess(image.gdrive_file_id, image.file_name)
      fixed++
    } else {
      failed++
    }
  }

  // Fix angled shot permissions
  console.log('\n\n🎯 Angled Shots:')
  console.log('=================')

  for (const shot of angledShots || []) {
    if (!shot.gdrive_file_id) {
      console.log(`⚠️  ${shot.angle_name} - no gdrive_file_id`)
      continue
    }

    const success = await checkAndFixPermissions(
      shot.gdrive_file_id,
      shot.angle_name
    )
    if (success) {
      fixed++
    } else {
      failed++
    }
  }

  console.log('\n\n📊 Summary:')
  console.log(`   ✅ Fixed/Verified: ${fixed}`)
  console.log(`   ❌ Failed: ${failed}`)

  // Suggest alternative URL format if needed
  console.log('\n\n💡 URL Format Options:')
  console.log(
    '   1. Thumbnail: https://drive.google.com/thumbnail?id={FILE_ID}&sz=w2000'
  )
  console.log('   2. Direct: https://drive.google.com/uc?export=view&id={FILE_ID}')
  console.log(
    '   3. Open: https://drive.google.com/file/d/{FILE_ID}/view?usp=drivesdk'
  )
}

fixGDrivePermissions()
  .then(() => {
    console.log('\n🎉 Permission check complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
