/**
 * Migration Script: Update Angled Shot Display Names with Product Prefix
 *
 * This script updates all angled_shots records to include the product name
 * in their display_name field.
 *
 * Example:
 *   Before: display_name = "Front"
 *   After:  display_name = "Nike Air Max_Front"
 *
 * Usage:
 *   npx tsx scripts/update-angled-shot-display-names.ts
 *   npx tsx scripts/update-angled-shot-display-names.ts --dry-run
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

// Helper function to format angle name for display
function formatAngleNameForDisplay(angleName: string): string {
  const displayNames: Record<string, string> = {
    'front': 'Front',
    'left_30deg': 'Left 30deg',
    'right_30deg': 'Right 30deg',
    'top_45deg': 'Top 45deg',
    'three_quarter_left': 'Three Quarter Left',
    'three_quarter_right': 'Three Quarter Right',
    'isometric': 'Isometric',
  }

  return displayNames[angleName] || angleName
}

async function updateDisplayNames(dryRun: boolean = false) {
  console.log('🔍 Fetching angled shots...\n')

  // Fetch all angled shots with their product information
  const { data: angledShots, error } = await supabase
    .from('angled_shots')
    .select(`
      id,
      angle_name,
      display_name,
      product:products!inner(id, name)
    `)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ Error fetching angled shots:', error)
    process.exit(1)
  }

  if (!angledShots || angledShots.length === 0) {
    console.log('✅ No angled shots found to update')
    return
  }

  console.log(`📊 Found ${angledShots.length} angled shot(s) to process\n`)

  let updatedCount = 0
  let skippedCount = 0

  for (const shot of angledShots) {
    const productName = (shot.product as any).name
    const angleDisplay = formatAngleNameForDisplay(shot.angle_name)
    const newDisplayName = `${productName}_${angleDisplay}`

    // Check if update is needed
    if (shot.display_name === newDisplayName) {
      console.log(`⏭️  SKIP: ID ${shot.id} - Already correct: "${newDisplayName}"`)
      skippedCount++
      continue
    }

    console.log(`📝 UPDATE: ID ${shot.id}`)
    console.log(`   Product: ${productName}`)
    console.log(`   Angle: ${shot.angle_name}`)
    console.log(`   Old Display Name: "${shot.display_name || '(null)'}"`)
    console.log(`   New Display Name: "${newDisplayName}"`)

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('angled_shots')
        .update({ display_name: newDisplayName })
        .eq('id', shot.id)

      if (updateError) {
        console.error(`   ❌ Error updating: ${updateError.message}`)
      } else {
        console.log(`   ✅ Updated successfully`)
        updatedCount++
      }
    } else {
      console.log(`   🔍 DRY RUN - Would update`)
      updatedCount++
    }
    console.log()
  }

  // Summary
  console.log('═'.repeat(60))
  console.log('📊 SUMMARY')
  console.log('═'.repeat(60))
  console.log(`Total Records:     ${angledShots.length}`)
  console.log(`${dryRun ? 'Would Update' : 'Updated'}:      ${updatedCount}`)
  console.log(`Skipped:           ${skippedCount}`)
  console.log('═'.repeat(60))

  if (dryRun) {
    console.log('\n💡 This was a DRY RUN. Run without --dry-run to apply changes.')
  } else {
    console.log('\n✅ Display names updated successfully!')
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n')
}

updateDisplayNames(isDryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
