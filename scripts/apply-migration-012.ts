#!/usr/bin/env tsx
/**
 * Apply Migration 012: Add storage sync to copy_docs table
 * This script applies the migration using the Supabase service role key
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

async function applyMigration() {
  console.log('🔧 Applying Migration 012: Add storage sync to copy_docs table\n')

  const migrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '012_add_copy_docs_storage_sync.sql'
  )

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

  // Split by semicolons to execute one statement at a time
  const statements = migrationSQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))

  console.log(`Found ${statements.length} SQL statements to execute\n`)

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    const preview = statement.substring(0, 100).replace(/\s+/g, ' ')

    try {
      console.log(`${i + 1}/${statements.length}: ${preview}...`)

      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';',
      })

      if (error) {
        // Try alternative method using raw query
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ sql_query: statement + ';' }),
          }
        )

        if (!response.ok) {
          console.error(`   ❌ Error: ${error.message}`)
          console.error(`   Statement: ${statement.substring(0, 200)}`)
          // Continue with next statement
        } else {
          console.log(`   ✅ Success`)
        }
      } else {
        console.log(`   ✅ Success`)
      }
    } catch (err: any) {
      console.error(`   ❌ Error: ${err.message}`)
      console.error(`   Statement: ${statement.substring(0, 200)}`)
      // Continue with next statement
    }

    // Small delay between statements
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  console.log('\n✅ Migration 012 application completed!')
  console.log('\nPlease verify the migration was successful:')
  console.log('1. Refresh your browser')
  console.log('2. Try saving a copy again')
  console.log('3. Check if it appears in the gallery')
}

applyMigration().catch(console.error)
