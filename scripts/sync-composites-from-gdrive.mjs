#!/usr/bin/env node
/**
 * Sync composites from Google Drive → Supabase
 *
 * Scans the GDrive composites/<format> folders, finds files that have no
 * matching Supabase row, and inserts the missing records.
 *
 * Usage:
 *   node scripts/sync-composites-from-gdrive.mjs
 *   node scripts/sync-composites-from-gdrive.mjs --dry-run
 *   node scripts/sync-composites-from-gdrive.mjs --format 16x9
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// ── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_SLUG = 'gummy-bear'
const DRY_RUN = process.argv.includes('--dry-run')
const FORMAT_ARG = process.argv.find(a => a.startsWith('--format='))?.split('=')[1] || null

const FORMAT_MAP = {
  '1x1':  { format: '1:1',  width: 1080, height: 1080 },
  '16x9': { format: '16:9', width: 1920, height: 1080 },
  '9x16': { format: '9:16', width: 1080, height: 1920 },
  '4x5':  { format: '4:5',  width: 1080, height: 1350 },
}

// ── Clients ──────────────────────────────────────────────────────────────────

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── GDrive helpers ───────────────────────────────────────────────────────────

async function listFilesInPath(pathStr) {
  const parts = pathStr.split('/').filter(Boolean)
  let currentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  for (const folderName of parts) {
    const { data } = await drive.files.list({
      q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (!data.files || data.files.length === 0) {
      console.log(`   ⚠️  Folder not found: ${folderName} (inside ${currentFolderId})`)
      return []
    }
    currentFolderId = data.files[0].id
  }

  const { data } = await drive.files.list({
    q: `'${currentFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
    fields: 'files(id, name, size)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
  })

  return data.files || []
}

// ── Angle name matching ──────────────────────────────────────────────────────
// Filename pattern: {angle-slug}-on-{background-slug}_{timestamp}.jpg
// Angle slug uses hyphens; DB angle_name uses underscores
// e.g. "three-quarter-left-on-colorful-..." → "three_quarter_left"

function extractAngleFromFilename(filename) {
  // Strip extension
  const base = filename.replace(/\.[^.]+$/, '')
  // Split on -on- to get angle part
  const parts = base.split('-on-')
  if (parts.length < 2) return null
  // Convert hyphens → underscores for DB lookup
  return parts[0].replace(/-/g, '_')
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 Sync GDrive composites → Supabase')
  console.log('='.repeat(60))
  if (DRY_RUN) console.log('🧪 DRY RUN — no DB writes\n')

  // Fetch category
  const { data: category } = await supabase
    .from('categories')
    .select('id, name, slug, user_id')
    .eq('slug', CATEGORY_SLUG)
    .single()

  if (!category) {
    console.error(`❌ Category not found: ${CATEGORY_SLUG}`)
    process.exit(1)
  }
  console.log(`✅ Category: ${category.name} (${category.id})\n`)

  // Fetch all angled_shots for this category
  const { data: angledShots } = await supabase
    .from('angled_shots')
    .select('id, angle_name, format')
    .eq('category_id', category.id)

  console.log(`📸 Angled shots in DB: ${angledShots?.length || 0}`)
  const angleMap = {}
  for (const shot of (angledShots || [])) {
    const key = `${shot.angle_name}::${shot.format}`
    if (!angleMap[key]) angleMap[key] = shot.id
  }

  // Fetch all backgrounds for this category
  const { data: backgrounds } = await supabase
    .from('backgrounds')
    .select('id, name, format')
    .eq('category_id', category.id)

  console.log(`🖼️  Backgrounds in DB: ${backgrounds?.length || 0}\n`)

  // Fetch existing composite storage_paths so we can skip them
  const { data: existingComposites } = await supabase
    .from('composites')
    .select('storage_path, gdrive_file_id')
    .eq('category_id', category.id)

  const existingPaths = new Set((existingComposites || []).map(c => c.storage_path))
  const existingFileIds = new Set((existingComposites || []).map(c => c.gdrive_file_id).filter(Boolean))
  console.log(`🗄️  Existing composites in DB: ${existingComposites?.length || 0}\n`)

  const formatsToProcess = FORMAT_ARG ? [FORMAT_ARG] : Object.keys(FORMAT_MAP)
  let totalAdded = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const folderKey of formatsToProcess) {
    const dims = FORMAT_MAP[folderKey]
    if (!dims) {
      console.log(`⚠️  Unknown format folder: ${folderKey}`)
      continue
    }

    const gdrivePath = `${CATEGORY_SLUG}/composites/${folderKey}`
    console.log(`\n📂 Processing ${dims.format} → GDrive path: ${gdrivePath}`)

    const files = await listFilesInPath(gdrivePath)
    console.log(`   Found ${files.length} files in GDrive`)

    // Pick the best background for this format (prefer format match, fallback to any)
    const formatBg = backgrounds?.find(b => b.format === dims.format)
    const anyBg = backgrounds?.[0]
    const backgroundId = formatBg?.id || anyBg?.id || null

    if (!backgroundId) {
      console.log(`   ⚠️  No backgrounds found for category — will insert with null background_id`)
    } else {
      console.log(`   🖼️  Using background: ${formatBg?.name || anyBg?.name} (${backgroundId})`)
    }

    for (const file of files) {
      // Skip if already in DB by file ID or storage path
      if (existingFileIds.has(file.id)) {
        console.log(`   ⏭️  Skip (fileId match): ${file.name}`)
        totalSkipped++
        continue
      }

      const storagePath = `${gdrivePath}/${file.name}`
      if (existingPaths.has(storagePath)) {
        console.log(`   ⏭️  Skip (path match): ${file.name}`)
        totalSkipped++
        continue
      }

      // Try to match angled shot from filename
      const angleName = extractAngleFromFilename(file.name)
      let angledShotId = null

      if (angleName) {
        // Try format-specific match first, then any format
        angledShotId = angleMap[`${angleName}::${dims.format}`]
          || angleMap[`${angleName}::1:1`]   // fallback to 1:1
          || null

        // If still null, try partial match (e.g. "top_45deg" matches "top_45deg_some_variant")
        if (!angledShotId) {
          for (const shot of (angledShots || [])) {
            if (shot.angle_name.includes(angleName) || angleName.includes(shot.angle_name)) {
              if (shot.format === dims.format || shot.format === '1:1') {
                angledShotId = shot.id
                break
              }
            }
          }
        }
      }

      if (!angledShotId) {
        console.log(`   ⚠️  No angle match for: ${file.name} (parsed: "${angleName}") — using first available shot`)
        // Use first angled shot with matching format, or any
        const fallback = angledShots?.find(s => s.format === dims.format) || angledShots?.[0]
        angledShotId = fallback?.id || null
      }

      if (!angledShotId) {
        console.log(`   ❌ Skip: ${file.name} — no angled shot found in DB at all`)
        totalFailed++
        continue
      }

      // Build name and slug from filename
      const nameBase = file.name.replace(/\.[^.]+$/, '').replace(/_\d{10,}$/, '')
      const name = `${nameBase} (${dims.format})`
      const slug = `${slugify(nameBase)}-${folderKey}-${Date.now()}`
      const storageUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w2000`

      if (DRY_RUN) {
        console.log(`   🧪 Would insert: ${name}`)
        console.log(`         angle_id=${angledShotId} bg_id=${backgroundId} file_id=${file.id}`)
        totalAdded++
        continue
      }

      const { error } = await supabase.from('composites').insert({
        category_id: category.id,
        user_id: category.user_id,
        angled_shot_id: angledShotId,
        background_id: backgroundId,
        name,
        slug,
        format: dims.format,
        width: dims.width,
        height: dims.height,
        storage_provider: 'gdrive',
        storage_path: storagePath,
        storage_url: storageUrl,
        gdrive_file_id: file.id,
        metadata: { synced_from_gdrive: true },
      })

      if (error) {
        console.log(`   ❌ Error inserting ${file.name}: ${error.message}`)
        totalFailed++
      } else {
        console.log(`   ✅ Inserted: ${name}`)
        totalAdded++
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✨ Done!`)
  console.log(`   Inserted : ${totalAdded}`)
  console.log(`   Skipped  : ${totalSkipped}`)
  console.log(`   Failed   : ${totalFailed}`)
}

main().catch(console.error)
