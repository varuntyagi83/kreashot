import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function listCategories() {
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug')
    .order('created_at', { ascending: false })

  console.log('Available categories:')
  data?.forEach((cat, i) => {
    console.log(`  ${i+1}. ${cat.name} (@${cat.slug}) - ID: ${cat.id}`)
  })
}

listCategories().then(() => process.exit(0))
