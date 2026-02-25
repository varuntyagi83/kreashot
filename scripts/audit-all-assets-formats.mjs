/**
 * Audit ALL assets (backgrounds, angled_shots) for format mismatches
 * Checks GDrive folders vs Supabase metadata vs actual image dimensions
 *
 * Usage:
 *   npx @railway/cli run node scripts/audit-all-assets-formats.mjs --audit
 *   npx @railway/cli run node scripts/audit-all-assets-formats.mjs --fix
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

const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

const FORMATS = {
  '1:1':  { width: 1080, height: 1080, folder: '1x1' },
  '16:9': { width: 1920, height: 1080, folder: '16x9' },
  '9:16': { width: 1080, height: 1920, folder: '9x16' },
  '4:5':  { width: 1080, height: 1350, folder: '4x5' },
}

function detectFormatFromDimensions(width, height) {
  if (!width || !height) return null
  const ratio = width / height

  const candidates = [
    { format: '1:1',  target: 1.0 },
    { format: '16:9', target: 16 / 9 },
    { format: '9:16', target: 9 / 16 },
    { format: '4:5',  target: 4 / 5 },
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

  const bestTarget = candidates.find(c => c.format === best).target
  if (bestDiff / bestTarget > 0.15) return null

  return best
}

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
    return null
  }
}

async function getOrCreateFolder(parentId, folderName) {
  const { data } = await drive.files.list({
    q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  if (data.files && data.files.length > 0) {
    return data.files[0].id
  }

  const { data: folder } = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  console.log(`    📁 Created folder: ${folderName}`)
  return folder.id
}

async function navigateToFolder(rootFolderId, pathSegments) {
  let currentId = rootFolderId
  for (const segment of pathSegments) {
    currentId = await getOrCreateFolder(currentId, segment)
  }
  return currentId
}

async function moveFile(fileId, newParentId) {
  const { data: file } = await drive.files.get({
    fileId,
    fields: 'parents',
    supportsAllDrives: true,
  })

  const oldParents = (file.parents || []).join(',')

  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParents,
    supportsAllDrives: true,
  })
}

const mode = process.argv.includes('--fix') ? 'fix' : 'audit'

async function auditBackgrounds() {
  console.log('\n' + '='.repeat(70))
  console.log('BACKGROUNDS AUDIT')
  console.log('='.repeat(70))

  const backgrounds = await sql`
    SELECT
      b.id,
      b.name,
      b.slug,
      b.format,
      b.width,
      b.height,
      b.storage_path,
      b.storage_url,
      b.gdrive_file_id,
      b.category_id,
      cat.slug as category_slug,
      cat.gdrive_folder_id as category_gdrive_folder_id
    FROM backgrounds b
    JOIN categories cat ON cat.id = b.category_id
    ORDER BY cat.slug, b.format, b.name
  `

  console.log(`\nFound ${backgrounds.length} backgrounds\n`)

  const mismatches = []
  const correct = []

  for (const bg of backgrounds) {
    const fileId = bg.gdrive_file_id
    if (!fileId) {
      console.log(`  ⚠️  ${bg.name} — no gdrive_file_id`)
      continue
    }

    const dims = await getImageDimensions(fileId)
    if (!dims) {
      console.log(`  ⚠️  ${bg.name} — could not get dimensions`)
      continue
    }

    const detectedFormat = detectFormatFromDimensions(dims.width, dims.height)
    const folderInPath = bg.storage_path?.match(/backgrounds\/(\d+x\d+)\//)?.[1] || 'unknown'
    const expectedFolder = FORMATS[bg.format]?.folder || '1x1'

    const formatMatch = bg.format === detectedFormat
    const folderMatch = folderInPath === expectedFolder
    const dimsMatch = bg.width === dims.width && bg.height === dims.height

    if (formatMatch && folderMatch && dimsMatch) {
      correct.push(bg)
    } else {
      mismatches.push({
        ...bg,
        actualWidth: dims.width,
        actualHeight: dims.height,
        detectedFormat,
        folderInPath,
        expectedFolder,
        formatMatch,
        folderMatch,
      })
    }
  }

  console.log(`✅ Correct: ${correct.length}`)
  console.log(`❌ Mismatches: ${mismatches.length}`)

  for (const m of mismatches) {
    console.log(`\n  📄 ${m.name}`)
    console.log(`     Category: ${m.category_slug}`)
    console.log(`     Stored:   ${m.format} (${m.width}x${m.height})`)
    console.log(`     Actual:   ${m.actualWidth}x${m.actualHeight} → ${m.detectedFormat || 'UNKNOWN'}`)
    console.log(`     Path:     ${m.storage_path}`)
    console.log(`     Folder:   ${m.folderInPath} (expected: ${m.expectedFolder})`)
    console.log(`     Format match: ${m.formatMatch}, Folder match: ${m.folderMatch}`)
  }

  if (mode === 'fix' && mismatches.length > 0) {
    console.log('\n  APPLYING BACKGROUND FIXES:')

    for (const m of mismatches) {
      const correctFormat = m.detectedFormat
      if (!correctFormat) {
        console.log(`\n  ⏭️  Skipping ${m.name} — unknown format`)
        continue
      }

      const correctConfig = FORMATS[correctFormat]
      console.log(`\n  🔧 Fixing: ${m.name} (${m.format} → ${correctFormat})`)

      // Move in GDrive if folder is wrong
      if (!m.folderMatch || m.folderInPath !== correctConfig.folder) {
        const categoryFolderId = m.category_gdrive_folder_id
        if (categoryFolderId) {
          try {
            const correctFolderId = await navigateToFolder(categoryFolderId, [
              'backgrounds',
              correctConfig.folder,
            ])
            await moveFile(m.gdrive_file_id, correctFolderId)
            console.log(`     ✅ Moved to backgrounds/${correctConfig.folder}/`)
          } catch (error) {
            console.log(`     ❌ GDrive move failed: ${error.message}`)
          }
        }
      }

      // Update Supabase — handle both path formats:
      //   1. With format subfolder: category/backgrounds/1x1/file.jpg
      //   2. Without format subfolder (legacy): category/backgrounds/file.jpg
      let newStoragePath
      const hasFormatSubfolder = /backgrounds\/\d+x\d+\//.test(m.storage_path)
      if (hasFormatSubfolder) {
        newStoragePath = m.storage_path.replace(/backgrounds\/\d+x\d+\//, `backgrounds/${correctConfig.folder}/`)
      } else {
        // Insert format subfolder: "category/backgrounds/file.jpg" → "category/backgrounds/16x9/file.jpg"
        newStoragePath = m.storage_path.replace(/backgrounds\//, `backgrounds/${correctConfig.folder}/`)
      }

      try {
        await sql`
          UPDATE backgrounds
          SET
            format = ${correctFormat},
            width = ${m.actualWidth},
            height = ${m.actualHeight},
            storage_path = ${newStoragePath}
          WHERE id = ${m.id}
        `
        console.log(`     ✅ Updated Supabase: path=${newStoragePath}`)
      } catch (error) {
        console.log(`     ❌ Supabase update failed: ${error.message}`)
      }
    }
  }

  return { correct: correct.length, mismatches: mismatches.length }
}

async function auditAngledShots() {
  console.log('\n' + '='.repeat(70))
  console.log('ANGLED SHOTS AUDIT')
  console.log('='.repeat(70))

  const shots = await sql`
    SELECT
      a.id,
      a.display_name,
      a.angle_name,
      a.format,
      a.width,
      a.height,
      a.storage_path,
      a.storage_url,
      a.gdrive_file_id,
      a.category_id,
      cat.slug as category_slug,
      cat.gdrive_folder_id as category_gdrive_folder_id
    FROM angled_shots a
    JOIN categories cat ON cat.id = a.category_id
    ORDER BY cat.slug, a.format, a.display_name
  `

  console.log(`\nFound ${shots.length} angled shots\n`)

  const mismatches = []
  const correct = []

  for (const shot of shots) {
    const fileId = shot.gdrive_file_id
    if (!fileId) {
      console.log(`  ⚠️  ${shot.display_name || shot.angle_name} — no gdrive_file_id`)
      continue
    }

    const dims = await getImageDimensions(fileId)
    if (!dims) {
      console.log(`  ⚠️  ${shot.display_name || shot.angle_name} — could not get dimensions`)
      continue
    }

    const detectedFormat = detectFormatFromDimensions(dims.width, dims.height)
    const folderInPath = shot.storage_path?.match(/angled-shots\/(\d+x\d+)\//)?.[1] || 'unknown'
    const expectedFolder = FORMATS[shot.format]?.folder || '1x1'

    const formatMatch = shot.format === detectedFormat
    const folderMatch = folderInPath === expectedFolder
    const dimsMatch = shot.width === dims.width && shot.height === dims.height

    if (formatMatch && folderMatch && dimsMatch) {
      correct.push(shot)
    } else {
      mismatches.push({
        ...shot,
        name: shot.display_name || shot.angle_name,
        actualWidth: dims.width,
        actualHeight: dims.height,
        detectedFormat,
        folderInPath,
        expectedFolder,
        formatMatch,
        folderMatch,
      })
    }
  }

  console.log(`✅ Correct: ${correct.length}`)
  console.log(`❌ Mismatches: ${mismatches.length}`)

  for (const m of mismatches) {
    console.log(`\n  📄 ${m.name}`)
    console.log(`     Category: ${m.category_slug}`)
    console.log(`     Stored:   ${m.format} (${m.width}x${m.height})`)
    console.log(`     Actual:   ${m.actualWidth}x${m.actualHeight} → ${m.detectedFormat || 'UNKNOWN'}`)
    console.log(`     Path:     ${m.storage_path}`)
    console.log(`     Folder:   ${m.folderInPath} (expected: ${m.expectedFolder})`)
    console.log(`     Format match: ${m.formatMatch}, Folder match: ${m.folderMatch}`)
  }

  if (mode === 'fix' && mismatches.length > 0) {
    console.log('\n  APPLYING ANGLED SHOTS FIXES:')

    for (const m of mismatches) {
      const correctFormat = m.detectedFormat
      if (!correctFormat) {
        console.log(`\n  ⏭️  Skipping ${m.name} — unknown format`)
        continue
      }

      const correctConfig = FORMATS[correctFormat]
      console.log(`\n  🔧 Fixing: ${m.name} (${m.format} → ${correctFormat})`)

      // Move in GDrive if folder is wrong
      if (!m.folderMatch || m.folderInPath !== correctConfig.folder) {
        const categoryFolderId = m.category_gdrive_folder_id
        if (categoryFolderId) {
          try {
            const correctFolderId = await navigateToFolder(categoryFolderId, [
              'angled-shots',
              correctConfig.folder,
            ])
            await moveFile(m.gdrive_file_id, correctFolderId)
            console.log(`     ✅ Moved to angled-shots/${correctConfig.folder}/`)
          } catch (error) {
            console.log(`     ❌ GDrive move failed: ${error.message}`)
          }
        }
      }

      // Update Supabase
      const oldFolderPattern = /angled-shots\/\d+x\d+\//
      const newFolder = `angled-shots/${correctConfig.folder}/`
      const newStoragePath = m.storage_path.replace(oldFolderPattern, newFolder)

      try {
        await sql`
          UPDATE angled_shots
          SET
            format = ${correctFormat},
            width = ${m.actualWidth},
            height = ${m.actualHeight},
            storage_path = ${newStoragePath}
          WHERE id = ${m.id}
        `
        console.log(`     ✅ Updated Supabase`)
      } catch (error) {
        console.log(`     ❌ Supabase update failed: ${error.message}`)
      }
    }
  }

  return { correct: correct.length, mismatches: mismatches.length }
}

async function main() {
  try {
    console.log(`\n🔍 Full Asset Format Audit (mode: ${mode})\n`)

    const bgResult = await auditBackgrounds()
    const shotResult = await auditAngledShots()

    console.log('\n' + '='.repeat(70))
    console.log('SUMMARY')
    console.log('='.repeat(70))
    console.log(`  Backgrounds:  ${bgResult.correct} correct, ${bgResult.mismatches} mismatched`)
    console.log(`  Angled Shots: ${shotResult.correct} correct, ${shotResult.mismatches} mismatched`)
    console.log('='.repeat(70))

  } catch (error) {
    console.error('❌ Fatal error:', error)
  } finally {
    await sql.end()
  }
}

main()
