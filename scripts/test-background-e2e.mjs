#!/usr/bin/env node
/**
 * End-to-end test for background upload + delete flow.
 * Tests: Upload to GDrive -> Save to Supabase -> Verify -> Delete -> Verify cleanup
 *
 * Usage: node scripts/test-background-e2e.mjs
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { Readable } from 'stream'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GDRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GDRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}
if (!GDRIVE_CLIENT_EMAIL || !GDRIVE_PRIVATE_KEY) {
  console.error('Missing GOOGLE_DRIVE_CLIENT_EMAIL or GOOGLE_DRIVE_PRIVATE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// GDrive client using individual env vars
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GDRIVE_CLIENT_EMAIL,
    private_key: GDRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

// Category & user
const CATEGORY_ID = 'c1d1389c-c3fd-4fbb-ba6d-e884a1989c61' // Greenworld
const USER_ID = '189a8d40-744d-452c-b716-66bdf3cf8976'

// Minimal 1x1 red PNG
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg=='

let createdBackgroundId = null
let createdGdriveFileId = null

async function findOrCreateFolder(parentId, folderName) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id
  }
  const create = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return create.data.id
}

async function step1_listBackgrounds() {
  console.log('\n=== STEP 1: List current backgrounds ===')
  const { data, error } = await supabase
    .from('backgrounds')
    .select('id, name, format, storage_provider, gdrive_file_id')
    .eq('category_id', CATEGORY_ID)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) throw new Error(`List failed: ${error.message}`)
  console.log(`  Found ${data.length} backgrounds`)
  data.forEach(bg => console.log(`    - ${bg.name} (${bg.format}) [gdrive: ${bg.gdrive_file_id ? 'yes' : 'NO'}]`))
  return data.length
}

async function step2_uploadToGDrive() {
  console.log('\n=== STEP 2: Upload test image to GDrive ===')

  // Find the root folder for this project (look for greenworld folder)
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootFolderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID')

  // Navigate/create: root -> greenworld -> backgrounds -> 1x1
  const catFolderId = await findOrCreateFolder(rootFolderId, 'greenworld')
  const bgFolderId = await findOrCreateFolder(catFolderId, 'backgrounds')
  const formatFolderId = await findOrCreateFolder(bgFolderId, '1x1')

  const buffer = Buffer.from(TINY_PNG_B64, 'base64')
  const slug = `e2e-test-${Date.now()}`
  const fileName = `${slug}.png`

  console.log(`  Uploading ${fileName} to GDrive...`)
  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [formatFolderId],
    },
    media: {
      mimeType: 'image/png',
      body: Readable.from(buffer),
    },
    fields: 'id,name,webViewLink',
    supportsAllDrives: true,
  })

  createdGdriveFileId = file.data.id
  console.log(`  GDrive upload OK: fileId=${createdGdriveFileId}`)

  // Make public
  await drive.permissions.create({
    fileId: createdGdriveFileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  const publicUrl = `https://lh3.googleusercontent.com/d/${createdGdriveFileId}=w2000`
  console.log(`  Public URL: ${publicUrl}`)

  return { slug, publicUrl, path: `greenworld/backgrounds/1x1/${fileName}` }
}

async function step3_insertSupabase(uploadResult) {
  console.log('\n=== STEP 3: Insert background record into Supabase ===')

  const { data: bg, error } = await supabase
    .from('backgrounds')
    .insert({
      category_id: CATEGORY_ID,
      user_id: USER_ID,
      name: 'E2E Test Background',
      slug: uploadResult.slug,
      description: 'Automated test - safe to delete',
      prompt_used: 'Uploaded background (no prompt)',
      format: '1:1',
      width: 1,
      height: 1,
      storage_provider: 'gdrive',
      storage_path: uploadResult.path,
      storage_url: uploadResult.publicUrl,
      gdrive_file_id: createdGdriveFileId,
      metadata: { test: true },
    })
    .select()
    .single()

  if (error) throw new Error(`Supabase insert failed: ${error.message}`)

  createdBackgroundId = bg.id
  console.log(`  Supabase insert OK: id=${bg.id}`)
  console.log(`  All 4 storage fields populated:`)
  console.log(`    storage_provider: ${bg.storage_provider}`)
  console.log(`    storage_path:     ${bg.storage_path}`)
  console.log(`    storage_url:      ${bg.storage_url.substring(0, 60)}...`)
  console.log(`    gdrive_file_id:   ${bg.gdrive_file_id}`)
  return bg
}

async function step4_verifyExists() {
  console.log('\n=== STEP 4: Verify background exists everywhere ===')

  // Supabase
  const { data: bg, error } = await supabase
    .from('backgrounds')
    .select('*')
    .eq('id', createdBackgroundId)
    .single()
  if (error || !bg) throw new Error(`Supabase: NOT FOUND`)
  console.log(`  Supabase: FOUND`)

  // GDrive
  try {
    const res = await drive.files.get({ fileId: createdGdriveFileId, fields: 'id,name', supportsAllDrives: true })
    console.log(`  GDrive:   FOUND (${res.data.name})`)
  } catch (err) {
    throw new Error(`GDrive: NOT FOUND (${err.message})`)
  }

  // URL accessibility
  try {
    const resp = await fetch(bg.storage_url, { method: 'HEAD' })
    console.log(`  URL:      HTTP ${resp.status} ${resp.status === 200 ? '(accessible)' : '(not 200)'}`)
  } catch (err) {
    console.log(`  URL:      UNREACHABLE (${err.message})`)
  }
}

async function step5_deleteBackground() {
  console.log('\n=== STEP 5: Delete background from Supabase ===')

  const { error } = await supabase
    .from('backgrounds')
    .delete()
    .eq('id', createdBackgroundId)

  if (error) throw new Error(`Delete failed: ${error.message}`)
  console.log(`  Supabase delete: OK`)
}

async function step6_verifyDeleted() {
  console.log('\n=== STEP 6: Verify deletion + cleanup ===')

  // Supabase record should be gone
  const { data: bg } = await supabase
    .from('backgrounds')
    .select('id')
    .eq('id', createdBackgroundId)
    .single()
  console.log(`  Supabase record: ${bg ? 'STILL EXISTS (BUG!)' : 'GONE (correct)'}`)
  if (bg) throw new Error('Background still in Supabase after delete!')

  // Deletion queue should have an entry
  const { data: queue } = await supabase
    .from('deletion_queue')
    .select('id, status, gdrive_file_id, resource_type')
    .eq('gdrive_file_id', createdGdriveFileId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (queue && queue.length > 0) {
    const entry = queue[0]
    console.log(`  Deletion queue: FOUND (status="${entry.status}", type="${entry.resource_type}")`)
  } else {
    console.log(`  Deletion queue: NOT FOUND (trigger may not have fired - check DB trigger)`)
  }

  // GDrive file should still exist (async cleanup hasn't run)
  try {
    await drive.files.get({ fileId: createdGdriveFileId, fields: 'id', supportsAllDrives: true })
    console.log(`  GDrive file:    STILL EXISTS (expected - async cleanup pending)`)
  } catch (err) {
    console.log(`  GDrive file:    ALREADY GONE`)
  }

  // Manual cleanup
  console.log(`\n  Cleaning up test artifacts...`)
  try {
    await drive.files.delete({ fileId: createdGdriveFileId, supportsAllDrives: true })
    console.log(`    GDrive file deleted`)
  } catch (err) {
    console.log(`    GDrive file already gone`)
  }

  // Clean up deletion queue entry
  if (queue && queue.length > 0) {
    await supabase.from('deletion_queue').delete().eq('id', queue[0].id)
    console.log(`    Deletion queue entry cleaned up`)
  }
}

async function main() {
  console.log('========================================')
  console.log(' Background E2E Test')
  console.log('========================================')

  try {
    await step1_listBackgrounds()
    const uploadResult = await step2_uploadToGDrive()
    await step3_insertSupabase(uploadResult)
    await step4_verifyExists()
    await step5_deleteBackground()
    await step6_verifyDeleted()

    console.log('\n========================================')
    console.log(' ALL STEPS PASSED')
    console.log('========================================')
  } catch (err) {
    console.error(`\nFAILED: ${err.message}`)
    console.error(err.stack)

    // Cleanup on failure
    if (createdBackgroundId) {
      console.log('\nCleaning up test data...')
      await supabase.from('backgrounds').delete().eq('id', createdBackgroundId)
    }
    if (createdGdriveFileId) {
      try { await drive.files.delete({ fileId: createdGdriveFileId }) } catch {}
    }
    process.exit(1)
  }
}

main()
