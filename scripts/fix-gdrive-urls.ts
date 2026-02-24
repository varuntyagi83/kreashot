/**
 * Script to fix Google Drive URLs in database
 *
 * Converts temporary thumbnailLink URLs to permanent public URLs
 * Uses the gdrive_file_id to generate proper public URLs
 *
 * Usage:
 *   npx tsx scripts/fix-gdrive-urls.ts --dry-run
 *   npx tsx scripts/fix-gdrive-urls.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixGdriveUrls(dryRun: boolean = false) {
  console.log('🔧 Fixing Google Drive URLs in angled_shots\n')

  // Fetch all angled shots with Google Drive storage
  const { data: angledShots, error } = await supabase
    .from('angled_shots')
    .select('id, storage_provider, storage_url, gdrive_file_id')
    .eq('storage_provider', 'gdrive')

  if (error) {
    console.error('❌ Error fetching records:', error)
    process.exit(1)
  }

  if (!angledShots || angledShots.length === 0) {
    console.log('✅ No Google Drive records found')
    return
  }

  console.log(`📊 Found ${angledShots.length} Google Drive angled shot(s)\n`)

  let updatedCount = 0
  let skippedCount = 0

  for (const shot of angledShots) {
    if (!shot.gdrive_file_id) {
      console.log(`⚠️  SKIP: ID ${shot.id} - No gdrive_file_id`)
      skippedCount++
      continue
    }

    // Generate permanent public URL
    const newUrl = `https://drive.google.com/uc?export=view&id=${shot.gdrive_file_id}`

    // Check if URL needs updating
    if (shot.storage_url === newUrl) {
      console.log(`⏭️  SKIP: ID ${shot.id} - URL already correct`)
      skippedCount++
      continue
    }

    console.log(`📝 UPDATE: ID ${shot.id.substring(0, 8)}...`)
    console.log(`   Old URL: ${shot.storage_url?.substring(0, 60)}...`)
    console.log(`   New URL: ${newUrl}`)

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('angled_shots')
        .update({ storage_url: newUrl })
        .eq('id', shot.id)

      if (updateError) {
        console.log(`   ❌ Error: ${updateError.message}`)
      } else {
        console.log(`   ✅ Updated`)
        updatedCount++
      }
    } else {
      console.log(`   🔍 DRY RUN - Would update`)
      updatedCount++
    }
    console.log()
  }

  // Summary
  console.log('═'.repeat(70))
  console.log('📊 SUMMARY')
  console.log('═'.repeat(70))
  console.log(`Total Records:     ${angledShots.length}`)
  console.log(`${dryRun ? 'Would Update' : 'Updated'}:      ${updatedCount}`)
  console.log(`Skipped:           ${skippedCount}`)
  console.log('═'.repeat(70))

  if (dryRun) {
    console.log('\n💡 This was a DRY RUN. Run without --dry-run to apply changes.')
  } else {
    console.log('\n✅ Google Drive URLs fixed successfully!')
    console.log('\n🔄 Next: Restart your dev server to see the images load')
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n')
}

fixGdriveUrls(isDryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
