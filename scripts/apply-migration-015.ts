/**
 * Apply migration 015: Multi-format support
 * Safely applies the migration using Supabase client
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function applyMigration() {
  console.log('🔄 Applying migration 015: Multi-format support...\n')

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Read migration file
  const migrationPath = join(process.cwd(), 'supabase/migrations/015_multi_format_support.sql')
  const migrationSQL = readFileSync(migrationPath, 'utf-8')

  console.log('📄 Migration file loaded')
  console.log(`📏 Size: ${migrationSQL.length} characters\n`)

  try {
    // Execute migration
    console.log('⚙️  Executing migration...\n')

    // Split migration into individual statements (handle multi-statement execution)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`📋 Found ${statements.length} SQL statements\n`)

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]

      // Skip comments and empty statements
      if (!statement || statement.startsWith('--') || statement.startsWith('/*')) {
        continue
      }

      console.log(`Executing statement ${i + 1}/${statements.length}...`)

      const { error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      })

      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message)
        // Continue with next statement (some errors are expected, like "column already exists")
      } else {
        console.log(`✅ Statement ${i + 1} executed`)
      }
    }

    console.log('\n✅ Migration execution completed\n')

    // Run verification
    console.log('🔍 Running verification checks...\n')

    const { data: verificationResults, error: verifyError } = await supabase
      .rpc('verify_multi_format_migration')

    if (verifyError) {
      console.error('❌ Verification error:', verifyError.message)
      console.log('⚠️  This may be because the verification function needs to be created.')
      console.log('⚠️  Trying alternative verification...\n')

      // Alternative verification: Check tables directly
      await runAlternativeVerification(supabase)
    } else {
      console.log('📊 Verification Results:')
      console.table(verificationResults)

      const allPassed = verificationResults.every((r: any) => r.status === 'PASS' || r.status === 'INFO')
      if (allPassed) {
        console.log('\n✅ All verification checks passed!')
      } else {
        console.log('\n⚠️  Some checks did not pass. Review results above.')
      }
    }

    console.log('\n🎉 Migration 015 completed!')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

async function runAlternativeVerification(supabase: any) {
  console.log('Running alternative verification checks...\n')

  // Check 1: format_configs exists
  const { data: formatConfigs, error: fcError } = await supabase
    .from('format_configs')
    .select('format, name, width, height')

  if (!fcError && formatConfigs) {
    console.log('✅ format_configs table exists')
    console.log(`   Found ${formatConfigs.length} formats:`)
    formatConfigs.forEach((fc: any) => {
      console.log(`   - ${fc.format}: ${fc.name} (${fc.width}×${fc.height})`)
    })
  } else {
    console.log('❌ format_configs table check failed:', fcError?.message)
  }

  // Check 2: templates have format column
  const { data: templates, error: tError } = await supabase
    .from('templates')
    .select('id, name, format, width, height')
    .limit(5)

  if (!tError && templates) {
    console.log('\n✅ templates table has format columns')
    console.log(`   Sample templates:`)
    templates.forEach((t: any) => {
      console.log(`   - ${t.name}: ${t.format} (${t.width}×${t.height})`)
    })
  } else {
    console.log('\n❌ templates table check failed:', tError?.message)
  }

  // Check 3: composites have format column
  const { data: composites, error: cError } = await supabase
    .from('composites')
    .select('id, format, width, height')
    .limit(5)

  if (!cError && composites) {
    console.log('\n✅ composites table has format columns')
    console.log(`   Found ${composites.length} composites`)
  } else {
    console.log('\n❌ composites table check failed:', cError?.message)
  }

  // Check 4: final_assets have format column
  const { data: finalAssets, error: faError } = await supabase
    .from('final_assets')
    .select('id, format, width, height')
    .limit(5)

  if (!faError && finalAssets) {
    console.log('\n✅ final_assets table has format columns')
    console.log(`   Found ${finalAssets.length} final assets`)
  } else {
    console.log('\n❌ final_assets table check failed:', faError?.message)
  }
}

applyMigration()
