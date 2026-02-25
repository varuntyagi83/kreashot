/**
 * Audit & Fix Composite Formats
 *
 * Phase 1 (--audit): Lists all composites, checks actual GDrive image dimensions,
 *   compares with stored format metadata, and reports mismatches.
 *
 * Phase 2 (--fix): Moves misplaced files to the correct GDrive folder and
 *   updates Supabase metadata (format, width, height, storage_path).
 *
 * Usage:
 *   npx @railway/cli run node scripts/audit-composite-formats.mjs --audit
 *   npx @railway/cli run node scripts/audit-composite-formats.mjs --fix
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

// Format config (mirrors src/lib/formats.ts)
const FORMATS = {
  '1:1':  { width: 1080, height: 1080, folder: '1x1' },
  '16:9': { width: 1920, height: 1080, folder: '16x9' },
  '9:16': { width: 1080, height: 1920, folder: '9x16' },
  '4:5':  { width: 1080, height: 1350, folder: '4x5' },
}

/**
 * Detect the correct format from actual image dimensions by nearest aspect ratio match
 */
function detectFormatFromDimensions(width, height) {
  if (!width || !height) return null
  const ratio = width / height

  const candidates = [
    { format: '1:1',  target: 1.0 },
    { format: '16:9', target: 16 / 9 },   // 1.778
    { format: '9:16', target: 9 / 16 },    // 0.5625
    { format: '4:5',  target: 4 / 5 },     // 0.8
  ]

  let best = null
  let bestDiff = Infinity

  for (const c of candidates) {
    const diff = Math.abs(ratio - c.target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = c.format
    }
  }

  // Only match if within 15% of the target ratio (generous for AI-generated images)
  const bestTarget = candidates.find(c => c.format === best).target
  if (bestDiff / bestTarget > 0.15) return null

  return best
}

/**
 * Get actual image dimensions from Google Drive using the image metadata API
 */
async function getImageDimensions(fileId) {
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'imageMediaMetadata(width,height)',
      supportsAllDrives: true,
    })

    const meta = response.data.imageMediaMetadata
    if (meta && meta.width && meta.height) {
      return { width: meta.width, height: meta.height }
    }
    return null
  } catch (error) {
    console.error(`  ⚠️  Failed to get dimensions for file ${fileId}: ${error.message}`)
    return null
  }
}

/**
 * Get or create a folder under a given parent
 */
async function getOrCreateFolder(parentId, folderName) {
  // Check if folder exists
  const { data } = await drive.files.list({
    q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  if (data.files && data.files.length > 0) {
    return data.files[0].id
  }

  // Create folder
  const { data: folder } = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  console.log(`    📁 Created folder: ${folderName} (${folder.id})`)
  return folder.id
}

/**
 * Navigate to a folder by path segments under a root folder
 */
async function navigateToFolder(rootFolderId, pathSegments) {
  let currentId = rootFolderId
  for (const segment of pathSegments) {
    currentId = await getOrCreateFolder(currentId, segment)
  }
  return currentId
}

/**
 * Move a file from its current parent to a new parent folder
 */
async function moveFile(fileId, newParentId) {
  // Get current parents
  const { data: file } = await drive.files.get({
    fileId,
    fields: 'parents',
    supportsAllDrives: true,
  })

  const oldParents = (file.parents || []).join(',')

  // Move the file
  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParents,
    supportsAllDrives: true,
  })
}

// ────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────

const mode = process.argv.includes('--fix') ? 'fix' : 'audit'

