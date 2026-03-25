#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await supabase
    .from('angled_shots')
    .select('id, display_name, storage_provider, gdrive_file_id, storage_url, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) { console.error(error); return }

  console.log(`Total rows returned: ${data?.length}\n`)
  for (const s of data || []) {
    const proxy = s.gdrive_file_id ? 'image-proxy→Drive' : 'direct GCS'
    console.log(`[${s.storage_provider}] ${proxy}`)
    console.log(`  display: ${(s.display_name || s.id).slice(0, 50)}`)
    console.log(`  url: ${(s.storage_url || '').slice(0, 100)}`)
    console.log()
  }
}

main().catch(console.error)
