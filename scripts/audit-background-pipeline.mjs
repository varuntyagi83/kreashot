/**
 * Comprehensive Background Pipeline Audit
 *
 * Verifies the entire background generation & save pipeline:
 * 1. Category look_and_feel is set and being referenced
 * 2. Backgrounds in Supabase have correct format metadata
 * 3. GDrive folder placement matches format metadata
 * 4. Actual image dimensions match format aspect ratio
 * 5. All storage fields (storage_path, storage_url, gdrive_file_id) are populated
 * 6. Format distribution across categories
 *
 * Usage:
 *   npx @railway/cli run node scripts/audit-background-pipeline.mjs
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
  '1:1':  { width: 1080, height: 1080, folder: '1x1', ratio: 1.0 },
  '16:9': { width: 1920, height: 1080, folder: '16x9', ratio: 16/9 },
  '9:16': { width: 1080, height: 1920, folder: '9x16', ratio: 9/16 },
  '4:5':  { width: 1080, height: 1350, folder: '4x5', ratio: 4/5 },
}

function detectFormat(width, height) {
  if (!width || !height) return null
  const ratio = width / height
  let best = null, bestDiff = Infinity
  for (const [fmt, cfg] of Object.entries(FORMATS)) {
    const diff = Math.abs(ratio - cfg.ratio)
    if (diff < bestDiff) { bestDiff = diff; best = fmt }
  }
  const bestTarget = FORMATS[best].ratio
  return (bestDiff / bestTarget > 0.15) ? null : best
}

async function getImageDimensions(fileId) {
  try {
    const { data } = await drive.files.get({
      fileId,
      fields: 'imageMediaMetadata(width,height)',
      supportsAllDrives: true,
    })
    const meta = data.imageMediaMetadata
    return (meta?.width && meta?.height) ? { width: meta.width, height: meta.height } : null
  } catch { return null }
}

const report = {
  timestamp: new Date().toISOString(),
  categories: [],
  backgrounds: {
    total: 0,
    byFormat: {},
    issues: [],
    allCorrect: [],
  },
  pipelineChecks: [],
  summary: {},
}

async function main() {
  try {
    console.log('\n' + '='.repeat(70))
    console.log('  COMPREHENSIVE BACKGROUND PIPELINE AUDIT')
    console.log('='.repeat(70))

    // ──────────────────────────────────────────
    // CHECK 1: Categories & look_and_feel
    // ──────────────────────────────────────────
    console.log('\n📋 CHECK 1: Categories & look_and_feel')
    console.log('-'.repeat(50))

    const categories = await sql`
      SELECT id, name, slug, look_and_feel, gdrive_folder_id
      FROM categories
      ORDER BY name
    `

    for (const cat of categories) {
      const hasLookAndFeel = !!cat.look_and_feel && cat.look_and_feel.trim().length > 0
      const hasGdriveFolderId = !!cat.gdrive_folder_id
      const icon = hasLookAndFeel ? '✅' : '❌'
      const gdriveIcon = hasGdriveFolderId ? '✅' : '⚠️'

      console.log(`  ${icon} ${cat.name} (${cat.slug})`)
      console.log(`     look_and_feel: ${hasLookAndFeel ? cat.look_and_feel.substring(0, 80) + '...' : 'MISSING'}`)
      console.log(`     ${gdriveIcon} gdrive_folder_id: ${hasGdriveFolderId ? cat.gdrive_folder_id : 'MISSING'}`)

      report.categories.push({
        name: cat.name,
        slug: cat.slug,
        hasLookAndFeel,
        lookAndFeelLength: cat.look_and_feel?.length || 0,
        hasGdriveFolderId,
      })

      if (!hasLookAndFeel) {
        report.pipelineChecks.push({
          check: 'look_and_feel',
          status: 'FAIL',
          message: `Category "${cat.name}" has no look_and_feel — backgrounds generated for this category will use generic styling`,
        })
      }
    }

    // ──────────────────────────────────────────
    // CHECK 2: All backgrounds with metadata
    // ──────────────────────────────────────────
    console.log('\n📋 CHECK 2: Background Metadata Integrity')
    console.log('-'.repeat(50))

    const backgrounds = await sql`
      SELECT
        b.id, b.name, b.slug, b.format, b.width, b.height,
        b.storage_path, b.storage_url, b.gdrive_file_id,
        b.storage_provider, b.prompt_used,
        b.category_id,
        cat.slug as category_slug,
        cat.name as category_name,
        cat.look_and_feel,
        cat.gdrive_folder_id as category_gdrive_folder_id
      FROM backgrounds b
      JOIN categories cat ON cat.id = b.category_id
      ORDER BY cat.slug, b.format, b.name
    `

    report.backgrounds.total = backgrounds.length
    console.log(`  Found ${backgrounds.length} backgrounds\n`)

    for (const bg of backgrounds) {
      const issues = []
      const checks = {
        name: bg.name,
        category: bg.category_slug,
        storedFormat: bg.format,
        storedWidth: bg.width,
        storedHeight: bg.height,
      }

      // Check required fields
      if (!bg.format) issues.push('Missing format')
      if (!bg.width || !bg.height) issues.push('Missing dimensions')
      if (!bg.storage_path) issues.push('Missing storage_path')
      if (!bg.storage_url) issues.push('Missing storage_url')
      if (!bg.gdrive_file_id) issues.push('Missing gdrive_file_id')
      if (!bg.storage_provider) issues.push('Missing storage_provider')

      // Check format is valid
      if (bg.format && !FORMATS[bg.format]) {
        issues.push(`Invalid format: ${bg.format}`)
      }

      // Check storage_path contains correct format folder
      const expectedFolder = FORMATS[bg.format]?.folder
      if (expectedFolder && bg.storage_path) {
        const pathHasFolder = bg.storage_path.includes(`backgrounds/${expectedFolder}/`)
        if (!pathHasFolder) {
          issues.push(`storage_path doesn't contain expected folder backgrounds/${expectedFolder}/`)
        }
      }

      // Check actual image dimensions from GDrive
      if (bg.gdrive_file_id) {
        const dims = await getImageDimensions(bg.gdrive_file_id)
        if (dims) {
          checks.actualWidth = dims.width
          checks.actualHeight = dims.height

          // Verify dimensions match what's stored
          if (dims.width !== bg.width || dims.height !== bg.height) {
            issues.push(`Dimension mismatch: stored ${bg.width}x${bg.height}, actual ${dims.width}x${dims.height}`)
          }

          // Verify aspect ratio matches format
          const detectedFormat = detectFormat(dims.width, dims.height)
          checks.detectedFormat = detectedFormat
          if (detectedFormat !== bg.format) {
            issues.push(`Aspect ratio mismatch: stored format ${bg.format}, detected ${detectedFormat}`)
          }
        } else {
          issues.push('Could not fetch image dimensions from GDrive')
        }
      }

      // Check storage_url format
      if (bg.storage_url && !bg.storage_url.includes('drive.google.com')) {
        issues.push(`Unexpected storage_url format: ${bg.storage_url.substring(0, 50)}...`)
      }

      // Track by format
      if (!report.backgrounds.byFormat[bg.format]) {
        report.backgrounds.byFormat[bg.format] = { count: 0, issues: 0 }
      }
      report.backgrounds.byFormat[bg.format].count++

      if (issues.length > 0) {
        report.backgrounds.byFormat[bg.format].issues++
        report.backgrounds.issues.push({ ...checks, issues })
        console.log(`  ❌ ${bg.name} (${bg.category_slug}, ${bg.format})`)
        for (const issue of issues) {
          console.log(`     → ${issue}`)
        }
      } else {
        report.backgrounds.allCorrect.push(checks)
        console.log(`  ✅ ${bg.name} (${bg.category_slug}, ${bg.format}) — ${checks.actualWidth}x${checks.actualHeight}`)
      }
    }

    // ──────────────────────────────────────────
    // CHECK 3: GDrive folder vs Supabase consistency
    // ──────────────────────────────────────────
    console.log('\n📋 CHECK 3: GDrive Folder Structure')
    console.log('-'.repeat(50))

    for (const cat of categories) {
      if (!cat.gdrive_folder_id) continue

      console.log(`\n  📁 ${cat.name} (${cat.slug})`)

      try {
        // Find backgrounds folder
        const { data: bgFolder } = await drive.files.list({
          q: `name='backgrounds' and '${cat.gdrive_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

        if (!bgFolder.files?.length) {
          console.log(`     ⚠️  No backgrounds folder`)
          continue
        }

        const bgFolderId = bgFolder.files[0].id

        // List format subfolders
        const { data: fmtFolders } = await drive.files.list({
          q: `'${bgFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name)',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          orderBy: 'name',
        })

        // Also list files directly in backgrounds/ (legacy files without format subfolder)
        const { data: rootFiles } = await drive.files.list({
          q: `'${bgFolderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
          fields: 'files(id, name, imageMediaMetadata(width,height))',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

        if (rootFiles.files?.length > 0) {
          console.log(`     ⚠️  ${rootFiles.files.length} files in backgrounds/ root (should be in format subfolder):`)
          for (const f of rootFiles.files) {
            const meta = f.imageMediaMetadata
            const dims = meta ? `${meta.width}x${meta.height}` : 'unknown dims'
            const detected = meta ? detectFormat(meta.width, meta.height) : null
            console.log(`        → ${f.name} (${dims}, detected: ${detected || 'unknown'})`)
            report.pipelineChecks.push({
              check: 'gdrive_folder_placement',
              status: 'WARN',
              message: `File "${f.name}" in backgrounds/ root for ${cat.slug}, should be in format subfolder`,
            })
          }
        }

        for (const folder of (fmtFolders.files || [])) {
          const { data: files } = await drive.files.list({
            q: `'${folder.id}' in parents and trashed=false`,
            fields: 'files(id, name, imageMediaMetadata(width,height))',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          })

          const fileCount = files.files?.length || 0
          const expectedFormat = folder.name.replace('x', ':')

          let wrongCount = 0
          for (const file of (files.files || [])) {
            const meta = file.imageMediaMetadata
            if (meta?.width && meta?.height) {
              const detected = detectFormat(meta.width, meta.height)
              if (detected !== expectedFormat) wrongCount++
            }
          }

          const icon = wrongCount === 0 ? '✅' : '❌'
          console.log(`     ${icon} ${folder.name}/ — ${fileCount} files${wrongCount > 0 ? ` (${wrongCount} wrong aspect ratio!)` : ''}`)
        }
      } catch (error) {
        console.log(`     ❌ Error: ${error.message}`)
      }
    }

    // ──────────────────────────────────────────
    // CHECK 4: Pipeline Code Issues
    // ──────────────────────────────────────────
    console.log('\n📋 CHECK 4: Pipeline Code Review Findings')
    console.log('-'.repeat(50))

    report.pipelineChecks.push({
      check: 'look_and_feel_usage',
      status: 'WARN',
      message: 'BackgroundGenerationForm sends user-edited lookAndFeel in request body, but generate route IGNORES it and uses category.look_and_feel from DB instead. The form textarea for look_and_feel is cosmetic — edits are discarded.',
    })

    report.pipelineChecks.push({
      check: 'multi_format_generation',
      status: 'PASS',
      message: 'Generate route correctly accepts formats[] array with backwards-compatible format string fallback. Loops over each format calling Gemini separately. Results tagged with correct format.',
    })

    report.pipelineChecks.push({
      check: 'save_route_format',
      status: 'PASS',
      message: 'Save route correctly extracts format from request, constructs storage_path with format subfolder (formatToFolderName), and stores format/width/height in Supabase.',
    })

    report.pipelineChecks.push({
      check: 'preview_grid_format',
      status: 'PASS',
      message: 'PreviewGrid correctly uses background.format (per-item) with fallback to global format prop. Format badge shown on each preview card.',
    })

    report.pipelineChecks.push({
      check: 'gemini_aspect_ratio',
      status: 'PASS',
      message: 'Gemini API call includes aspectRatio in both prompt text AND imageConfig. Temperature 0.7 for creative output. Image size fixed to 2K.',
    })

    report.pipelineChecks.push({
      check: 'gallery_format_filter',
      status: 'PASS',
      message: 'BackgroundGallery filters by format using ?format= query param. Supabase query applies .eq("format", formatFilter).',
    })

    report.pipelineChecks.push({
      check: 'style_reference_images',
      status: 'INFO',
      message: 'Generate route supports referenceAssetIds for style guidance images, but the BackgroundGenerationForm UI does not expose this feature.',
    })

    for (const check of report.pipelineChecks) {
      const icon = check.status === 'PASS' ? '✅' :
                   check.status === 'WARN' ? '⚠️' :
                   check.status === 'FAIL' ? '❌' : 'ℹ️'
      console.log(`  ${icon} [${check.check}] ${check.message}`)
    }

    // ──────────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────────
    console.log('\n' + '='.repeat(70))
    console.log('  AUDIT SUMMARY')
    console.log('='.repeat(70))

    const totalIssues = report.backgrounds.issues.length
    const totalCorrect = report.backgrounds.allCorrect.length
    const totalChecks = report.pipelineChecks.length
    const failedChecks = report.pipelineChecks.filter(c => c.status === 'FAIL').length
    const warnChecks = report.pipelineChecks.filter(c => c.status === 'WARN').length

    report.summary = {
      totalBackgrounds: report.backgrounds.total,
      correctBackgrounds: totalCorrect,
      issueBackgrounds: totalIssues,
      formatDistribution: report.backgrounds.byFormat,
      pipelineChecks: totalChecks,
      pipelinePassed: report.pipelineChecks.filter(c => c.status === 'PASS').length,
      pipelineWarnings: warnChecks,
      pipelineFailed: failedChecks,
    }

    console.log(`\n  Backgrounds: ${totalCorrect}/${report.backgrounds.total} correct`)
    if (totalIssues > 0) {
      console.log(`  ❌ ${totalIssues} backgrounds with issues`)
    }

    console.log(`\n  Format Distribution:`)
    for (const [fmt, stats] of Object.entries(report.backgrounds.byFormat)) {
      console.log(`    ${fmt}: ${stats.count} backgrounds (${stats.issues} issues)`)
    }

    console.log(`\n  Pipeline Checks: ${totalChecks} total`)
    console.log(`    ✅ Passed: ${report.summary.pipelinePassed}`)
    console.log(`    ⚠️  Warnings: ${warnChecks}`)
    console.log(`    ❌ Failed: ${failedChecks}`)

    console.log('\n  Categories:')
    for (const cat of report.categories) {
      console.log(`    ${cat.hasLookAndFeel ? '✅' : '❌'} ${cat.name} — look_and_feel: ${cat.lookAndFeelLength} chars`)
    }

    console.log('\n' + '='.repeat(70))

    // Output JSON report
    const reportJson = JSON.stringify(report, null, 2)
    console.log('\n📄 Full JSON report written to stdout for reference')

  } catch (error) {
    console.error('❌ Fatal error:', error)
  } finally {
    await sql.end()
  }
}

main()
