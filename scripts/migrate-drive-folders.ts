/**
 * One-time Drive folder migration script.
 *
 * What it does:
 *  1. For each company, find the UUID-named folder at the Drive root
 *     (created before the slug-based path fix) and rename it to the company slug.
 *  2. Find any root-level category folders (old uploads that had no company prefix)
 *     and move them inside the company folder.
 *
 * Usage:
 *   npx tsx scripts/migrate-drive-folders.ts
 *
 * Requires env vars from .env.local:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID
 */

import 'dotenv/config'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Load .env.local if dotenv/config doesn't pick it up automatically
import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ROOT_FOLDER_ID) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_DRIVE_FOLDER_ID')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

/** List immediate child folders of parentId matching the given name */
async function findFolder(parentId: string, name: string): Promise<string | null> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const { data } = await drive.files.list({
    q: `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return data.files?.[0]?.id ?? null
}

/** Rename a Drive file/folder */
async function renameItem(fileId: string, newName: string): Promise<void> {
  await drive.files.update({
    fileId,
    requestBody: { name: newName },
    supportsAllDrives: true,
  })
}

/** Move a Drive item to a new parent, removing from the old parent */
async function moveItem(fileId: string, newParentId: string, oldParentId: string): Promise<void> {
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParentId,
    supportsAllDrives: true,
    fields: 'id, parents',
  })
}

async function main() {
  console.log('🔍 Fetching companies from Supabase…')
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, slug')

  if (error || !companies?.length) {
    console.error('Failed to fetch companies:', error)
    process.exit(1)
  }

  console.log(`Found ${companies.length} company/companies.\n`)

  for (const company of companies) {
    console.log(`\n── Company: "${company.name}" (${company.id})`)
    console.log(`   Slug: ${company.slug}`)

    // ── Step 1: Rename UUID folder → slug ──────────────────────────────
    const uuidFolderId = await findFolder(ROOT_FOLDER_ID, company.id)
    if (uuidFolderId) {
      // Check if slug folder already exists (idempotent)
      const slugFolderExists = await findFolder(ROOT_FOLDER_ID, company.slug)
      if (slugFolderExists) {
        console.log(`   ✅ Slug folder already exists: ${company.slug} — skipping rename`)
      } else {
        await renameItem(uuidFolderId, company.slug)
        console.log(`   ✅ Renamed "${company.id}" → "${company.slug}"`)
      }
    } else {
      const slugFolderExists = await findFolder(ROOT_FOLDER_ID, company.slug)
      if (slugFolderExists) {
        console.log(`   ℹ️  Slug folder already exists: ${company.slug} (no UUID folder found)`)
      } else {
        console.log(`   ⚠️  No UUID or slug folder found at Drive root — nothing to rename`)
        console.log(`      (New uploads will create "${company.slug}/" automatically)`)
      }
    }

    // ── Step 2: Move old root-level category folders into company folder ─
    const { data: categories } = await supabase
      .from('categories')
      .select('slug')
      .eq('company_id', company.id)

    if (!categories?.length) {
      console.log(`   ℹ️  No categories found for this company — skipping folder move`)
      continue
    }

    // Find the company folder (could be slug-named now)
    const companyFolderId =
      await findFolder(ROOT_FOLDER_ID, company.slug) ??
      await findFolder(ROOT_FOLDER_ID, company.id)

    if (!companyFolderId) {
      console.log(`   ⚠️  Company folder not found in Drive root — cannot move categories`)
      continue
    }

    console.log(`   📁 Moving ${categories.length} category folders into "${company.slug}/"`)
    let moved = 0
    let skipped = 0

    for (const cat of categories) {
      const rootCatId = await findFolder(ROOT_FOLDER_ID, cat.slug)
      if (!rootCatId) {
        skipped++
        continue
      }

      // Avoid moving if a same-named folder already exists inside company folder
      const alreadyInside = await findFolder(companyFolderId, cat.slug)
      if (alreadyInside) {
        console.log(`      ⚠️  "${cat.slug}" already exists inside company folder — skipping`)
        skipped++
        continue
      }

      await moveItem(rootCatId, companyFolderId, ROOT_FOLDER_ID)
      console.log(`      ✅ Moved "${cat.slug}" → "${company.slug}/${cat.slug}"`)
      moved++
    }

    console.log(`   Summary: moved=${moved}, skipped=${skipped}`)
  }

  console.log('\n✅ Drive migration complete.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
