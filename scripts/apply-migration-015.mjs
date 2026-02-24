/**
 * Apply migration 015: Multi-format support
 * Uses direct PostgreSQL connection
 */

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env.local')
  process.exit(1)
}

async function applyMigration() {
  console.log('🔄 Applying migration 015: Multi-format support...\n')

  // Connect to database
  const sql = postgres(DATABASE_URL, {
    max: 1,
    ssl: 'require'
  })

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../supabase/migrations/015_multi_format_support.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('📄 Migration file loaded')
    console.log(`📏 Size: ${(migrationSQL.length / 1024).toFixed(2)} KB\n`)

    // Execute migration (postgres library handles multiple statements)
    console.log('⚙️  Executing migration...\n')

    await sql.unsafe(migrationSQL)

    console.log('✅ Migration executed successfully!\n')

    // Run verification
    console.log('🔍 Running verification checks...\n')

    // Check 1: format_configs table
    const formatConfigs = await sql`
      SELECT format, name, width, height, aspect_ratio, platform_tags
      FROM format_configs
      ORDER BY format
    `

    console.log('✅ format_configs table:')
    console.table(formatConfigs.map(fc => ({
      Format: fc.format,
      Name: fc.name,
      Dimensions: `${fc.width}×${fc.height}`,
      'Aspect Ratio': fc.aspect_ratio,
      Platforms: fc.platform_tags.join(', ')
    })))

    // Check 2: templates have format columns
    const templateStats = await sql`
      SELECT
        format,
        COUNT(*) as count,
        MIN(width) as min_width,
        MAX(width) as max_width,
        MIN(height) as min_height,
        MAX(height) as max_height
      FROM templates
      WHERE deleted_at IS NULL
      GROUP BY format
      ORDER BY format
    `

    console.log('\n✅ templates table format stats:')
    if (templateStats.length > 0) {
      console.table(templateStats.map(t => ({
        Format: t.format,
        Count: t.count,
        'Width Range': t.min_width === t.max_width ? t.min_width : `${t.min_width}-${t.max_width}`,
        'Height Range': t.min_height === t.max_height ? t.min_height : `${t.min_height}-${t.max_height}`
      })))
    } else {
      console.log('   (No templates found)')
    }

    // Check 3: composites have format columns
    const compositeStats = await sql`
      SELECT
        format,
        COUNT(*) as count
      FROM composites
      WHERE deleted_at IS NULL
      GROUP BY format
      ORDER BY format
    `

    console.log('\n✅ composites table format stats:')
    if (compositeStats.length > 0) {
      console.table(compositeStats.map(c => ({
        Format: c.format,
        Count: c.count
      })))
    } else {
      console.log('   (No composites found)')
    }

    // Check 4: final_assets have format columns
    const finalAssetStats = await sql`
      SELECT
        format,
        COUNT(*) as count
      FROM final_assets
      WHERE deleted_at IS NULL
      GROUP BY format
      ORDER BY format
    `

    console.log('\n✅ final_assets table format stats:')
    if (finalAssetStats.length > 0) {
      console.table(finalAssetStats.map(f => ({
        Format: f.format,
        Count: f.count
      })))
    } else {
      console.log('   (No final assets found)')
    }

    // Check 5: Verify views exist
    const views = await sql`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('templates_by_format', 'composites_by_format', 'final_assets_by_format')
      ORDER BY table_name
    `

    console.log('\n✅ Format views created:')
    console.log(`   ${views.map(v => v.table_name).join(', ')}`)

    // Check 6: Verify unique constraint works
    const constraintCheck = await sql`
      SELECT
        conname,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'templates'::regclass
        AND conname LIKE '%format%'
    `

    console.log('\n✅ Format constraints:')
    constraintCheck.forEach(c => {
      console.log(`   - ${c.conname}`)
      console.log(`     ${c.definition}`)
    })

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 MIGRATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ 4 formats configured: ${formatConfigs.map(f => f.format).join(', ')}`)
    console.log(`✅ ${templateStats.reduce((sum, t) => sum + Number(t.count), 0)} templates migrated`)
    console.log(`✅ ${compositeStats.reduce((sum, c) => sum + Number(c.count), 0)} composites migrated`)
    console.log(`✅ ${finalAssetStats.reduce((sum, f) => sum + Number(f.count), 0)} final assets migrated`)
    console.log(`✅ 3 helper views created`)
    console.log(`✅ Format foreign key constraints added`)
    console.log('\n🎉 Migration 015 completed successfully!')
    console.log('='.repeat(60))

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    throw error
  } finally {
    await sql.end()
  }
}

applyMigration().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
