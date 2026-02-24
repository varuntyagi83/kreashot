import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

// Get one angled shot from each format
for (const format of ['1:1', '16:9', '9:16', '4:5']) {
  const { data, error } = await supabase
    .from('angled_shots')
    .select('id, angle_name, format, storage_provider, storage_url, storage_path, gdrive_file_id')
    .eq('category_id', categoryId)
    .eq('format', format)
    .limit(1)
    .single()

  if (error) {
    console.log(`\n${format}: Error -`, error.message)
  } else {
    console.log(`\n${format}:`)
    console.log('  Angle:', data.angle_name)
    console.log('  Provider:', data.storage_provider)
    console.log('  GDrive ID:', data.gdrive_file_id || 'N/A')
    console.log('  Storage URL:', data.storage_url ? data.storage_url.substring(0, 100) + '...' : 'N/A')
    console.log('  Storage Path:', data.storage_path)
  }
}
