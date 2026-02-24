#!/usr/bin/env tsx
/**
 * Apply Migration 012 using direct PostgreSQL connection
 */

import { Client } from 'pg'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function runMigration() {
  console.log('🔧 Applying Migration 012: Add storage sync to copy_docs table\n')

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
      '012_add_copy_docs_storage_sync.sql'
    )

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

    console.log('Executing migration SQL...\n')

    // Execute the entire migration as one transaction
    await client.query('BEGIN')

    try {
      await client.query(migrationSQL)
      await client.query('COMMIT')

      console.log('\n✅ Migration 012 applied successfully!')
      console.log('\nVerification:')
      console.log('1. Refresh your browser')
      console.log('2. Try saving a copy again')
      console.log('3. It should now appear in the gallery!')
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
