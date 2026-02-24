import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear

async function checkVitaminCGummies() {
  console.log('🔍 Searching for Vitamin C Gummies product\n')

  // Find product
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug')
    .eq('category_id', CATEGORY_ID)
    .ilike('name', '%vitamin%c%')
    .single()

  if (!product) {
    console.log('❌ Vitamin C Gummies product not found')
    console.log('\nAll products in Gummy Bear category:')
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, slug')
      .eq('category_id', CATEGORY_ID)
    allProducts?.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.name} (@${p.slug})`)
    })
    return
  }

  console.log(`✅ Product: ${product.name} (@${product.slug})`)
  console.log(`   ID: ${product.id}\n`)

  // Get all angled shots for this product
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, name, angle_name, format, width, height')
    .eq('product_id', product.id)
    .order('format', { ascending: true })

  console.log(`Angled Shots: ${shots?.length || 0}`)
  const formats = new Set(shots?.map(s => s.format))
  formats.forEach(format => {
    console.log(`\n  ${format} format:`)
    shots?.filter(s => s.format === format).forEach((shot, i) => {
      console.log(`    ${i+1}. ${shot.angle_name} - ${shot.width}x${shot.height}`)
      console.log(`       ID: ${shot.id}`)
    })
  })

  // Check for 16:9 specifically
  const shots16x9 = shots?.filter(s => s.format === '16:9')

  console.log('\n' + '═'.repeat(60))
  if (shots16x9 && shots16x9.length > 0) {
    console.log('✅ 16:9 angled shots available!')
    console.log(`   Product ID: ${product.id}`)
    console.log(`   Angled Shot ID: ${shots16x9[0].id}`)
  } else {
    console.log('❌ No 16:9 angled shots for Vitamin C Gummies')
    console.log('   Need to generate 16:9 angled shots first')
  }
}

checkVitaminCGummies().then(() => process.exit(0))
