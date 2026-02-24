import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
const PRODUCT_ID = '00d3f3b1-9da5-44ac-b5b1-fcbd50039273' // Vitamin C Gummies

async function findShots() {
  console.log('🔍 Searching for Vitamin C Gummies 16:9 angled shots\n')

  // First, check product images
  const { data: productImages } = await supabase
    .from('product_images')
    .select('id, name, slug')
    .eq('product_id', PRODUCT_ID)

  console.log(`Product Images: ${productImages?.length || 0}`)
  productImages?.forEach((img, i) => {
    console.log(`  ${i+1}. ${img.name} (@${img.slug})`)
    console.log(`     ID: ${img.id}`)
  })
  console.log('')

  // Now check angled shots linked to these product images
  if (productImages && productImages.length > 0) {
    for (const img of productImages) {
      const { data: shots } = await supabase
        .from('angled_shots')
        .select('id, name, angle_name, format, width, height, storage_url')
        .eq('product_image_id', img.id)

      if (shots && shots.length > 0) {
        console.log(`Angled Shots for "${img.name}":`)
        shots.forEach((shot, i) => {
          console.log(`  ${i+1}. ${shot.format} - ${shot.angle_name} (${shot.width}x${shot.height})`)
          console.log(`     ID: ${shot.id}`)
        })
        console.log('')
      }
    }
  }

  // Also search directly in category for 16:9
  const { data: all16x9 } = await supabase
    .from('angled_shots')
    .select('id, name, angle_name, format, width, height, product_id, product_image_id')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')

  console.log(`\nAll 16:9 angled shots in Gummy Bear category: ${all16x9?.length || 0}`)
  all16x9?.forEach((shot, i) => {
    console.log(`  ${i+1}. ${shot.angle_name} - ${shot.width}x${shot.height}`)
    console.log(`     ID: ${shot.id}`)
    console.log(`     Product ID: ${shot.product_id}`)
    console.log(`     Product Image ID: ${shot.product_image_id}`)
  })
}

findShots().then(() => process.exit(0))
