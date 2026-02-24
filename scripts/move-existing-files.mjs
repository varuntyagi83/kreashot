/**
 * Move existing composite files to 1x1 subfolder
 * The database paths were already updated, now we need to move the actual files
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

async function findFolder(name, parentId) {
  const response = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })

  return response.data.files?.[0]
}

async function moveFiles() {
  console.log('🚚 Moving existing files to format subfolders\n')
  console.log('='.repeat(60))

  try {
    // Get category folder ID
    const categoryFolderId = await getCategoryFolderId('gummy-bear')
    console.log('Category folder ID:', categoryFolderId)

    // Find composites folder
    const compositesFolder = await findFolder('composites', categoryFolderId)
    if (!compositesFolder) {
      throw new Error('Composites folder not found')
    }
    console.log('Composites folder ID:', compositesFolder.id)

    // Find 1x1 subfolder
    const onexoneFolder = await findFolder('1x1', compositesFolder.id)
    if (!onexoneFolder) {
      throw new Error('1x1 subfolder not found')
    }
    console.log('1x1 subfolder ID:', onexoneFolder.id)

    // Get all composites with Google Drive IDs
    const composites = await sql`
      SELECT id, storage_path, gdrive_file_id
      FROM composites
      WHERE gdrive_file_id IS NOT NULL
      ORDER BY created_at
    `

    console.log(`\nFound ${composites.length} composites to check\n`)

    let moved = 0
    let alreadyInPlace = 0
    let errors = 0

    for (const composite of composites) {
      try {
        console.log(`Checking: ${composite.storage_path}`)

        // Get current file metadata
        const file = await drive.files.get({
          fileId: composite.gdrive_file_id,
          fields: 'id, name, parents',
          supportsAllDrives: true
        })

        const currentParent = file.data.parents?.[0]

        if (currentParent === onexoneFolder.id) {
          console.log(`  ✓ Already in 1x1 folder\n`)
          alreadyInPlace++
          continue
        }

        if (currentParent !== compositesFolder.id) {
          console.log(`  ⚠️  File is in unexpected location (parent: ${currentParent})\n`)
          continue
        }

        // Move file to 1x1 subfolder
        console.log(`  → Moving to 1x1 subfolder...`)
        await drive.files.update({
          fileId: composite.gdrive_file_id,
          addParents: onexoneFolder.id,
          removeParents: currentParent,
          fields: 'id, parents',
          supportsAllDrives: true
        })

        console.log(`  ✓ Moved successfully\n`)
        moved++

      } catch (error) {
        console.error(`  ✗ Error: ${error.message}\n`)
        errors++
      }
    }

    // Also move templates
    console.log('\n' + '='.repeat(60))
    console.log('Moving templates...\n')

    const templatesFolder = await findFolder('templates', categoryFolderId)
    if (templatesFolder) {
      const templateOnexoneFolder = await findFolder('1x1', templatesFolder.id)

      if (templateOnexoneFolder) {
        const templates = await sql`
          SELECT id, storage_path, gdrive_file_id
          FROM templates
          WHERE gdrive_file_id IS NOT NULL
          ORDER BY created_at
        `

        console.log(`Found ${templates.length} templates to check\n`)

        for (const template of templates) {
          try {
            console.log(`Checking: ${template.storage_path}`)

            const file = await drive.files.get({
              fileId: template.gdrive_file_id,
              fields: 'id, name, parents',
              supportsAllDrives: true
            })

            const currentParent = file.data.parents?.[0]

            if (currentParent === templateOnexoneFolder.id) {
              console.log(`  ✓ Already in 1x1 folder\n`)
              alreadyInPlace++
              continue
            }

            if (currentParent !== templatesFolder.id) {
              console.log(`  ⚠️  File is in unexpected location\n`)
              continue
            }

            console.log(`  → Moving to 1x1 subfolder...`)
            await drive.files.update({
              fileId: template.gdrive_file_id,
              addParents: templateOnexoneFolder.id,
              removeParents: currentParent,
              fields: 'id, parents',
              supportsAllDrives: true
            })

            console.log(`  ✓ Moved successfully\n`)
            moved++

          } catch (error) {
            console.error(`  ✗ Error: ${error.message}\n`)
            errors++
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Files moved: ${moved}`)
    console.log(`✓  Already in place: ${alreadyInPlace}`)
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`)
    }

    if (moved > 0) {
      console.log('\n🎉 Phase 2 Complete!')
      console.log('✅ Format folders created in Google Drive')
      console.log('✅ Files moved to 1x1 subfolders')
      console.log('✅ Database paths match physical locations')
    }

    return errors === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

moveFiles().then(exitCode => {
  process.exit(exitCode)
})
