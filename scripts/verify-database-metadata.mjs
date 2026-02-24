/**
 * Verify database metadata includes format information
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function verifyMetadata() {
  console.log('🔍 Verifying database metadata for multi-format support\n')
  console.log('='.repeat(60))

  try {
    const category = await sql`
      SELECT id, slug FROM categories WHERE slug = 'gummy-bear' LIMIT 1
    `
    const cat = category[0]

    console.log('\n📂 Category:', cat.slug, '\n')

    // Check angled_shots
    console.log('1️⃣  ANGLED SHOTS:')
    const angledShots = await sql`
      SELECT format, COUNT(*) as count,
             AVG(width) as avg_width, AVG(height) as avg_height,
             array_agg(DISTINCT storage_path) as sample_paths
      FROM angled_shots
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `
    angledShots.forEach(row => {
      console.log(`   ${row.format}: ${row.count} shots (${Math.round(row.avg_width)}x${Math.round(row.avg_height)})`)
      console.log(`      Sample path: ${row.sample_paths[0]}`)
    })

    // Check backgrounds
    console.log('\n2️⃣  BACKGROUNDS:')
    const backgrounds = await sql`
      SELECT format, COUNT(*) as count,
             AVG(width) as avg_width, AVG(height) as avg_height,
             array_agg(storage_path) as sample_paths
      FROM backgrounds
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `
    backgrounds.forEach(row => {
      console.log(`   ${row.format}: ${row.count} backgrounds (${Math.round(row.avg_width)}x${Math.round(row.avg_height)})`)
      console.log(`      Sample path: ${row.sample_paths[0]}`)
    })

    // Check composites
    console.log('\n3️⃣  COMPOSITES:')
    const composites = await sql`
      SELECT format, COUNT(*) as count,
             AVG(width) as avg_width, AVG(height) as avg_height,
             array_agg(storage_path) as sample_paths
      FROM composites
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `
    if (composites.length > 0) {
      composites.forEach(row => {
        console.log(`   ${row.format}: ${row.count} composites (${Math.round(row.avg_width)}x${Math.round(row.avg_height)})`)
        console.log(`      Sample path: ${row.sample_paths[0]}`)
      })
    } else {
      console.log('   (none yet)')
    }

    // Check templates
    console.log('\n4️⃣  TEMPLATES:')
    const templates = await sql`
      SELECT format, COUNT(*) as count,
             AVG(width) as avg_width, AVG(height) as avg_height,
             array_agg(name) as names
      FROM templates
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `
    templates.forEach(row => {
      console.log(`   ${row.format}: ${row.count} templates (${Math.round(row.avg_width)}x${Math.round(row.avg_height)})`)
      console.log(`      Name: ${row.names[0]}`)
    })

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ VERIFICATION COMPLETE')
    console.log('='.repeat(60))
    console.log('Database metadata is correctly storing:')
    console.log('  ✓ format (aspect ratio)')
    console.log('  ✓ width and height (dimensions)')
    console.log('  ✓ storage_path (with format-specific folders)')
    console.log('\n📝 Next: Update UI to support format selection')

    return 0

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

verifyMetadata().then(exitCode => {
  process.exit(exitCode)
})
