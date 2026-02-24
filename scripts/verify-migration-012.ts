#!/usr/bin/env tsx
/**
 * Verify Migration 012 was applied successfully
 */

import { Client } from 'pg'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function verifyMigration() {
  console.log('🔍 Verifying Migration 012...\n')

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()

    // Check if columns exist
    const result = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'copy_docs'
      AND column_name IN ('storage_provider', 'storage_path', 'storage_url', 'gdrive_file_id', 'prompt_used', 'updated_at')
      ORDER BY column_name;
    `)

    console.log('Columns in copy_docs table:')
    console.log('----------------------------')

    if (result.rows.length === 0) {
      console.log('❌ No storage sync columns found!')
      console.log('\nMigration may have failed. Please run:')
      console.log('  npx tsx scripts/run-migration-012.ts')
    } else {
      result.rows.forEach(row => {
        console.log(`✅ ${row.column_name} (${row.data_type})${row.column_default ? ` - default: ${row.column_default}` : ''}`)
      })
      console.log(`\n✅ Found ${result.rows.length}/6 expected columns`)

      if (result.rows.length === 6) {
        console.log('\n✅ Migration 012 successfully applied!')
      } else {
        console.log('\n⚠️  Missing some columns. Expected 6, found ' + result.rows.length)
      }
    }

    // Check for any saved copy docs
    const copyDocs = await client.query(`
      SELECT COUNT(*) as count FROM copy_docs WHERE category_id = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
    `)

    console.log(`\n📊 Copy docs in Gummy Bear category: ${copyDocs.rows[0].count}`)

  } catch (error: any) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.end()
  }
}

verifyMigration()
