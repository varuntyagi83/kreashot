/**
 * Script to apply migration 018 directly via PostgreSQL
 *
 * This script uses the PostgreSQL connection to execute the migration SQL
 *
 * Usage:
 *   npx tsx scripts/apply-migration-018.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

// Extract database URL from Supabase URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseProjectRef = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)?.[1]

if (!supabaseProjectRef) {
  console.error('❌ Could not extract project ref from SUPABASE_URL')
  process.exit(1)
}

console.log('━'.repeat(70))
console.log('📋 MIGRATION 018: Add display_name to angled_shots')
console.log('━'.repeat(70))
console.log('\n⚠️  Please apply this migration manually through Supabase Dashboard\n')

console.log('🔗 SQL Editor URL:')
console.log(`   https://supabase.com/dashboard/project/${supabaseProjectRef}/sql/new\n`)

console.log('📝 SQL to execute:')
console.log('─'.repeat(70))
console.log(`
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
`)
console.log('─'.repeat(70))

console.log('\n📋 Steps to apply migration:')
console.log('  1. Click the URL above (opens Supabase SQL Editor)')
console.log('  2. Copy the SQL code above')
console.log('  3. Paste it into the SQL Editor')
console.log('  4. Click "Run" or press Cmd+Enter')
console.log('  5. Verify the migration succeeded\n')

console.log('✅ After migration, run the update script to add product prefixes:')
console.log('   npx tsx scripts/update-angled-shot-display-names.ts --dry-run')
console.log('   npx tsx scripts/update-angled-shot-display-names.ts\n')
console.log('━'.repeat(70))
