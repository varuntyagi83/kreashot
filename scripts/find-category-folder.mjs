/**
 * Find Google Drive folder ID for a category
 * Searches for category folder by slug and updates database
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

// Google Drive OAuth configuration
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/google/callback'
)

oauth2Client.setCredentials({
  refresh_token: GOOGLE_REFRESH_TOKEN
})

const drive = google.drive({ version: 'v3', auth: oauth2Client })

async function findCategoryFolder(categorySlug) {
  console.log(`🔍 Searching for folder: "${categorySlug}"\n`)

  try {
    // Search for folder by name
    const response = await drive.files.list({
      q: `name='${categorySlug}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, parents, createdTime)',
      spaces: 'drive'
    })

    const folders = response.data.files || []

    if (folders.length === 0) {
      console.log(`⚠️  No folder found with name: ${categorySlug}`)
      console.log('\nPlease check:')
      console.log('1. Folder exists in Google Drive')
      console.log('2. OAuth credentials have access to the folder')
      console.log('3. Folder name matches category slug exactly')
      return null
    }

    if (folders.length > 1) {
      console.log(`⚠️  Found ${folders.length} folders with name: ${categorySlug}`)
      console.log('\nFolders:')
      folders.forEach((folder, i) => {
        console.log(`  ${i + 1}. ID: ${folder.id}`)
        console.log(`     Created: ${folder.createdTime}`)
        console.log(`     Parents: ${folder.parents?.join(', ') || 'None'}`)
      })
      console.log('\nUsing the first folder. If this is incorrect, please manually update.')
    }

    const folder = folders[0]
    console.log(`✅ Found folder: ${folder.name}`)
    console.log(`   ID: ${folder.id}`)
    console.log(`   Created: ${folder.createdTime}`)

    return folder.id
  } catch (error) {
    console.error(`❌ Error searching for folder: ${error.message}`)
    throw error
  }
}

async function updateCategoryFolderId(categorySlug, folderId) {
  console.log(`\n📝 Updating database...`)

  try {
    const result = await sql`
      UPDATE categories
      SET gdrive_folder_id = ${folderId}
      WHERE slug = ${categorySlug}
      RETURNING id, name, slug, gdrive_folder_id
    `

    if (result.length === 0) {
      console.log(`⚠️  No category found with slug: ${categorySlug}`)
      return false
    }

    const category = result[0]
    console.log(`✅ Updated category: ${category.name}`)
    console.log(`   ID: ${category.id}`)
    console.log(`   Slug: ${category.slug}`)
    console.log(`   Google Drive Folder ID: ${category.gdrive_folder_id}`)

    return true
  } catch (error) {
    console.error(`❌ Error updating database: ${error.message}`)
    throw error
  }
}

async function main() {
  const categorySlug = process.argv[2] || 'gummy-bear'

  console.log('🔧 Find Category Folder ID')
  console.log('='.repeat(60))
  console.log(`Category: ${categorySlug}\n`)

  try {
    // Step 1: Find folder in Google Drive
    const folderId = await findCategoryFolder(categorySlug)

    if (!folderId) {
      console.log('\n❌ Could not find category folder')
      return 1
    }

    // Step 2: Update database
    const success = await updateCategoryFolderId(categorySlug, folderId)

    if (!success) {
      console.log('\n❌ Failed to update database')
      return 1
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ SUCCESS')
    console.log('='.repeat(60))
    console.log('Category folder ID found and saved to database')
    console.log('\n✅ Ready to run Phase 2 storage migration')

    return 0
  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

main().then(exitCode => {
  process.exit(exitCode)
})
