import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkUrls() {
  const { data, error } = await supabase
    .from('angled_shots')
    .select('id, storage_provider, storage_url, storage_path, gdrive_file_id')
    .limit(3)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('📊 Sample angled_shots records:\n')
  data?.forEach((s: any) => {
    console.log('─'.repeat(70))
    console.log('ID:', s.id)
    console.log('Provider:', s.storage_provider)
    console.log('URL:', s.storage_url?.substring(0, 100))
    console.log('Path:', s.storage_path)
    console.log('Drive ID:', s.gdrive_file_id)
    console.log()
  })
}

checkUrls().then(() => process.exit(0))
