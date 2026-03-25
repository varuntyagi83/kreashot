#!/usr/bin/env tsx
/**
 * Migrate existing images from Google Drive → Google Cloud Storage
 *
 * - Downloads each file from Drive by gdrive_file_id
 * - Uploads it to GCS at the same storage_path
 * - Updates the DB row: storage_provider='gcs', storage_url=GCS public URL
 * - Does NOT delete from Drive (safe to re-run)
 *
 * Usage:
 *   npx tsx scripts/migrate-gdrive-to-gcs.ts
 *   npx tsx scripts/migrate-gdrive-to-gcs.ts --dry-run   # preview only, no writes
 *   npx tsx scripts/migrate-gdrive-to-gcs.ts --table angled_shots  # single table
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { Storage } from '@google-cloud/storage'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const TABLE_FILTER = (() => {
  const idx = process.argv.indexOf('--table')
  return idx !== -1 ? process.argv[idx + 1] : null
})()

const TABLES = [
  'angled_shots',
  'backgrounds',
  'composites',
  'final_assets',
  'collages',
  'product_images',
  'brand_assets',
] as const

// ─── Clients ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const drive = google.drive({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  }),
})

const gcsBucketName = process.env.GCS_BUCKET_NAME
if (!gcsBucketName) {
  console.error('❌ GCS_BUCKET_NAME is not set in .env.local')
  process.exit(1)
}

const gcs = new Storage({
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  projectId: process.env.GCS_PROJECT_ID,
})
const bucket = gcs.bucket(gcsBucketName)

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(response.data as ArrayBuffer)
}

function gcsPublicUrl(objectPath: string): string {
  return `https://storage.googleapis.com/${gcsBucketName}/${objectPath}`
}

function contentTypeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'json': return 'application/json'
    default: return 'application/octet-stream'
  }
}

// ─── Per-table migration ──────────────────────────────────────────────────────

async function migrateTable(table: string): Promise<{ ok: number; skipped: number; failed: number }> {
  console.log(`\n📦 Table: ${table}`)

  // Fetch all Drive-backed rows that haven't been migrated yet
  const { data: rows, error } = await supabase
    .from(table)
    .select('id, gdrive_file_id, storage_path, storage_url')
    .eq('storage_provider', 'gdrive')
    .not('gdrive_file_id', 'is', null)

  if (error) {
    console.error(`  ❌ Fetch error: ${error.message}`)
    return { ok: 0, skipped: 0, failed: 0 }
  }

  if (!rows || rows.length === 0) {
    console.log('  ✅ Nothing to migrate')
    return { ok: 0, skipped: 0, failed: 0 }
  }

  console.log(`  Found ${rows.length} rows to migrate`)

  let ok = 0, skipped = 0, failed = 0

  for (const row of rows) {
    const { id, gdrive_file_id, storage_path } = row

    if (!storage_path) {
      console.warn(`  ⚠️  Row ${id}: no storage_path — skipping`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] ${id} → gs://${gcsBucketName}/${storage_path}`)
      ok++
      continue
    }

    try {
      // 1. Download from Drive
      let buffer: Buffer
      try {
        buffer = await downloadFromDrive(gdrive_file_id)
      } catch (err: any) {
        if (err?.response?.status === 404 || err?.message?.includes('404')) {
          console.warn(`  ⚠️  ${id}: file not found in Drive (deleted?) — skipping`)
          skipped++
          continue
        }
        throw err
      }

      // 2. Upload to GCS
      const contentType = contentTypeFromPath(storage_path)
      const gcsFile = bucket.file(storage_path)
      // Bucket uses uniform access — no per-object ACL needed
      await gcsFile.save(buffer, {
        metadata: { contentType },
      })

      const newUrl = gcsPublicUrl(storage_path)

      // 3. Update DB
      const { error: updateError } = await supabase
        .from(table)
        .update({ storage_provider: 'gcs', storage_url: newUrl })
        .eq('id', id)

      if (updateError) throw new Error(updateError.message)

      console.log(`  ✅ ${id} → ${newUrl}`)
      ok++
    } catch (err: any) {
      console.error(`  ❌ ${id}: ${err.message}`)
      failed++
    }
  }

  return { ok, skipped, failed }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 GDrive → GCS Migration')
  console.log(`   Bucket : ${gcsBucketName}`)
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`)
  if (TABLE_FILTER) console.log(`   Table  : ${TABLE_FILTER}`)

  const tables = TABLE_FILTER
    ? TABLES.filter((t) => t === TABLE_FILTER)
    : [...TABLES]

  if (TABLE_FILTER && tables.length === 0) {
    console.error(`❌ Unknown table: ${TABLE_FILTER}. Valid: ${TABLES.join(', ')}`)
    process.exit(1)
  }

  let totalOk = 0, totalSkipped = 0, totalFailed = 0

  for (const table of tables) {
    const { ok, skipped, failed } = await migrateTable(table)
    totalOk += ok
    totalSkipped += skipped
    totalFailed += failed
  }

  console.log('\n─────────────────────────────────')
  console.log(`✅ Migrated : ${totalOk}`)
  console.log(`⚠️  Skipped  : ${totalSkipped}`)
  console.log(`❌ Failed   : ${totalFailed}`)
  if (DRY_RUN) console.log('\n(dry-run — nothing was written)')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
