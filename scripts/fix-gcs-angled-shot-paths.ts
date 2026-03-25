#!/usr/bin/env tsx
/**
 * Finds angled_shots rows where storage_provider='gcs', gdrive_file_id IS NULL,
 * but the GCS file at storage_path returns 404.
 * For each broken record, finds actual files in the same GCS folder and either:
 *  - Updates the record to point to the closest existing file, OR
 *  - Deletes the orphaned DB row if no match can be found
 *
 * Usage:
 *   npx tsx scripts/fix-gcs-angled-shot-paths.ts           # dry-run preview
 *   npx tsx scripts/fix-gcs-angled-shot-paths.ts --fix     # apply updates
 *   npx tsx scripts/fix-gcs-angled-shot-paths.ts --delete  # delete orphaned rows
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { Storage } from '@google-cloud/storage'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const FIX = process.argv.includes('--fix')
const DELETE_ORPHANS = process.argv.includes('--delete')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const gcsBucketName = process.env.GCS_BUCKET_NAME!
const gcsKeyJson = process.env.GCS_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY)
  : undefined

const gcs = new Storage({
  credentials: gcsKeyJson,
  projectId: gcsKeyJson?.project_id,
})
const bucket = gcs.bucket(gcsBucketName)

async function fileExistsInGCS(storagePath: string): Promise<boolean> {
  try {
    const [exists] = await bucket.file(storagePath).exists()
    return exists
  } catch {
    return false
  }
}

async function listFilesInFolder(prefix: string): Promise<string[]> {
  const [files] = await bucket.getFiles({ prefix })
  return files.map((f) => f.name)
}

function gcsPublicUrl(storagePath: string): string {
  return `https://storage.googleapis.com/${gcsBucketName}/${storagePath}`
}

async function main() {
  console.log(`Mode: ${FIX ? 'FIX' : DELETE_ORPHANS ? 'DELETE ORPHANS' : 'DRY RUN'}\n`)

  // Fetch all GCS-only angled shots (no gdrive_file_id)
  const { data: shots, error } = await supabase
    .from('angled_shots')
    .select('id, angle_name, display_name, storage_path, storage_url, storage_provider, gdrive_file_id, created_at')
    .eq('storage_provider', 'gcs')
    .is('gdrive_file_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch angled_shots:', error)
    process.exit(1)
  }

  console.log(`Found ${shots?.length ?? 0} GCS-only angled shots\n`)
  if (!shots?.length) return

  let broken = 0
  let fixed = 0
  let deleted = 0

  for (const shot of shots) {
    const exists = await fileExistsInGCS(shot.storage_path)
    if (exists) {
      console.log(`✅ OK: ${shot.id} → ${shot.storage_path}`)
      continue
    }

    broken++
    console.log(`\n❌ BROKEN: ${shot.id}`)
    console.log(`   angle: ${shot.angle_name}, display: ${shot.display_name}`)
    console.log(`   storage_path: ${shot.storage_path}`)

    // Determine folder prefix: everything up to the last /
    const folder = shot.storage_path.substring(0, shot.storage_path.lastIndexOf('/') + 1)
    console.log(`   Looking in folder: ${folder}`)

    const filesInFolder = await listFilesInFolder(folder)
    console.log(`   Files in folder: ${filesInFolder.length}`)
    filesInFolder.forEach((f) => console.log(`     - ${f}`))

    if (filesInFolder.length === 0) {
      console.log(`   ⚠️  No files found in folder — orphaned DB row`)
      if (DELETE_ORPHANS) {
        const { error: delErr } = await supabase
          .from('angled_shots')
          .delete()
          .eq('id', shot.id)
        if (delErr) {
          console.error(`   ❌ Delete failed:`, delErr)
        } else {
          console.log(`   🗑️  Deleted orphaned row`)
          deleted++
        }
      }
      continue
    }

    // Pick the most recent file in the folder (by name, since timestamp is in filename)
    const sortedFiles = [...filesInFolder].sort().reverse()
    const bestMatch = sortedFiles[0]
    const newUrl = gcsPublicUrl(bestMatch)

    console.log(`   Best match: ${bestMatch}`)
    console.log(`   New URL: ${newUrl}`)

    if (FIX) {
      const { error: updateErr } = await supabase
        .from('angled_shots')
        .update({
          storage_path: bestMatch,
          storage_url: newUrl,
        })
        .eq('id', shot.id)

      if (updateErr) {
        console.error(`   ❌ Update failed:`, updateErr)
      } else {
        console.log(`   ✅ Updated!`)
        fixed++
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`Total GCS-only shots: ${shots.length}`)
  console.log(`Broken paths:         ${broken}`)
  if (FIX) console.log(`Fixed:                ${fixed}`)
  if (DELETE_ORPHANS) console.log(`Deleted:              ${deleted}`)
  if (!FIX && !DELETE_ORPHANS && broken > 0) {
    console.log(`\nRun with --fix to update broken paths, or --delete to remove orphaned rows.`)
  }
}

main().catch(console.error)
