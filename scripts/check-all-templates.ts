import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

async function check() {
  const { data: temps } = await supabase
    .from('templates')
    .select('id, name, format, template_data')
    .eq('category_id', CATEGORY_ID)
    .order('format')

  console.log('All templates for Gummy Bear:\n')
  temps?.forEach((t, i) => {
    const zones = t.template_data?.safe_zones || []
    console.log(`${i+1}. ${t.format} - ${t.name}`)
    console.log(`   ID: ${t.id}`)
    console.log(`   Safe Zones: ${zones.length}`)
    if (zones.length > 0) {
      zones.forEach((z: any, idx: number) => {
        console.log(`   ${idx+1}. ${z.name}: (${z.x}, ${z.y}) ${z.width}x${z.height}`)
      })
    }
    console.log('')
  })
}

check().then(() => process.exit(0))
