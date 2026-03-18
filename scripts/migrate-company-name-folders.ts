/**
 * Migration script: Add company name folder level to Google Drive hierarchy
 *
 * This script restructures the Google Drive folder hierarchy to include
 * a human-readable company name folder at the top level.
 *
 * Before:  {company-slug}/{category-slug}/...
 * After:   {Company Name}/{company-slug}/{category-slug}/...
 *
 * Usage:
 *   npx tsx scripts/migrate-company-name-folders.ts [--dry-run]
 *
 * Flags:
 *   --dry-run  Show what would be done without making changes
 *
 * Requires env vars from .env.local:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID
 */

import 'dotenv/config'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { sanitizeCompanyName } from '../src/lib/sanitize-company-name'

// Load .env.local
import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ROOT_FOLDER_ID) {
  console.error('❌ Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_DRIVE_FOLDER_ID')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n')
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

/** Find a folder by name under a parent folder */
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

/** Create a new folder */
async function createFolder(parentId: string, name: string): Promise<string> {
  const { data } = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return data.id!
}

/** Move a folder to a new parent */
async function moveFolder(folderId: string, newParentId: string, oldParentId: string): Promise<void> {
  await drive.files.update({
    fileId: folderId,
    addParents: newParentId,
    removeParents: oldParentId,
    supportsAllDrives: true,
    fields: 'id, parents',
  })
}

async function main() {
  console.log('🚀 Starting Google Drive folder migration...\n')

  // Fetch all companies
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, slug')
    .order('name')

  if (error || !companies?.length) {
    console.error('❌ Failed to fetch companies:', error)
    process.exit(1)
  }

  console.log(`📊 Found ${companies.length} company/companies\n`)

  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const company of companies) {
    const sanitizedName = sanitizeCompanyName(company.name)
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📂 Company: "${company.name}"`)
    console.log(`   ID: ${company.id}`)
    console.log(`   Slug: ${company.slug}`)
    console.log(`   Sanitized folder name: "${sanitizedName}"`)
    console.log('─'.repeat(60))

    try {
      // Step 1: Check if company-slug folder exists at root
      const companySlugFolderId = await findFolder(ROOT_FOLDER_ID, company.slug)

      if (!companySlugFolderId) {
        console.log(`   ℹ️  No folder found for slug "${company.slug}" at root`)
        console.log(`   ℹ️  This is expected for new companies - folders will be created on first upload`)
        skipCount++
        continue
      }

      console.log(`   ✓ Found company slug folder: ${company.slug}`)

      // Step 2: Check if company name folder already exists
      const companyNameFolderId = await findFolder(ROOT_FOLDER_ID, sanitizedName)

      if (companyNameFolderId) {
        // Company name folder exists - check if slug folder is already inside it
        const slugInsideNameFolder = await findFolder(companyNameFolderId, company.slug)

        if (slugInsideNameFolder) {
          console.log(`   ✓ Structure already correct: "${sanitizedName}/${company.slug}/"`)
          console.log(`   ⏭️  Skipping (already migrated)`)
          skipCount++
          continue
        }

        // Name folder exists but slug folder is still at root - move it
        console.log(`   📁 Company name folder already exists`)
        console.log(`   🔄 Moving slug folder into company name folder...`)

        if (!DRY_RUN) {
          await moveFolder(companySlugFolderId, companyNameFolderId, ROOT_FOLDER_ID)
          console.log(`   ✅ Moved: "${company.slug}" → "${sanitizedName}/${company.slug}"`)
        } else {
          console.log(`   🔍 [DRY RUN] Would move: "${company.slug}" → "${sanitizedName}/${company.slug}"`)
        }
        successCount++
      } else {
        // Create company name folder and move slug folder into it
        console.log(`   📁 Creating company name folder: "${sanitizedName}"`)

        if (!DRY_RUN) {
          const newNameFolderId = await createFolder(ROOT_FOLDER_ID, sanitizedName)
          console.log(`   ✓ Created folder: ${sanitizedName}`)

          console.log(`   🔄 Moving slug folder into company name folder...`)
          await moveFolder(companySlugFolderId, newNameFolderId, ROOT_FOLDER_ID)
          console.log(`   ✅ Migration complete: "${sanitizedName}/${company.slug}"`)
        } else {
          console.log(`   🔍 [DRY RUN] Would create: "${sanitizedName}/"`)
          console.log(`   🔍 [DRY RUN] Would move: "${company.slug}" → "${sanitizedName}/${company.slug}"`)
        }
        successCount++
      }
    } catch (err) {
      console.error(`   ❌ Error processing ${company.name}:`, err)
      errorCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Migration Summary')
  console.log('─'.repeat(60))
  console.log(`   ✅ Successfully migrated: ${successCount}`)
  console.log(`   ⏭️  Skipped (already done): ${skipCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log('='.repeat(60))

  if (DRY_RUN) {
    console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.')
  } else {
    console.log('\n✅ Migration complete!')
    console.log('\n📝 Next steps:')
    console.log('   1. Verify folder structure in Google Drive')
    console.log('   2. Test file uploads through the app')
    console.log('   3. New uploads will automatically use the new structure')
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
