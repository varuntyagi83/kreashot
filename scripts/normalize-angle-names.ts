/**
 * Script to normalize inconsistent angle names in the database
 *
 * This script:
 * 1. Fetches all angled_shots from the database
 * 2. Normalizes angle names to match ANGLE_VARIATIONS standards
 * 3. Updates the database with corrected names
 *
 * Run with: npx tsx scripts/normalize-angle-names.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Standard angle names from angle-variations.ts
const VALID_ANGLE_NAMES = [
  'front',
  'left_30deg',
  'right_30deg',
  'top_45deg',
  'three_quarter_left',
  'three_quarter_right',
  'isometric',
] as const

type ValidAngleName = typeof VALID_ANGLE_NAMES[number]

/**
 * Mapping of incorrect/non-standard names to correct standard names
 */
const ANGLE_NAME_MAPPING: Record<string, ValidAngleName> = {
  // Abbreviated names
  'left': 'left_30deg',
  'right': 'right_30deg',
  'top': 'top_45deg',

  // Custom names
  'left_side': 'three_quarter_left',
  'right_side': 'three_quarter_right',
  'left side': 'three_quarter_left',
  'right side': 'three_quarter_right',

  // Ambiguous "three" - defaulting to three_quarter_left
  // (manual review recommended for these)
  'three': 'three_quarter_left',

  // Variations in casing/formatting
  'front view': 'front',
  'top view': 'top_45deg',
  'top 45deg': 'top_45deg',
  'top 45 deg': 'top_45deg',
  'isometric view': 'isometric',

  // Already correct (lowercase versions)
  'front': 'front',
  'left_30deg': 'left_30deg',
  'right_30deg': 'right_30deg',
  'top_45deg': 'top_45deg',
  'three_quarter_left': 'three_quarter_left',
  'three_quarter_right': 'three_quarter_right',
  'isometric': 'isometric',
}

interface AngledShot {
  id: string
  angle_name: string
  angle_description: string
  product_id: string
  category_id: string
  format: string
}

interface NormalizationResult {
  id: string
  oldName: string
  newName: string
  description: string
  format: string
  needsManualReview: boolean
}

/**
 * Normalize an angle name
 */
function normalizeAngleName(angleName: string): {
  normalized: ValidAngleName
  needsManualReview: boolean
} {
  const lowercase = angleName.toLowerCase().trim()

  // Check if we have a mapping
  if (lowercase in ANGLE_NAME_MAPPING) {
    const normalized = ANGLE_NAME_MAPPING[lowercase]
    const needsManualReview = lowercase === 'three' // Flag ambiguous cases
    return { normalized, needsManualReview }
  }

  // No mapping found - try fuzzy matching
  console.warn(`⚠️  No mapping found for angle name: "${angleName}"`)

  // Default to front as safest fallback
  return { normalized: 'front', needsManualReview: true }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')

  console.log('🔄 Starting angle name normalization...')
  console.log(`   Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE UPDATE'}`)
  console.log('')

  // Fetch all angled shots
  console.log('📊 Fetching all angled shots from database...')
  const { data: angledShots, error } = await supabase
    .from('angled_shots')
    .select('id, angle_name, angle_description, product_id, category_id, format')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching angled shots:', error)
    process.exit(1)
  }

  if (!angledShots || angledShots.length === 0) {
    console.log('ℹ️  No angled shots found in database')
    return
  }

  console.log(`   Found ${angledShots.length} angled shots`)
  console.log('')

  // Analyze and normalize
  const results: NormalizationResult[] = []
  const needsUpdate: Array<{ id: string; newName: ValidAngleName }> = []

  for (const shot of angledShots) {
    const { normalized, needsManualReview } = normalizeAngleName(shot.angle_name)

    results.push({
      id: shot.id,
      oldName: shot.angle_name,
      newName: normalized,
      description: shot.angle_description,
      format: shot.format,
      needsManualReview,
    })

    // Only update if the name actually changed
    if (shot.angle_name !== normalized) {
      needsUpdate.push({ id: shot.id, newName: normalized })
    }
  }

  // Print summary
  console.log('📋 Normalization Summary:')
  console.log('─'.repeat(80))

  const byFormat = results.reduce((acc, r) => {
    if (!acc[r.format]) acc[r.format] = []
    acc[r.format].push(r)
    return acc
  }, {} as Record<string, NormalizationResult[]>)

  for (const [format, shots] of Object.entries(byFormat)) {
    console.log(`\n${format} format (${shots.length} shots):`)

    // Group by old name
    const byOldName = shots.reduce((acc, s) => {
      if (!acc[s.oldName]) acc[s.oldName] = []
      acc[s.oldName].push(s)
      return acc
    }, {} as Record<string, NormalizationResult[]>)

    for (const [oldName, items] of Object.entries(byOldName)) {
      const newName = items[0].newName
      const count = items.length
      const needsReview = items.some(i => i.needsManualReview)
      const status = oldName === newName ? '✓' : '→'
      const reviewFlag = needsReview ? ' ⚠️  REVIEW' : ''

      console.log(`   ${status} "${oldName}" → "${newName}" (${count} shot${count > 1 ? 's' : ''})${reviewFlag}`)
    }
  }

  console.log('')
  console.log('─'.repeat(80))
  console.log(`Total: ${results.length} shots`)
  console.log(`   ${results.filter(r => r.oldName === r.newName).length} already correct`)
  console.log(`   ${needsUpdate.length} need updating`)
  console.log(`   ${results.filter(r => r.needsManualReview).length} need manual review`)
  console.log('')

  // Show items needing manual review
  const reviewItems = results.filter(r => r.needsManualReview)
  if (reviewItems.length > 0) {
    console.log('⚠️  Items needing manual review:')
    for (const item of reviewItems) {
      console.log(`   - ID: ${item.id}`)
      console.log(`     Old: "${item.oldName}" → New: "${item.newName}"`)
      console.log(`     Description: ${item.description}`)
      console.log(`     Format: ${item.format}`)
      console.log('')
    }
  }

  // Update database
  if (needsUpdate.length === 0) {
    console.log('✅ All angle names are already correct!')
    return
  }

  if (isDryRun) {
    console.log('🔍 DRY RUN - No changes made to database')
    console.log('   Run without --dry-run to apply changes')
    return
  }

  console.log('💾 Updating database...')
  let successCount = 0
  let errorCount = 0

  for (const { id, newName } of needsUpdate) {
    const { error } = await supabase
      .from('angled_shots')
      .update({ angle_name: newName })
      .eq('id', id)

    if (error) {
      console.error(`   ❌ Failed to update ${id}:`, error.message)
      errorCount++
    } else {
      successCount++
    }
  }

  console.log('')
  console.log('─'.repeat(80))
  console.log(`✅ Update complete!`)
  console.log(`   ${successCount} records updated successfully`)
  if (errorCount > 0) {
    console.log(`   ${errorCount} records failed to update`)
  }
  console.log('')
  console.log('🔄 Next steps:')
  console.log('   1. Refresh your UI to see the updated angle names')
  console.log('   2. Review items marked for manual review (if any)')
  console.log('   3. Test that filtering and display work correctly')
}

// Run the script
main()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
