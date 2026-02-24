import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

console.log('🔧 Fixing angled shot URLs to use thumbnail API...\n')

// Get all angled shots for the category
const { data: shots, error } = await supabase
  .from('angled_shots')
  .select('id, format, gdrive_file_id, storage_url')
  .eq('category_id', categoryId)

if (error) {
  console.error('Error fetching angled shots:', error)
  process.exit(1)
}

console.log(`Found ${shots.length} angled shots\n`)

let updated = 0

for (const shot of shots) {
  if (!shot.gdrive_file_id) {
    console.log(`⚠️  Skipping ${shot.id} - no gdrive_file_id`)
    continue
  }

  // Generate correct thumbnail URL
  const correctUrl = `https://drive.google.com/thumbnail?id=${shot.gdrive_file_id}&sz=w2000`

  // Only update if URL is different
  if (shot.storage_url !== correctUrl) {
    const { error: updateError } = await supabase
      .from('angled_shots')
      .update({ storage_url: correctUrl })
      .eq('id', shot.id)

    if (updateError) {
      console.error(`   ❌ Failed to update ${shot.id}:`, updateError.message)
    } else {
      console.log(`   ✅ Updated ${shot.format} - ${shot.id}`)
      updated++
    }
  }
}

console.log(`\n✅ Updated ${updated} angled shot URLs`)