async function main() {
  try {
    console.log(`\n🔍 Composite Format Audit (mode: ${mode})\n`)
    console.log('='.repeat(70))

    // 1. Get all categories
    const categories = await sql`
      SELECT id, name, slug, gdrive_folder_id
      FROM categories
      ORDER BY name
    `
    console.log(`\nFound ${categories.length} categories\n`)

    // 2. Get all composites
    const composites = await sql`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.format,
        c.width,
        c.height,
        c.storage_path,
        c.storage_url,
        c.gdrive_file_id,
        c.category_id,
        cat.slug as category_slug,
        cat.gdrive_folder_id as category_gdrive_folder_id
      FROM composites c
      JOIN categories cat ON cat.id = c.category_id
      ORDER BY cat.slug, c.format, c.name
    `

    console.log(`Found ${composites.length} total composites\n`)

    const mismatches = []
    const correct = []

    for (const comp of composites) {
      const storedFormat = comp.format
      const storedWidth = comp.width
      const storedHeight = comp.height
      const fileId = comp.gdrive_file_id

      if (!fileId) {
        console.log(`  ⚠️  ${comp.name} — no gdrive_file_id, skipping`)
        continue
      }

      // Get actual dimensions from GDrive
      const dims = await getImageDimensions(fileId)
      if (!dims) {
        console.log(`  ⚠️  ${comp.name} — could not get dimensions, skipping`)
        continue
      }

      const detectedFormat = detectFormatFromDimensions(dims.width, dims.height)
      const folderInPath = comp.storage_path?.match(/composites\/(\d+x\d+)\//)?.[1] || 'unknown'
      const expectedFolder = FORMATS[storedFormat]?.folder || '1x1'

      const formatMatch = storedFormat === detectedFormat
      const folderMatch = folderInPath === expectedFolder
      const dimsMatch = storedWidth === dims.width && storedHeight === dims.height

      if (formatMatch && folderMatch && dimsMatch) {
        correct.push(comp)
      } else {
        mismatches.push({
          ...comp,
          actualWidth: dims.width,
          actualHeight: dims.height,
          detectedFormat,
          folderInPath,
          expectedFolder,
        })
      }
    }

    // 3. Report
    console.log('='.repeat(70))
    console.log(`\n✅ Correct: ${correct.length}`)
    console.log(`❌ Mismatches: ${mismatches.length}\n`)

    if (mismatches.length > 0) {
      console.log('='.repeat(70))
      console.log('MISMATCHES:')
      console.log('='.repeat(70))

      for (const m of mismatches) {
        console.log(`\n  📄 ${m.name}`)
        console.log(`     Category: ${m.category_slug}`)
        console.log(`     Stored format:   ${m.format} (${m.width}x${m.height})`)
        console.log(`     Actual dimensions: ${m.actualWidth}x${m.actualHeight}`)
        console.log(`     Detected format: ${m.detectedFormat || 'UNKNOWN'}`)
        console.log(`     Storage path:    ${m.storage_path}`)
        console.log(`     Folder in path:  ${m.folderInPath} (expected: ${m.expectedFolder})`)
        console.log(`     GDrive file ID:  ${m.gdrive_file_id}`)
      }
    }

    // 4. Fix mode
    if (mode === 'fix' && mismatches.length > 0) {
      console.log('\n' + '='.repeat(70))
      console.log('APPLYING FIXES:')
      console.log('='.repeat(70))

      for (const m of mismatches) {
        const correctFormat = m.detectedFormat
        if (!correctFormat) {
          console.log(`\n  ⏭️  Skipping ${m.name} — could not detect correct format`)
          continue
        }

        const correctConfig = FORMATS[correctFormat]
        if (!correctConfig) {
          console.log(`\n  ⏭️  Skipping ${m.name} — unknown format: ${correctFormat}`)
          continue
        }

        console.log(`\n  🔧 Fixing: ${m.name}`)
        console.log(`     ${m.format} → ${correctFormat}`)

        // a. Move file to correct GDrive folder
        const categoryFolderId = m.category_gdrive_folder_id
        if (!categoryFolderId) {
          console.log(`     ⚠️  Category ${m.category_slug} has no gdrive_folder_id, skipping GDrive move`)
        } else {
          try {
            // Navigate to the correct folder: {category}/composites/{format_folder}
            const correctFolderId = await navigateToFolder(categoryFolderId, [
              'composites',
              correctConfig.folder,
            ])

            await moveFile(m.gdrive_file_id, correctFolderId)
            console.log(`     ✅ Moved in GDrive to composites/${correctConfig.folder}/`)
          } catch (error) {
            console.log(`     ❌ GDrive move failed: ${error.message}`)
          }
        }

        // b. Update storage_path
        const oldFolderPattern = /composites\/\d+x\d+\//
        const newFolder = `composites/${correctConfig.folder}/`
        const newStoragePath = m.storage_path.replace(oldFolderPattern, newFolder)

        // c. Update Supabase metadata
        try {
          await sql`
            UPDATE composites
            SET
              format = ${correctFormat},
              width = ${m.actualWidth},
              height = ${m.actualHeight},
              storage_path = ${newStoragePath}
            WHERE id = ${m.id}
          `
          console.log(`     ✅ Updated Supabase: format=${correctFormat}, dims=${m.actualWidth}x${m.actualHeight}`)
          console.log(`     ✅ Updated path: ${newStoragePath}`)
        } catch (error) {
          console.log(`     ❌ Supabase update failed: ${error.message}`)
        }
      }

      console.log('\n' + '='.repeat(70))
      console.log('✅ All fixes applied!')
    }

    // 5. Also audit backgrounds and angled shots in composites folders
    console.log('\n' + '='.repeat(70))
    console.log('GDRIVE COMPOSITES FOLDER AUDIT:')
    console.log('='.repeat(70))

    for (const cat of categories) {
      if (!cat.gdrive_folder_id) continue

      console.log(`\n📁 ${cat.name} (${cat.slug})`)

      // Find composites folder
      try {
        const { data: compositesFolder } = await drive.files.list({
          q: `name='composites' and '${cat.gdrive_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

        if (!compositesFolder.files || compositesFolder.files.length === 0) {
          console.log(`   No composites folder found`)
          continue
        }

        const compositesFolderId = compositesFolder.files[0].id

        // List format subfolders
        const { data: formatFolders } = await drive.files.list({
          q: `'${compositesFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          orderBy: 'name',
        })

        for (const folder of (formatFolders.files || [])) {
          // List files in this format folder
          const { data: files } = await drive.files.list({
            q: `'${folder.id}' in parents and trashed=false`,
            fields: 'files(id, name, imageMediaMetadata(width,height))',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          })

          const fileCount = files.files?.length || 0
          console.log(`   📁 ${folder.name}/ — ${fileCount} files`)

          // Check dimensions of each file
          for (const file of (files.files || [])) {
            const meta = file.imageMediaMetadata
            if (meta && meta.width && meta.height) {
              const detected = detectFormatFromDimensions(meta.width, meta.height)
              const expectedFormat = folder.name.replace('x', ':')
              const match = detected === expectedFormat
              const icon = match ? '✅' : '❌'
              console.log(`      ${icon} ${file.name} — ${meta.width}x${meta.height} (detected: ${detected || 'unknown'}, folder: ${folder.name})`)
            } else {
              console.log(`      ⚠️  ${file.name} — no dimension metadata`)
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`)
      }
    }

    console.log('\n' + '='.repeat(70))
    console.log('Done!')

  } catch (error) {
    console.error('❌ Fatal error:', error)
  } finally {
    await sql.end()
  }
}

main()
