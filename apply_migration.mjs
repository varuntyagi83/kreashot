#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

// Load environment variables
const envPath = join(process.cwd(), '.env.local')
dotenv.config({ path: envPath })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Read migration file
const migrationPath = join(process.cwd(), 'supabase', 'migrations', '014_add_final_assets_table.sql')
const sql = readFileSync(migrationPath, 'utf-8')

console.log('📊 Applying migration: 014_add_final_assets_table.sql')
console.log('')

// Split SQL into individual statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

console.log(`Found ${statements.length} SQL statements to execute...`)
console.log('')

// Execute each statement
for (let i = 0; i < statements.length; i++) {
  const statement = statements[i] + ';'

  // Skip comment-only statements
  if (statement.trim().startsWith('--')) continue

  console.log(`Executing statement ${i + 1}/${statements.length}...`)

  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql_string: statement
    })

    if (error) {
      console.error(`❌ Error in statement ${i + 1}:`, error.message)
      console.error('Statement:', statement.substring(0, 100) + '...')
      process.exit(1)
    }

    console.log(`✅ Statement ${i + 1} completed`)
  } catch (err) {
    console.error(`❌ Exception in statement ${i + 1}:`, err.message)
    console.error('Statement:', statement.substring(0, 100) + '...')
    process.exit(1)
  }
}

console.log('')
console.log('✅ Migration applied successfully!')
console.log('')

// Verify table was created
const { data, error } = await supabase
  .from('final_assets')
  .select('id')
  .limit(1)

if (error) {
  console.error('⚠️  Warning: Could not verify table creation:', error.message)
} else {
  console.log('✅ Verified: final_assets table exists and is accessible')
}

process.exit(0)
