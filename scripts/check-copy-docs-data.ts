import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkCopyDocs() {
  const { data, error } = await supabase
    .from('copy_docs')
    .select('id, storage_provider, storage_path, storage_url, gdrive_file_id, created_at, copy_type, generated_text')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.log('Error:', error)
    return
  }

  console.log('\n📝 Copy Docs in Database:\n')
  if (!data || data.length === 0) {
    console.log('   No copy docs found.')
    return
  }

  data.forEach((doc, i) => {
    console.log(`${i + 1}. ${doc.copy_type?.toUpperCase() || 'COPY'}`)
    console.log(`   Text: "${doc.generated_text?.substring(0, 50)}..."`)
    console.log(`   Storage Provider: ${doc.storage_provider || '(none)'}`)
    console.log(`   Storage Path: ${doc.storage_path || '(empty)'}`)
    console.log(`   Storage URL: ${doc.storage_url ? doc.storage_url.substring(0, 60) + '...' : '(empty)'}`)
    console.log(`   GDrive File ID: ${doc.gdrive_file_id || '(empty)'}`)
    console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`)
    console.log('')
  })

  console.log(`Total: ${data.length} copy doc(s)`)
  const withGDriveId = data.filter(d => d.gdrive_file_id).length
  console.log(`With Google Drive File ID: ${withGDriveId}/${data.length}`)

  const withStorageFields = data.filter(d => d.storage_provider && d.storage_path && d.storage_url).length
  console.log(`With All Storage Fields: ${withStorageFields}/${data.length}`)
}

checkCopyDocs().then(() => process.exit(0))
