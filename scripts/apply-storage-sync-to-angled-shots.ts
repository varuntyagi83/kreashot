#!/usr/bin/env tsx
/**
 * Apply storage sync fields to angled_shots table
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

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
  db: {
    schema: 'public',
  },
})

async function execSQL(sql: string, description: string) {
  console.log(`📝 ${description}`)
  try {
    const { error } = await (supabase as any).rpc('exec_sql', { query: sql })
    if (error) {
      // Check if it's a benign error (column already exists, etc.)
      if (
        error.message.includes('already exists') ||
        error.message.includes('does not exist')
      ) {
        console.log(`  ⚠️  Skipped: ${error.message}`)
        return true
      }
      console.error(`  ❌ Error:`, error.message)
      return false
    }
    console.log(`  ✅ Success`)
    return true
  } catch (err: any) {
    if (
      err.message?.includes('already exists') ||
      err.message?.includes('does not exist')
    ) {
      console.log(`  ⚠️  Skipped: ${err.message}`)
      return true
    }
    console.error(`  ❌ Error:`, err.message || err)
    return false
  }
}

async function applyStorageSyncToAngledShots() {
  console.log('🔧 Adding storage sync fields to angled_shots table...\n')

  // Check if columns already exist
  const { data: columns } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_name', 'angled_shots')

  const existingColumns = new Set((columns || []).map((c: any) => c.column_name))

  console.log(
    `Found ${existingColumns.size} existing columns in angled_shots table\n`
  )

  // Add storage_provider if it doesn't exist
  if (!existingColumns.has('storage_provider')) {
    console.log('➕ Adding storage_provider column...')
    const { error } = await supabase.rpc('exec_sql', {
      query:
        "ALTER TABLE angled_shots ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'supabase'",
    })
    if (error) {
      console.error('  ❌ Error:', error)
    } else {
      console.log('  ✅ Added storage_provider column')
    }
  } else {
    console.log('⚠️  storage_provider column already exists')
  }

  // Add gdrive_file_id if it doesn't exist
  if (!existingColumns.has('gdrive_file_id')) {
    console.log('➕ Adding gdrive_file_id column...')
    const { error } = await supabase.rpc('exec_sql', {
      query: 'ALTER TABLE angled_shots ADD COLUMN gdrive_file_id TEXT',
    })
    if (error) {
      console.error('  ❌ Error:', error)
    } else {
      console.log('  ✅ Added gdrive_file_id column')
    }
  } else {
    console.log('⚠️  gdrive_file_id column already exists')
  }

  // Check if product_image_id exists (might need to migrate from product_asset_id)
  if (!existingColumns.has('product_image_id')) {
    console.log(
      '➕ Adding product_image_id column (migrating from product_asset_id)...'
    )

    // Add new column
    const { error: addError } = await supabase.rpc('exec_sql', {
      query:
        'ALTER TABLE angled_shots ADD COLUMN product_image_id UUID REFERENCES product_images(id) ON DELETE CASCADE',
    })
    if (addError) {
      console.error('  ❌ Error adding column:', addError)
    } else {
      console.log('  ✅ Added product_image_id column')

      // Migrate data from product_asset_id if it exists
      if (existingColumns.has('product_asset_id')) {
        console.log('  📦 Migrating data from product_asset_id...')
        const { error: migrateError } = await supabase.rpc('exec_sql', {
          query: `
            UPDATE angled_shots
            SET product_image_id = product_asset_id
            WHERE product_image_id IS NULL AND product_asset_id IS NOT NULL
          `,
        })
        if (migrateError) {
          console.error('  ❌ Error migrating data:', migrateError)
        } else {
          console.log('  ✅ Data migrated')
        }
      }

      // Make it NOT NULL after data migration
      const { error: notNullError } = await supabase.rpc('exec_sql', {
        query:
          'ALTER TABLE angled_shots ALTER COLUMN product_image_id SET NOT NULL',
      })
      if (notNullError) {
        console.error('  ❌ Error setting NOT NULL:', notNullError)
      } else {
        console.log('  ✅ Set product_image_id to NOT NULL')
      }

      // Drop old column
      if (existingColumns.has('product_asset_id')) {
        const { error: dropError } = await supabase.rpc('exec_sql', {
          query: 'ALTER TABLE angled_shots DROP COLUMN product_asset_id',
        })
        if (dropError) {
          console.error('  ❌ Error dropping old column:', dropError)
        } else {
          console.log('  ✅ Dropped old product_asset_id column')
        }
      }
    }
  } else {
    console.log('⚠️  product_image_id column already exists')
  }

  console.log('\n🎉 Storage sync fields added to angled_shots table!')
}

applyStorageSyncToAngledShots()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
