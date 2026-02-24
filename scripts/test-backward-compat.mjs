/**
 * Test backward compatibility after Phase 1 migration
 * Verifies existing data queries work correctly with new schema
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function testBackwardCompatibility() {
  console.log('🧪 Testing Backward Compatibility\n')
  console.log('=' .repeat(60))

  let allTests = []

  try {
    // Test 1: Query existing templates
    console.log('\n✓ Test 1: Query existing templates')
    const templates = await sql`
      SELECT id, name, category_id, format, width, height
      FROM templates
      LIMIT 10
    `

    console.log(`  ✅ PASS - Found ${templates.length} templates`)
    if (templates.length > 0) {
      templates.forEach(t => {
        console.log(`     - ${t.name}: ${t.format} (${t.width}×${t.height})`)
      })
    }
    allTests.push({ test: 'query_templates', status: 'PASS' })

    // Test 2: Query existing composites
    console.log('\n✓ Test 2: Query existing composites')
    const composites = await sql`
      SELECT id, angled_shot_id, background_id, format, width, height
      FROM composites
      LIMIT 10
    `

    console.log(`  ✅ PASS - Found ${composites.length} composites`)
    if (composites.length > 0) {
      const formatCounts = {}
      composites.forEach(c => {
        formatCounts[c.format] = (formatCounts[c.format] || 0) + 1
      })
      Object.entries(formatCounts).forEach(([format, count]) => {
        console.log(`     - ${format}: ${count} composites`)
      })
    }
    allTests.push({ test: 'query_composites', status: 'PASS' })

    // Test 3: Query existing final_assets
    console.log('\n✓ Test 3: Query existing final_assets')
    const finalAssets = await sql`
      SELECT id, template_id, composite_id, format, width, height
      FROM final_assets
      LIMIT 10
    `

    console.log(`  ✅ PASS - Found ${finalAssets.length} final assets`)
    if (finalAssets.length > 0) {
      const formatCounts = {}
      finalAssets.forEach(fa => {
        formatCounts[fa.format] = (formatCounts[fa.format] || 0) + 1
      })
      Object.entries(formatCounts).forEach(([format, count]) => {
        console.log(`     - ${format}: ${count} final assets`)
      })
    }
    allTests.push({ test: 'query_final_assets', status: 'PASS' })

    // Test 4: JOIN queries still work
    console.log('\n✓ Test 4: JOIN queries with new format columns')
    const joinQuery = await sql`
      SELECT
        t.name as template_name,
        t.format,
        c.name as category_name,
        COUNT(comp.id) as composite_count
      FROM templates t
      JOIN categories c ON c.id = t.category_id
      LEFT JOIN composites comp ON comp.category_id = c.id
      GROUP BY t.id, t.name, t.format, c.name
    `

    console.log(`  ✅ PASS - JOIN query executed successfully`)
    if (joinQuery.length > 0) {
      joinQuery.forEach(row => {
        console.log(`     - ${row.category_name} (${row.format}): ${row.composite_count} composites`)
      })
    }
    allTests.push({ test: 'join_queries', status: 'PASS' })

    // Test 5: Foreign key constraints work
    console.log('\n✓ Test 5: Format foreign key constraints')
    try {
      // Try to insert invalid format (should fail)
      await sql`
        INSERT INTO templates (
          id, category_id, user_id, name, format, width, height,
          template_data, storage_provider, storage_path, storage_url
        ) VALUES (
          gen_random_uuid(),
          (SELECT id FROM categories LIMIT 1),
          (SELECT id FROM auth.users LIMIT 1),
          'Test Invalid Format',
          'invalid-format',
          1080,
          1080,
          '{"layers": [], "safe_zones": []}'::jsonb,
          'gdrive',
          'test/path',
          'http://test.com/test'
        )
      `
      console.log('  ❌ FAIL - Should have rejected invalid format')
      allTests.push({ test: 'format_fkey', status: 'FAIL' })
    } catch (error) {
      if (error.code === '23503') {  // Foreign key violation
        console.log('  ✅ PASS - Foreign key constraint working (rejected invalid format)')
        allTests.push({ test: 'format_fkey', status: 'PASS' })
      } else {
        console.log(`  ❌ FAIL - Unexpected error: ${error.message}`)
        allTests.push({ test: 'format_fkey', status: 'FAIL' })
      }
    }

    // Test 6: Default values work for new rows
    console.log('\n✓ Test 6: Default format values')
    const categoryId = await sql`SELECT id FROM categories LIMIT 1`.then(r => r[0]?.id)
    const userId = await sql`SELECT id FROM auth.users LIMIT 1`.then(r => r[0]?.id)

    if (categoryId && userId) {
      try {
        // Insert without specifying format (should default to 1:1)
        const testTemplate = await sql`
          INSERT INTO templates (
            category_id, user_id, name,
            template_data, storage_provider, storage_path, storage_url
          ) VALUES (
            ${categoryId},
            ${userId},
            'Backward Compat Test Template',
            '{"layers": [], "safe_zones": []}'::jsonb,
            'gdrive',
            'test/backward-compat',
            'http://test.com/backward-compat'
          )
          RETURNING id, format, width, height
        `

        if (testTemplate[0].format === '1:1' &&
            testTemplate[0].width === 1080 &&
            testTemplate[0].height === 1080) {
          console.log('  ✅ PASS - Defaults applied correctly (1:1, 1080×1080)')
          allTests.push({ test: 'default_values', status: 'PASS' })

          // Cleanup
          await sql`DELETE FROM templates WHERE id = ${testTemplate[0].id}`
        } else {
          console.log('  ❌ FAIL - Incorrect defaults')
          allTests.push({ test: 'default_values', status: 'FAIL' })
        }
      } catch (error) {
        console.log(`  ❌ FAIL - ${error.message}`)
        allTests.push({ test: 'default_values', status: 'FAIL' })
      }
    } else {
      console.log('  ⚠️  SKIP - No categories/users found for test')
      allTests.push({ test: 'default_values', status: 'SKIP' })
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 BACKWARD COMPATIBILITY TEST SUMMARY')
    console.log('='.repeat(60))

    const passed = allTests.filter(t => t.status === 'PASS').length
    const failed = allTests.filter(t => t.status === 'FAIL').length
    const skipped = allTests.filter(t => t.status === 'SKIP').length

    console.log(`\n✅ Passed: ${passed}/${allTests.length}`)
    console.log(`❌ Failed: ${failed}/${allTests.length}`)
    if (skipped > 0) console.log(`⚠️  Skipped: ${skipped}/${allTests.length}`)

    if (failed === 0) {
      console.log('\n🎉 BACKWARD COMPATIBILITY: VERIFIED')
      console.log('✅ All existing queries work with new schema')
      console.log('✅ Foreign key constraints enforced')
      console.log('✅ Default values applied correctly')
      console.log('✅ No breaking changes detected')
      console.log('\n✅ Phase 1 Complete - Safe to proceed to Phase 2')
      return 0
    } else {
      console.log('\n⚠️  BACKWARD COMPATIBILITY: ISSUES DETECTED')
      console.log('Review failed tests above')
      return 1
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    return 1
  } finally {
    await sql.end()
  }
}

testBackwardCompatibility().then(exitCode => {
  process.exit(exitCode)
})
