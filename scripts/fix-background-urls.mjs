import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

console.log('🔧 Fixing background URLs to use thumbnail API...\n')

// Get all backgrounds for the category
const { data: backgrounds, error } = await supabase
  .from('backgrounds')
  .select('id, format, gdrive_file_id, storage_url')
  .eq('category_id', categoryId)

if (error) {
  console.error('Error fetching backgrounds:', error)
  process.exit(1)
}

console.log(`Found ${backgrounds.length} backgrounds\n`)

let updated = 0

for (const bg of backgrounds) {
  if (!bg.gdrive_file_id) {
    console.log(`⚠️  Skipping ${bg.id} - no gdrive_file_id`)
    continue
  }

  // Generate correct thumbnail URL
  const correctUrl = `https://drive.google.com/thumbnail?id=${bg.gdrive_file_id}&sz=w2000`

  // Only update if URL is different
  if (bg.storage_url !== correctUrl) {
    const { error: updateError } = await supabase
      .from('backgrounds')
      .update({ storage_url: correctUrl })
      .eq('id', bg.id)

    if (updateError) {
      console.error(`   ❌ Failed to update ${bg.id}:`, updateError.message)
    } else {
      console.log(`   ✅ Updated ${bg.format} - ${bg.id}`)
      updated++
    }
  }
}

console.log(`\n✅ Updated ${updated} background URLs`)
