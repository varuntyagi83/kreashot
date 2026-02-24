#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function verify() {
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', 'gummy-bear')
    .single()

  if (!category) {
    console.log('\n❌ Gummy Bear category not found')
    return
  }

  const { data: composites, count } = await supabase
    .from('composites')
    .select(`
      id,
      name,
      slug,
      storage_path,
      angled_shots!inner(angle_name),
      backgrounds!inner(name)
    `, { count: 'exact' })
    .eq('category_id', category.id)
    .order('created_at', { ascending: true })

  console.log(`\n📊 Gummy Bear Composites in Database: ${count}\n`)
  composites?.forEach((comp, idx) => {
    console.log(`${idx + 1}. ${comp.slug}`)
    console.log(`   Angle: ${(comp.angled_shots as any).angle_name}`)
    console.log(`   Storage: ${comp.storage_path}\n`)
  })
}

verify()
