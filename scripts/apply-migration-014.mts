#!/usr/bin/env tsx
/**
 * Apply migration 014: final_assets table
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function applyMigration() {
  console.log('📊 Applying migration: 014_add_final_assets_table.sql')

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '014_add_final_assets_table.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

    if (error) {
      console.error('❌ Migration failed:', error)
      throw error
    }

    console.log('✅ Migration applied successfully!')
  } catch (error) {
    // If exec_sql function doesn't exist, we need to use SQL directly
    console.log('⚠️  exec_sql function not available, using direct SQL execution')
    console.log('   Please run the SQL file manually in Supabase dashboard or use psql')
    console.log('')
    console.log('Migration content:')
    console.log(sql)
  }
}

applyMigration()
