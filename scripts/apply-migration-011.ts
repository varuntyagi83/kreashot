#!/usr/bin/env tsx
/**
 * Apply migration 011 - Add storage sync to angled_shots
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function applyMigration() {
  console.log('📦 Applying migration 011_add_storage_sync_to_angled_shots.sql...\n')

  // Read migration file
  const migrationPath = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '011_add_storage_sync_to_angled_shots.sql'
  )

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

  // Execute migration using Supabase's RPC
  // Split by statement separator for better error handling
  const statements = migrationSQL
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'))

  console.log(`Found ${statements.length} SQL statements to execute\n`)

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';'
    console.log(`Executing statement ${i + 1}/${statements.length}...`)

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement })

      if (error) {
        // Ignore "already exists" errors
        if (
          error.message.includes('already exists') ||
          error.message.includes('does not exist')
        ) {
          console.log(`  ⚠️  Skipped (already applied): ${error.message}`)
        } else {
          console.error(`  ❌ Error:`, error)
          console.error(`  SQL:`, statement.substring(0, 200))
        }
      } else {
        console.log(`  ✅ Success`)
      }
    } catch (err) {
      console.error(`  ❌ Error:`, err)
      console.error(`  SQL:`, statement.substring(0, 200))
    }
  }

  console.log('\n🎉 Migration applied!')
}

applyMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
