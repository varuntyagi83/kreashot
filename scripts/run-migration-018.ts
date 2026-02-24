/**
 * Script to run migration 018: Add display_name to angled_shots
 *
 * This script checks if the display_name column exists and adds it if needed
 *
 * Usage:
 *   npx tsx scripts/run-migration-018.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL')
  console.error('   SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('🚀 Running Migration 018: Add display_name to angled_shots\n')

  try {
    // Check if display_name column already exists
    console.log('1️⃣ Checking if display_name column exists...')
    const { data: columns, error: checkError } = await supabase
      .from('angled_shots')
      .select('display_name')
      .limit(1)

    if (!checkError) {
      console.log('   ✅ display_name column already exists, skipping migration\n')
      console.log('📝 Next step: Run the display name update script')
      console.log('   npx tsx scripts/update-angled-shot-display-names.ts --dry-run')
      console.log('   npx tsx scripts/update-angled-shot-display-names.ts')
      return
    }

    console.log('   ⚠️  display_name column does not exist, needs to be added\n')
    console.log('━'.repeat(70))
    console.log('⚠️  MANUAL MIGRATION REQUIRED')
    console.log('━'.repeat(70))
    console.log('\nThe display_name column needs to be added to the angled_shots table.')
    console.log('Please run the following SQL in your Supabase SQL Editor:\n')
    console.log('─'.repeat(70))
    console.log(`
-- Add display_name column to angled_shots table
ALTER TABLE angled_shots
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add comment
COMMENT ON COLUMN angled_shots.display_name IS 'Display name with product prefix (e.g., "Product Name_Front")';

-- Update existing records to have display_name
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
    console.log('\nSteps:')
    console.log('1. Go to: https://supabase.com/dashboard/project/raedrrohryxpibmmhcjo/sql/new')
    console.log('2. Copy and paste the SQL above')
    console.log('3. Click "Run"')
    console.log('\n4. Then run the display name update script:')
    console.log('   npx tsx scripts/update-angled-shot-display-names.ts --dry-run')
    console.log('   npx tsx scripts/update-angled-shot-display-names.ts')
    console.log('━'.repeat(70))

  } catch (error) {
    console.error('❌ Error checking migration status:', error)
    process.exit(1)
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
