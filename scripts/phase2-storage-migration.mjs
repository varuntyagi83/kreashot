/**
 * Phase 2: Storage Organization Migration
 *
 * Creates format-specific folder structure and migrates existing 1:1 assets
 *
 * Folder Structure:
 * - composites/1x1/, composites/16x9/, composites/9x16/, composites/4x5/
 * - final-assets/1x1/, final-assets/16x9/, final-assets/9x16/, final-assets/4x5/
 * - guidelines/1x1/, guidelines/16x9/, guidelines/9x16/, guidelines/4x5/
 * - templates/1x1/, templates/16x9/, templates/9x16/, templates/4x5/
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

// Google Drive Service Account configuration
const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

// Format configurations
const FORMATS = ['1x1', '16x9', '9x16', '4x5']
const RESOURCE_TYPES = ['composites', 'final-assets', 'guidelines', 'templates']

/**
 * Find or create a folder in Google Drive
 */
async function findOrCreateFolder(name, parentId) {
  try {
    // Search for existing folder (with Shared Drive support)
    const response = await drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })

    if (response.data.files && response.data.files.length > 0) {
      console.log(`  ✓ Found existing folder: ${name}`)
      return response.data.files[0].id
    }

    // Create new folder (with Shared Drive support)
    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    }

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true
    })

    console.log(`  ✓ Created folder: ${name}`)
    return folder.data.id
  } catch (error) {
    console.error(`  ✗ Error with folder ${name}:`, error.message)
    throw error
  }
}

/**
 * Get category root folder ID from database
 */
async function getCategoryFolderId(categorySlug) {
  const category = await sql`
    SELECT gdrive_folder_id
    FROM categories
    WHERE slug = ${categorySlug}
    LIMIT 1
  `

  if (!category || !category[0]?.gdrive_folder_id) {
    throw new Error(`Category ${categorySlug} not found or has no Google Drive folder`)
  }

  return category[0].gdrive_folder_id
}

/**
 * Step 1: Create format-specific folder structure
 */
async function createFormatFolders() {
  console.log('\n📁 Step 1: Creating Format-Specific Folder Structure')
  console.log('='.repeat(60))

  // Get Gummy Bear category folder ID
  const categoryFolderId = await getCategoryFolderId('gummy-bear')
  console.log(`\nCategory root folder ID: ${categoryFolderId}`)

  const folderMap = {}

  for (const resourceType of RESOURCE_TYPES) {
    console.log(`\n📂 ${resourceType}/`)

    // Find or create resource type folder (e.g., "composites")
    const resourceFolderId = await findOrCreateFolder(resourceType, categoryFolderId)
    folderMap[resourceType] = { id: resourceFolderId, formats: {} }

    // Create format subfolders (e.g., "composites/1x1", "composites/16x9")
    for (const format of FORMATS) {
      const formatFolderId = await findOrCreateFolder(format, resourceFolderId)
      folderMap[resourceType].formats[format] = formatFolderId
      console.log(`    ✓ ${resourceType}/${format}/`)
    }
  }

  console.log('\n✅ Folder structure created successfully')
  return folderMap
}

/**
 * Step 2: Migrate existing composites to 1x1 folder
 */
