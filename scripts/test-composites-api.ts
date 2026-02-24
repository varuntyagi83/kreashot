#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testAPI() {
  const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

  console.log('Testing composites API response format...\n')

  const { data: composites, error } = await supabase
    .from('composites')
    .select(`
      *,
      angled_shot:angled_shot_id (
        id,
        angle_name,
        angle_description
      ),
      background:background_id (
        id,
        name,
        description
      )
    `)
    .eq('category_id', categoryId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log(`Found ${composites?.length || 0} composites\n`)

  if (composites && composites.length > 0) {
    console.log('First composite structure:')
    console.log(JSON.stringify(composites[0], null, 2))

    console.log('\n\nChecking all composites:')
    composites.forEach((comp: any, idx) => {
      console.log(`\n${idx + 1}. ${comp.name}`)
      console.log(`   angled_shot:`, comp.angled_shot)
      console.log(`   background:`, comp.background)
      console.log(`   storage_url:`, comp.storage_url)
    })
  }
}

testAPI()
