#!/usr/bin/env tsx
/**
 * Apply Migration 013: Add templates table
 */

import { Client } from 'pg'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function runMigration() {
  console.log('🔧 Applying Migration 013: Add templates table\n')

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('✅ Connected to database\n')

    const migrationPath = path.join(
      __dirname,
      '..',
      'supabase',
      'migrations',
      '013_add_templates_table.sql'
    )

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

    console.log('Executing migration SQL...\n')

    // Execute the entire migration as one transaction
    await client.query('BEGIN')

    try {
      await client.query(migrationSQL)
      await client.query('COMMIT')

      console.log('\n✅ Migration 013 applied successfully!')
      console.log('\nWhat was created:')
      console.log('1. templates table with template_data JSONB field')
      console.log('2. RLS policies for template access')
      console.log('3. Deletion queue triggers for storage sync')
      console.log('4. Storage sync fields added to guidelines table')
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error('\n❌ Migration failed:', error.message)
      throw error
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
