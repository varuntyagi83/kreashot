import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear

async function checkAssets() {
  console.log('🐻 Gummy Bear Category - 16:9 Assets Check\n')

  // Check for 16:9 angled shots
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, name, angle_name, format, width, height, storage_url')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')

  console.log(`16:9 Angled Shots: ${shots?.length || 0}`)
  shots?.forEach((shot, i) => {
    console.log(`  ${i+1}. ${shot.name} - ${shot.angle_name}`)
    console.log(`     ${shot.width}x${shot.height}`)
    console.log(`     ID: ${shot.id}`)
  })
  console.log('')

  // Check for 16:9 backgrounds
  const { data: backgrounds } = await supabase
    .from('backgrounds')
    .select('id, name, format, width, height, storage_url')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')

  console.log(`16:9 Backgrounds: ${backgrounds?.length || 0}`)
  backgrounds?.forEach((bg, i) => {
    console.log(`  ${i+1}. ${bg.name}`)
    console.log(`     ${bg.width}x${bg.height}`)
    console.log(`     ID: ${bg.id}`)
  })
  console.log('')

  // Check for 16:9 template
  const { data: template } = await supabase
    .from('templates')
    .select('id, name, format, template_data')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')
    .single()

  if (template) {
    console.log(`✅ 16:9 Template: ${template.name}`)
    console.log(`   ID: ${template.id}`)
    const safeZones = template.template_data?.safe_zones || []
    console.log(`   Safe Zones: ${safeZones.length}`)
    safeZones.forEach((zone: any, i: number) => {
      console.log(`   ${i+1}. ${zone.name}:`)
      console.log(`      Position: (${zone.x}, ${zone.y})`)
      console.log(`      Size: ${zone.width} x ${zone.height}`)
    })
  } else {
    console.log('❌ No 16:9 template found')
  }

  console.log('')
  console.log('═'.repeat(60))
  if (shots && shots.length > 0 && backgrounds && backgrounds.length > 0) {
    console.log('✅ Ready to generate composite!')
    console.log(`Category ID: ${CATEGORY_ID}`)
    console.log(`Angled Shot: ${shots[0].id}`)
    console.log(`Background: ${backgrounds[0].id}`)
    console.log(`Template: ${template?.id || 'N/A'}`)
  } else {
    console.log('❌ Missing required assets for composite generation')
    if (!shots || shots.length === 0) console.log('   - Need 16:9 angled shots')
    if (!backgrounds || backgrounds.length === 0) console.log('   - Need 16:9 backgrounds')
  }
}

checkAssets().then(() => process.exit(0))
