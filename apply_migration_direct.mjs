#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

// Load environment variables
dotenv.config({ path: join(process.cwd(), '.env.local') })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL environment variable')
  process.exit(1)
}

console.log('📊 Applying migration: 014_add_final_assets_table.sql')
console.log('')

// Read migration file
const migrationPath = join(process.cwd(), 'supabase', 'migrations', '014_add_final_assets_table.sql')
const sql = readFileSync(migrationPath, 'utf-8')

try {
  // Create PostgreSQL connection
  const db = postgres(databaseUrl)

  console.log('🔗 Connected to database')
  console.log('📝 Executing migration SQL...')
  console.log('')

  // Execute the entire migration as a transaction
  await db.unsafe(sql)

  console.log('✅ Migration applied successfully!')
  console.log('')

  // Verify table was created
  const result = await db`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'final_assets'
  `

  if (result.length > 0) {
    console.log('✅ Verified: final_assets table exists')

    // Check columns
    const columns = await db`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'final_assets'
      ORDER BY ordinal_position
    `

    console.log(`✅ Table has ${columns.length} columns:`)
    columns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`)
    })
  } else {
    console.error('⚠️  Warning: Could not verify table creation')
  }

  await db.end()
  process.exit(0)

} catch (error) {
  console.error('❌ Migration failed:', error.message)
  console.error('')
  console.error('Error details:', error)
  process.exit(1)
}
