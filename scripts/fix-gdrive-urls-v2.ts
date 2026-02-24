import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fixUrls(dryRun: boolean = false) {
  console.log('🔧 Fixing Google Drive URLs to use thumbnail API\n')

  const { data: shots, error } = await supabase
    .from('angled_shots')
    .select('id, storage_url, gdrive_file_id')
    .eq('storage_provider', 'gdrive')

  if (error || !shots) {
    console.error('Error:', error)
    return
  }

  console.log(`📊 Found ${shots.length} records\n`)

  let updated = 0

  for (const shot of shots) {
    if (!shot.gdrive_file_id) continue

    const newUrl = `https://drive.google.com/thumbnail?id=${shot.gdrive_file_id}&sz=w2000`

    if (shot.storage_url === newUrl) continue

    console.log(`📝 ${shot.id.substring(0, 8)}... -> thumbnail API`)

    if (!dryRun) {
      await supabase.from('angled_shots').update({ storage_url: newUrl }).eq('id', shot.id)
      updated++
    } else {
      updated++
    }
  }

  console.log(`\n✅ ${dryRun ? 'Would update' : 'Updated'}: ${updated} records`)
  if (!dryRun) console.log('\n🔄 Restart dev server and hard refresh browser!')
}

fixUrls(process.argv.includes('--dry-run')).then(() => process.exit(0))
