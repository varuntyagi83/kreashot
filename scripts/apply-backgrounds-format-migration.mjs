/**
 * Apply migration 012: Add format support to backgrounds table
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function applyMigration() {
  console.log('📊 Applying migration 012: Add format to backgrounds table\n')

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../supabase/migrations/012_add_format_to_backgrounds.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('📄 Migration SQL:')
    console.log(migrationSQL)
    console.log('\n' + '='.repeat(60))

    // Execute migration
    await sql.unsafe(migrationSQL)

    console.log('\n✅ Migration applied successfully!')

    // Verify columns were added
    const columns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'backgrounds'
      AND column_name IN ('format', 'width', 'height')
      ORDER BY column_name
    `

    console.log('\n📊 Verified columns:')
    columns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) DEFAULT ${col.column_default || 'NULL'}`)
    })

    return 0

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

applyMigration().then(exitCode => {
  process.exit(exitCode)
})
