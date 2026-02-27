#!/usr/bin/env node
/**
 * Finds and deletes orphaned Google Drive files that have no matching
 * gdrive_file_id in any Supabase table (product_images, backgrounds, angled_shots, brand_assets).
 *
 * Usage: node scripts/cleanup-orphaned-drive-files.mjs [--dry-run]
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })
const ROOT_FOLDER = process.env.GOOGLE_DRIVE_FOLDER_ID

async function listAllFiles(folderId, path = '') {
  const files = []
  let pageToken = undefined

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, parents)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    for (const file of res.data.files || []) {
      const fullPath = path ? `${path}/${file.name}` : file.name

      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Recurse into subfolders
        const subFiles = await listAllFiles(file.id, fullPath)
        files.push(...subFiles)
      } else {
        files.push({ id: file.id, name: file.name, path: fullPath })
      }
    }

    pageToken = res.data.nextPageToken
  } while (pageToken)

  return files
}

async function getAllKnownFileIds() {
  const ids = new Set()

  const tables = [
    { name: 'product_images', col: 'gdrive_file_id' },
    { name: 'backgrounds', col: 'gdrive_file_id' },
    { name: 'angled_shots', col: 'gdrive_file_id' },
    { name: 'brand_assets', col: 'gdrive_file_id' },
  ]

  for (const { name, col } of tables) {
    try {
      const { data } = await supabase
        .from(name)
        .select(col)
        .not(col, 'is', null)

      if (data) {
        for (const row of data) {
          if (row[col]) ids.add(row[col])
        }
      }
    } catch {
      // Table might not have the column — skip
    }
  }

  // Also check deletion_queue for pending deletions
  try {
    const { data } = await supabase
      .from('deletion_queue')
      .select('gdrive_file_id')
      .eq('status', 'pending')
      .not('gdrive_file_id', 'is', null)

    if (data) {
      for (const row of data) {
        if (row.gdrive_file_id) ids.add(row.gdrive_file_id)
      }
    }
  } catch {
    // skip
  }

  return ids
}

async function main() {
  console.log(`🔍 Scanning Google Drive folder ${ROOT_FOLDER}...`)
  console.log(DRY_RUN ? '  (DRY RUN — no files will be deleted)\n' : '')

  const driveFiles = await listAllFiles(ROOT_FOLDER)
  console.log(`📁 Found ${driveFiles.length} files in Google Drive\n`)

  const knownIds = await getAllKnownFileIds()
  console.log(`📋 Found ${knownIds.size} file IDs referenced in Supabase\n`)

  const orphans = driveFiles.filter(f => !knownIds.has(f.id))
  console.log(`🗑️  ${orphans.length} orphaned files (in Drive but not in DB):\n`)

  for (const orphan of orphans) {
    console.log(`  ${orphan.path}  (${orphan.id})`)
  }

  if (orphans.length === 0) {
    console.log('  No orphans found — all Drive files match a DB record.')
    return
  }

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN: Would delete ${orphans.length} files. Run without --dry-run to actually delete.`)
    return
  }

  console.log(`\n🗑️  Deleting ${orphans.length} orphaned files...`)
  let deleted = 0
  for (const orphan of orphans) {
    try {
      await drive.files.delete({ fileId: orphan.id, supportsAllDrives: true })
      deleted++
      console.log(`  ✅ Deleted: ${orphan.path}`)
    } catch (err) {
      console.error(`  ❌ Failed: ${orphan.path} — ${err.message}`)
    }
  }

  console.log(`\n✅ Done. Deleted ${deleted}/${orphans.length} orphaned files.`)
}

main().catch(console.error)
