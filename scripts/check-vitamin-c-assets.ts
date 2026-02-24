import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkAssets() {
  // Find Vitamin C category
  const { data: category } = await supabase
    .from('categories')
    .select('id, name, slug')
    .ilike('name', '%vitamin%c%')
    .single()

  if (!category) {
    console.log('❌ Vitamin C category not found')
    return
  }

  console.log(`✅ Category: ${category.name} (ID: ${category.id})`)
  console.log('')

  // Check for 16:9 angled shots
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, name, angle_name, format, width, height')
    .eq('category_id', category.id)
    .eq('format', '16:9')

  console.log(`16:9 Angled Shots: ${shots?.length || 0}`)
  shots?.forEach((shot, i) => {
    console.log(`  ${i+1}. ${shot.name} - ${shot.angle_name} (${shot.width}x${shot.height})`)
  })
  console.log('')

  // Check for 16:9 backgrounds
  const { data: backgrounds } = await supabase
    .from('backgrounds')
    .select('id, name, format, width, height')
    .eq('category_id', category.id)
    .eq('format', '16:9')

  console.log(`16:9 Backgrounds: ${backgrounds?.length || 0}`)
  backgrounds?.forEach((bg, i) => {
    console.log(`  ${i+1}. ${bg.name} (${bg.width}x${bg.height})`)
  })
  console.log('')

  // Check for 16:9 template
  const { data: template } = await supabase
    .from('templates')
    .select('id, name, format, template_data')
    .eq('category_id', category.id)
    .eq('format', '16:9')
    .single()

  if (template) {
    console.log(`✅ 16:9 Template: ${template.name}`)
    const safeZones = template.template_data?.safe_zones || []
    console.log(`   Safe Zones: ${safeZones.length}`)
    safeZones.forEach((zone: any, i: number) => {
      console.log(`   ${i+1}. ${zone.name}: x=${zone.x}, y=${zone.y}, w=${zone.width}, h=${zone.height}`)
    })
  } else {
    console.log('❌ No 16:9 template found')
  }

  console.log('')
  console.log('Export for composite generation:')
  if (shots && shots.length > 0 && backgrounds && backgrounds.length > 0) {
    console.log(`  Category ID: ${category.id}`)
    console.log(`  Angled Shot ID: ${shots[0].id}`)
    console.log(`  Background ID: ${backgrounds[0].id}`)
  }
}

checkAssets().then(() => process.exit(0))
