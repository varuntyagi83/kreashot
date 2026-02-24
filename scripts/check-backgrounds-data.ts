import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkBackgrounds() {
  const { data, error } = await supabase
    .from('backgrounds')
    .select('id, name, storage_provider, storage_path, storage_url, gdrive_file_id, created_at')
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    console.log('Error:', error)
    return
  }

  console.log('\n🎨 Backgrounds in Database:\n')
  if (!data || data.length === 0) {
    console.log('   No backgrounds found.')
    return
  }

  data.forEach((bg, i) => {
    console.log(`${i + 1}. ${bg.name}`)
    console.log(`   Storage Provider: ${bg.storage_provider || '(none)'}`)
    console.log(`   Storage Path: ${bg.storage_path || '(empty)'}`)
    console.log(`   Storage URL: ${bg.storage_url || '(empty)'}`)
    console.log(`   GDrive File ID: ${bg.gdrive_file_id || '(empty)'}`)
    console.log(`   Created: ${new Date(bg.created_at).toLocaleString()}`)
    console.log('')
  })

  console.log(`Total: ${data.length} background(s)`)
  const withGDriveId = data.filter(d => d.gdrive_file_id).length
  console.log(`With Google Drive File ID: ${withGDriveId}/${data.length}`)
}

checkBackgrounds().then(() => process.exit(0))
