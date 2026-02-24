/**
 * Verify Phase 1: Multi-format migration
 * Checks if all components are in place and working
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function verifyPhase1() {
  console.log('🔍 Phase 1 Verification: Multi-Format Support\n')
  console.log('=' .repeat(60))

  let allChecks = []

  try {
    // Check 1: format_configs table exists with 4 formats
    console.log('\n✓ Check 1: format_configs table')
    const formatConfigs = await sql`
      SELECT format, name, width, height
      FROM format_configs
      ORDER BY format
    `

    if (formatConfigs.length === 4) {
      console.log('  ✅ PASS - Found 4 formats:')
      formatConfigs.forEach(fc => {
        console.log(`     - ${fc.format}: ${fc.name} (${fc.width}×${fc.height})`)
      })
      allChecks.push({ check: 'format_configs', status: 'PASS' })
    } else {
      console.log(`  ❌ FAIL - Expected 4 formats, found ${formatConfigs.length}`)
      allChecks.push({ check: 'format_configs', status: 'FAIL' })
    }

    // Check 2: templates table has format columns
    console.log('\n✓ Check 2: templates table has format/width/height columns')
    const templateCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'templates'
        AND column_name IN ('format', 'width', 'height')
      ORDER BY column_name
    `

    if (templateCols.length === 3) {
      console.log('  ✅ PASS - All format columns exist')
      allChecks.push({ check: 'templates_columns', status: 'PASS' })
    } else {
      console.log(`  ❌ FAIL - Missing columns. Found: ${templateCols.map(c => c.column_name).join(', ')}`)
      allChecks.push({ check: 'templates_columns', status: 'FAIL' })
    }

    // Check 3: All existing templates have 1:1 format
    console.log('\n✓ Check 3: Existing templates have 1:1 format')
    const templates = await sql`
      SELECT id, name, format, width, height
      FROM templates
    `

    const all1x1 = templates.every(t => t.format === '1:1' && t.width === 1080 && t.height === 1080)

    if (all1x1 || templates.length === 0) {
      console.log(`  ✅ PASS - All ${templates.length} templates are 1:1 (1080×1080)`)
      if (templates.length > 0) {
        templates.forEach(t => {
          console.log(`     - ${t.name}: ${t.format} (${t.width}×${t.height})`)
        })
      }
      allChecks.push({ check: 'templates_format', status: 'PASS' })
    } else {
      console.log('  ❌ FAIL - Some templates have incorrect format')
      allChecks.push({ check: 'templates_format', status: 'FAIL' })
    }

    // Check 4: Unique constraint for (category_id, format)
    console.log('\n✓ Check 4: Unique constraint on (category_id, format)')
    const uniqueIndex = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'templates'
        AND indexname = 'idx_templates_category_format'
    `

    if (uniqueIndex.length > 0) {
      console.log('  ✅ PASS - Unique index exists')
      console.log(`     ${uniqueIndex[0].indexdef}`)
      allChecks.push({ check: 'unique_constraint', status: 'PASS' })
    } else {
      console.log('  ❌ FAIL - Unique index missing')
      allChecks.push({ check: 'unique_constraint', status: 'FAIL' })
    }

    // Check 5: composites table has format columns
    console.log('\n✓ Check 5: composites table has format/width/height columns')
    const compositeCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'composites'
        AND column_name IN ('format', 'width', 'height')
      ORDER BY column_name
    `

    if (compositeCols.length === 3) {
      console.log('  ✅ PASS - All format columns exist')
      allChecks.push({ check: 'composites_columns', status: 'PASS' })
    } else {
      console.log(`  ❌ FAIL - Missing columns`)
      allChecks.push({ check: 'composites_columns', status: 'FAIL' })
    }

    // Check 6: final_assets table has format columns
    console.log('\n✓ Check 6: final_assets table has format/width/height columns')
    const finalAssetCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'final_assets'
        AND column_name IN ('format', 'width', 'height')
      ORDER BY column_name
    `

    if (finalAssetCols.length === 3) {
      console.log('  ✅ PASS - All format columns exist')
      allChecks.push({ check: 'final_assets_columns', status: 'PASS' })
    } else {
      console.log(`  ❌ FAIL - Missing columns`)
      allChecks.push({ check: 'final_assets_columns', status: 'FAIL' })
    }

    // Check 7: Foreign key constraints to format_configs
    console.log('\n✓ Check 7: Foreign key constraints to format_configs')
    const fkeys = await sql`
      SELECT
        conrelid::regclass AS table_name,
        conname AS constraint_name
      FROM pg_constraint
      WHERE confrelid = 'format_configs'::regclass
      ORDER BY conrelid::regclass::text
    `

    if (fkeys.length >= 3) {
      console.log(`  ✅ PASS - Found ${fkeys.length} foreign key constraints:`)
      fkeys.forEach(fk => {
        console.log(`     - ${fk.table_name}: ${fk.constraint_name}`)
      })
      allChecks.push({ check: 'foreign_keys', status: 'PASS' })
    } else {
      console.log(`  ❌ FAIL - Expected 3 foreign keys, found ${fkeys.length}`)
      allChecks.push({ check: 'foreign_keys', status: 'FAIL' })
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 VERIFICATION SUMMARY')
    console.log('='.repeat(60))

    const passed = allChecks.filter(c => c.status === 'PASS').length
    const failed = allChecks.filter(c => c.status === 'FAIL').length

    console.log(`\n✅ Passed: ${passed}/${allChecks.length}`)
    console.log(`❌ Failed: ${failed}/${allChecks.length}`)

    if (failed === 0) {
      console.log('\n🎉 Phase 1 Migration: COMPLETE')
      console.log('✅ Multi-format support is fully configured')
      console.log('✅ All existing 1:1 assets preserved')
      console.log('✅ Ready for Phase 2: Storage Organization')
      return 0
    } else {
      console.log('\n⚠️  Phase 1 Migration: INCOMPLETE')
      console.log('Some checks failed. Review errors above.')
      return 1
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error)
    return 1
  } finally {
    await sql.end()
  }
}

verifyPhase1().then(exitCode => {
  process.exit(exitCode)
})
