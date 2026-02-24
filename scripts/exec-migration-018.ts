/**
 * Script to execute migration 018 using direct PostgreSQL connection
 *
 * This script connects directly to Supabase PostgreSQL and executes the migration
 *
 * Usage:
 *   npx tsx scripts/exec-migration-018.ts
 */

import { Client } from 'pg'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const DATABASE_URL = process.env.DATABASE_URL!

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable')
  process.exit(1)
}

const migrationSQL = `
-- ============================================================================
-- Migration 018: Add Display Name to Angled Shots
-- ============================================================================

-- Add display_name column to angled_shots table
ALTER TABLE angled_shots
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add comment
COMMENT ON COLUMN angled_shots.display_name IS 'Display name with product prefix (e.g., "Product Name_Front")';

-- Update existing records to have display_name (without product prefix - will be updated by script)
UPDATE angled_shots
SET display_name = CASE
  WHEN angle_name = 'front' THEN 'Front'
  WHEN angle_name = 'left_30deg' THEN 'Left 30deg'
  WHEN angle_name = 'right_30deg' THEN 'Right 30deg'
  WHEN angle_name = 'top_45deg' THEN 'Top 45deg'
  WHEN angle_name = 'three_quarter_left' THEN 'Three Quarter Left'
  WHEN angle_name = 'three_quarter_right' THEN 'Three Quarter Right'
  WHEN angle_name = 'isometric' THEN 'Isometric'
  ELSE angle_name
END
WHERE display_name IS NULL;
`

async function executeMigration() {
  console.log('🚀 Executing Migration 018: Add display_name to angled_shots\n')

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    console.log('   ✅ Connected\n')

    console.log('📝 Executing migration SQL...')
    console.log('─'.repeat(70))
    console.log(migrationSQL)
    console.log('─'.repeat(70))
    console.log()

    const result = await client.query(migrationSQL)

    console.log('✅ Migration executed successfully!\n')
    console.log('📊 Results:')
    console.log(`   - display_name column added to angled_shots table`)
    console.log(`   - Existing records updated with formatted angle names\n`)

    console.log('📝 Next step: Run the display name update script to add product prefixes')
    console.log('   npx tsx scripts/update-angled-shot-display-names.ts --dry-run')
    console.log('   npx tsx scripts/update-angled-shot-display-names.ts\n')

  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

executeMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
