/**
 * Phase 2: Update Storage Paths (Simplified)
 *
 * Updates database storage_path fields to include format folders
 * Format: {category-slug}/{resource-type}/{format}/{filename}
 *
 * Example:
 *   Old: gummy-bear/composites/shot_123.jpg
 *   New: gummy-bear/composites/1x1/shot_123.jpg
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function updateStoragePaths() {
  console.log('🔄 Phase 2: Update Storage Paths')
  console.log('='.repeat(60))
  console.log('\nThis will update database storage paths to include format folders')
  console.log('Format: {category-slug}/{resource-type}/{format}/{filename}\n')

  try {
    // Step 1: Update composites paths
    console.log('📦 Step 1: Updating Composites Paths')
    console.log('-'.repeat(60))

    const composites = await sql`
      SELECT id, storage_path, format
      FROM composites
      WHERE storage_path NOT LIKE '%/1x1/%'
        AND storage_path NOT LIKE '%/16x9/%'
        AND storage_path NOT LIKE '%/9x16/%'
        AND storage_path NOT LIKE '%/4x5/%'
    `

    console.log(`Found ${composites.length} composites to update`)

    for (const composite of composites) {
      const oldPath = composite.storage_path
      // Insert format folder: gummy-bear/composites/file.jpg -> gummy-bear/composites/1x1/file.jpg
      const newPath = oldPath.replace(
        /^(.*\/composites)\/(.*)/,
        `$1/${composite.format}/$2`
      )

      await sql`
        UPDATE composites
        SET storage_path = ${newPath}
        WHERE id = ${composite.id}
      `

      console.log(`✓ ${oldPath} → ${newPath}`)
    }

    console.log(`✅ Updated ${composites.length} composite paths\n`)

    // Step 2: Update templates paths
    console.log('📋 Step 2: Updating Templates Paths')
    console.log('-'.repeat(60))

    const templates = await sql`
      SELECT id, storage_path, format
      FROM templates
      WHERE storage_path NOT LIKE '%/1x1/%'
        AND storage_path NOT LIKE '%/16x9/%'
        AND storage_path NOT LIKE '%/9x16/%'
        AND storage_path NOT LIKE '%/4x5/%'
    `

    console.log(`Found ${templates.length} templates to update`)

    for (const template of templates) {
      const oldPath = template.storage_path
      const newPath = oldPath.replace(
        /^(.*\/templates)\/(.*)/,
        `$1/${template.format}/$2`
      )

      await sql`
        UPDATE templates
        SET storage_path = ${newPath}
        WHERE id = ${template.id}
      `

      console.log(`✓ ${oldPath} → ${newPath}`)
    }

    console.log(`✅ Updated ${templates.length} template paths\n`)

    // Step 3: Update guidelines paths (default to 1x1 for existing)
    console.log('📄 Step 3: Updating Guidelines Paths')
    console.log('-'.repeat(60))

    const guidelines = await sql`
      SELECT id, storage_path
      FROM guidelines
      WHERE storage_path NOT LIKE '%/1x1/%'
        AND storage_path NOT LIKE '%/16x9/%'
        AND storage_path NOT LIKE '%/9x16/%'
        AND storage_path NOT LIKE '%/4x5/%'
    `

    console.log(`Found ${guidelines.length} guidelines to update`)

    for (const guideline of guidelines) {
      const oldPath = guideline.storage_path
      const newPath = oldPath.replace(
        /^(.*\/guidelines)\/(.*)/,
        `$1/1x1/$2`  // Default to 1x1 for existing guidelines
      )

      await sql`
        UPDATE guidelines
        SET storage_path = ${newPath}
        WHERE id = ${guideline.id}
      `

      console.log(`✓ ${oldPath} → ${newPath}`)
    }

    console.log(`✅ Updated ${guidelines.length} guideline paths\n`)

    // Step 4: Update final_assets paths (if any exist)
    console.log('🎨 Step 4: Updating Final Assets Paths')
    console.log('-'.repeat(60))

    const finalAssets = await sql`
      SELECT id, storage_path, format
      FROM final_assets
      WHERE storage_path NOT LIKE '%/1x1/%'
        AND storage_path NOT LIKE '%/16x9/%'
        AND storage_path NOT LIKE '%/9x16/%'
        AND storage_path NOT LIKE '%/4x5/%'
    `

    console.log(`Found ${finalAssets.length} final assets to update`)

    for (const asset of finalAssets) {
      const oldPath = asset.storage_path
      const newPath = oldPath.replace(
        /^(.*\/final-assets)\/(.*)/,
        `$1/${asset.format}/$2`
      )

      await sql`
        UPDATE final_assets
        SET storage_path = ${newPath}
        WHERE id = ${asset.id}
      `

      console.log(`✓ ${oldPath} → ${newPath}`)
    }

    console.log(`✅ Updated ${finalAssets.length} final asset paths\n`)

    // Step 5: Verification
    console.log('🔍 Step 5: Verification')
    console.log('='.repeat(60))

    const verification = await sql`
      SELECT
        'composites' as resource_type,
        CASE
          WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
          WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
          WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
          WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
          ELSE 'no-format-folder'
        END as format_folder,
        COUNT(*) as count
      FROM composites
      GROUP BY format_folder

      UNION ALL

      SELECT
        'templates' as resource_type,
        CASE
          WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
          WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
          WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
          WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
          ELSE 'no-format-folder'
        END as format_folder,
        COUNT(*) as count
      FROM templates
      GROUP BY format_folder

      UNION ALL

      SELECT
        'guidelines' as resource_type,
        CASE
          WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
          WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
          WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
          WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
          ELSE 'no-format-folder'
        END as format_folder,
        COUNT(*) as count
      FROM guidelines
      GROUP BY format_folder

      ORDER BY resource_type, format_folder
    `

    console.log('\n📊 Storage Path Verification:')
    console.table(verification)

    const hasUnmigrated = verification.some(v => v.format_folder === 'no-format-folder')

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 PHASE 2 SUMMARY')
    console.log('='.repeat(60))

    if (!hasUnmigrated) {
      console.log('\n🎉 Phase 2 Complete!')
      console.log('✅ All storage paths updated with format folders')
      console.log('✅ Path structure: {category}/{resource}/{format}/{filename}')
      console.log('\n📝 New File Upload Pattern:')
      console.log('   - composites/1x1/file.jpg')
      console.log('   - composites/16x9/file.jpg')
      console.log('   - templates/1x1/template.json')
      console.log('   - guidelines/16x9/guideline.pdf')
      console.log('\n✅ Ready to proceed to Phase 3: Template Builder Updates')
      return 0
    } else {
      console.log('\n⚠️  Phase 2 completed with warnings')
      console.log('Some files still in old path format')
      return 1
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    return 1
  } finally {
    await sql.end()
  }
}

updateStoragePaths().then(exitCode => {
  process.exit(exitCode)
})