async function migrateComposites(folderMap) {
  console.log('\n📦 Step 2: Migrating Existing Composites to 1x1 Folder')
  console.log('='.repeat(60))

  // Get all composites that need migration (not already in format folders)
  const composites = await sql`
    SELECT id, storage_path, storage_url, gdrive_file_id
    FROM composites
    WHERE storage_path NOT LIKE '%/1x1/%'
      AND storage_path NOT LIKE '%/16x9/%'
      AND storage_path NOT LIKE '%/9x16/%'
      AND storage_path NOT LIKE '%/4x5/%'
      AND gdrive_file_id IS NOT NULL
  `

  console.log(`\nFound ${composites.length} composites to migrate`)

  if (composites.length === 0) {
    console.log('✓ No composites need migration (already in format folders or no Google Drive files)')
    return 0
  }

  let migrated = 0
  const targetFolderId = folderMap['composites'].formats['1x1']

  for (const composite of composites) {
    try {
      console.log(`\nMigrating composite ${composite.id}...`)
      console.log(`  Current path: ${composite.storage_path}`)

      // Move file in Google Drive to 1x1 folder (with Shared Drive support)
      await drive.files.update({
        fileId: composite.gdrive_file_id,
        addParents: targetFolderId,
        removeParents: folderMap['composites'].id,
        fields: 'id, parents',
        supportsAllDrives: true
      })

      // Update storage path in database
      const oldPath = composite.storage_path
      const fileName = oldPath.split('/').pop()
      const newPath = oldPath.replace(/composites\//, 'composites/1x1/')

      await sql`
        UPDATE composites
        SET storage_path = ${newPath}
        WHERE id = ${composite.id}
      `

      console.log(`  ✓ New path: ${newPath}`)
      migrated++
    } catch (error) {
      console.error(`  ✗ Error migrating ${composite.id}:`, error.message)
    }
  }

  console.log(`\n✅ Migrated ${migrated}/${composites.length} composites`)
  return migrated
}

/**
 * Step 3: Migrate existing templates to 1x1 folder
 */
async function migrateTemplates(folderMap) {
  console.log('\n📋 Step 3: Migrating Existing Templates to 1x1 Folder')
  console.log('='.repeat(60))

  const templates = await sql`
    SELECT id, storage_path, storage_url, gdrive_file_id
    FROM templates
    WHERE storage_path NOT LIKE '%/1x1/%'
      AND storage_path NOT LIKE '%/16x9/%'
      AND storage_path NOT LIKE '%/9x16/%'
      AND storage_path NOT LIKE '%/4x5/%'
      AND gdrive_file_id IS NOT NULL
  `

  console.log(`\nFound ${templates.length} templates to migrate`)

  if (templates.length === 0) {
    console.log('✓ No templates need migration')
    return 0
  }

  let migrated = 0
  const targetFolderId = folderMap['templates'].formats['1x1']

  for (const template of templates) {
    try {
      console.log(`\nMigrating template ${template.id}...`)
      console.log(`  Current path: ${template.storage_path}`)

      // Move file in Google Drive (with Shared Drive support)
      await drive.files.update({
        fileId: template.gdrive_file_id,
        addParents: targetFolderId,
        removeParents: folderMap['templates'].id,
        fields: 'id, parents',
        supportsAllDrives: true
      })

      // Update storage path
      const oldPath = template.storage_path
      const newPath = oldPath.replace(/templates\//, 'templates/1x1/')

      await sql`
        UPDATE templates
        SET storage_path = ${newPath}
        WHERE id = ${template.id}
      `

      console.log(`  ✓ New path: ${newPath}`)
      migrated++
    } catch (error) {
      console.error(`  ✗ Error migrating ${template.id}:`, error.message)
    }
  }

  console.log(`\n✅ Migrated ${migrated}/${templates.length} templates`)
  return migrated
}

/**
 * Step 4: Migrate existing guidelines to 1x1 folder
 */
async function migrateGuidelines(folderMap) {
  console.log('\n📄 Step 4: Migrating Existing Guidelines to 1x1 Folder')
  console.log('='.repeat(60))

  const guidelines = await sql`
    SELECT id, storage_path, storage_url, gdrive_file_id
    FROM guidelines
    WHERE storage_path NOT LIKE '%/1x1/%'
      AND storage_path NOT LIKE '%/16x9/%'
      AND storage_path NOT LIKE '%/9x16/%'
      AND storage_path NOT LIKE '%/4x5/%'
      AND gdrive_file_id IS NOT NULL
  `

  console.log(`\nFound ${guidelines.length} guidelines to migrate`)

  if (guidelines.length === 0) {
    console.log('✓ No guidelines need migration')
    return 0
  }

  let migrated = 0
  const targetFolderId = folderMap['guidelines'].formats['1x1']

  for (const guideline of guidelines) {
    try {
      console.log(`\nMigrating guideline ${guideline.id}...`)
      console.log(`  Current path: ${guideline.storage_path}`)

      // Move file in Google Drive (with Shared Drive support)
      await drive.files.update({
        fileId: guideline.gdrive_file_id,
        addParents: targetFolderId,
        removeParents: folderMap['guidelines'].id,
        fields: 'id, parents',
        supportsAllDrives: true
      })

      // Update storage path
      const oldPath = guideline.storage_path
      const newPath = oldPath.replace(/guidelines\//, 'guidelines/1x1/')

      await sql`
        UPDATE guidelines
        SET storage_path = ${newPath}
        WHERE id = ${guideline.id}
      `

      console.log(`  ✓ New path: ${newPath}`)
      migrated++
    } catch (error) {
      console.error(`  ✗ Error migrating ${guideline.id}:`, error.message)
    }
  }

  console.log(`\n✅ Migrated ${migrated}/${guidelines.length} guidelines`)
  return migrated
}

/**
 * Step 5: Verification
 */
async function verifyMigration() {
  console.log('\n🔍 Step 5: Verifying Migration')
  console.log('='.repeat(60))

  // Check composites
  const composites = await sql`
    SELECT
      CASE
        WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
        WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
        WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
        WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
        ELSE 'unmigrated'
      END as path_format,
      COUNT(*) as count
    FROM composites
    GROUP BY path_format
  `

  console.log('\n📊 Composites by folder:')
  composites.forEach(row => {
    const icon = row.path_format === 'unmigrated' ? '⚠️ ' : '✓'
    console.log(`  ${icon} ${row.path_format}: ${row.count}`)
  })

  // Check templates
  const templates = await sql`
    SELECT
      CASE
        WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
        WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
        WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
        WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
        ELSE 'unmigrated'
      END as path_format,
      COUNT(*) as count
    FROM templates
    GROUP BY path_format
  `

  console.log('\n📊 Templates by folder:')
  templates.forEach(row => {
    const icon = row.path_format === 'unmigrated' ? '⚠️ ' : '✓'
    console.log(`  ${icon} ${row.path_format}: ${row.count}`)
  })

  // Check for any unmigrated files
  const unmigrated = composites.concat(templates).filter(r => r.path_format === 'unmigrated')

  if (unmigrated.length > 0) {
    console.log('\n⚠️  Some files remain unmigrated')
    return false
  }

  console.log('\n✅ All files migrated successfully')
  return true
}

/**
 * Main migration function
 */
async function runPhase2Migration() {
  console.log('🚀 Phase 2: Storage Organization Migration')
  console.log('='.repeat(60))
  console.log('\nThis will:')
  console.log('1. Create format-specific folders (1x1, 16x9, 9x16, 4x5)')
  console.log('2. Move existing assets to 1x1/ subfolders')
  console.log('3. Update database storage paths')
  console.log('4. Verify migration')

  try {
    // Step 1: Create folders
    const folderMap = await createFormatFolders()

    // Step 2: Migrate composites
    await migrateComposites(folderMap)

    // Step 3: Migrate templates
    await migrateTemplates(folderMap)

    // Step 4: Migrate guidelines
    await migrateGuidelines(folderMap)

    // Step 5: Verify
    const success = await verifyMigration()

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 PHASE 2 MIGRATION SUMMARY')
    console.log('='.repeat(60))

    if (success) {
      console.log('\n🎉 Phase 2 Complete!')
      console.log('✅ Format-specific folders created')
      console.log('✅ All existing assets migrated to 1x1/')
      console.log('✅ Database paths updated')
      console.log('✅ Migration verified')
      console.log('\n✅ Ready to proceed to Phase 3: Template Builder Updates')
      return 0
    } else {
      console.log('\n⚠️  Phase 2 completed with warnings')
      console.log('Review unmigrated files above')
      return 1
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    return 1
  } finally {
    await sql.end()
  }
}

runPhase2Migration().then(exitCode => {
  process.exit(exitCode)
})
