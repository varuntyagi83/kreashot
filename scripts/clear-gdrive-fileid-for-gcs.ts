#!/usr/bin/env tsx
/**
 * Clears gdrive_file_id for all rows where storage_provider='gcs'.
 * Once on GCS, gdrive_file_id=null makes driveImgSrc() use the direct GCS URL
 * instead of routing through the image-proxy to Drive.
 *
 * Usage:
 *   npx tsx scripts/clear-gdrive-fileid-for-gcs.ts           # dry-run
 *   npx tsx scripts/clear-gdrive-fileid-for-gcs.ts --fix     # apply
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const FIX = process.argv.includes('--fix')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TABLES = [
  'angled_shots',
  'backgrounds',
  'composites',
  'final_assets',
  'collages',
  'product_images',
] as const

async function main() {
  console.log(`Mode: ${FIX ? 'FIX (will clear gdrive_file_id)' : 'DRY RUN'}\n`)

  for (const table of TABLES) {
    // Count rows that are GCS but still have gdrive_file_id set
    const { data, error } = await supabase
      .from(table)
      .select('id, gdrive_file_id, storage_url')
      .eq('storage_provider', 'gcs')
      .not('gdrive_file_id', 'is', null)

    if (error) {
      console.log(`[${table}] Error: ${error.message}`)
      continue
    }

    const count = data?.length ?? 0
    if (count === 0) {
      console.log(`[${table}] ✅ No GCS rows with gdrive_file_id set`)
      continue
    }

    console.log(`[${table}] Found ${count} GCS rows still with gdrive_file_id:`)
    for (const row of data || []) {
      console.log(`  - ${row.id} | gdrive: ${row.gdrive_file_id?.slice(0, 20)}... | url: ${(row.storage_url || '').slice(0, 70)}`)
    }

    if (FIX) {
      const { error: updateErr } = await supabase
        .from(table)
        .update({ gdrive_file_id: null })
        .eq('storage_provider', 'gcs')
        .not('gdrive_file_id', 'is', null)

      if (updateErr) {
        console.log(`  ❌ Update failed: ${updateErr.message}`)
      } else {
        console.log(`  ✅ Cleared gdrive_file_id for ${count} rows`)
      }
    }
    console.log()
  }

  if (!FIX) {
    console.log('\nRun with --fix to apply changes.')
  }
}

main().catch(console.error)
