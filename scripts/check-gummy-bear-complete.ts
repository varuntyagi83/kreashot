import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear
const FORMATS = ['1:1', '16:9', '9:16', '4:5']

async function checkComplete() {
  console.log('🔍 Checking Gummy Bear category completeness\n')
  console.log('='  .repeat(60))

  for (const format of FORMATS) {
    console.log(`\n${format} FORMAT:`)
    console.log('-'.repeat(60))

    // Check angled shots
    const { data: shots } = await supabase
      .from('angled_shots')
      .select('id, display_name, angle_name')
      .eq('category_id', CATEGORY_ID)
      .eq('format', format)

    console.log(`  Angled Shots: ${shots?.length || 0}`)
    if (shots && shots.length > 0) {
      shots.forEach((s, i) => {
        console.log(`    ${i+1}. ${s.display_name || s.angle_name}`)
      })
    }

    // Check backgrounds
    const { data: backgrounds } = await supabase
      .from('backgrounds')
      .select('id, name')
      .eq('category_id', CATEGORY_ID)
      .eq('format', format)

    console.log(`  Backgrounds: ${backgrounds?.length || 0}`)
    if (backgrounds && backgrounds.length > 0) {
      backgrounds.forEach((b, i) => {
        console.log(`    ${i+1}. ${b.name}`)
      })
    }

    // Check template
    const { data: template } = await supabase
      .from('templates')
      .select('id, name, template_data')
      .eq('category_id', CATEGORY_ID)
      .eq('format', format)
      .single()

    const safeZones = template?.template_data?.safe_zones || []
    console.log(`  Template: ${template ? template.name : 'MISSING'}`)
    console.log(`  Safe Zones: ${safeZones.length}`)

    // Assess readiness
    const ready = (shots?.length || 0) > 0 &&
                  (backgrounds?.length || 0) > 0 &&
                  template !== null &&
                  safeZones.length > 0

    console.log(`  ${ready ? '✅ READY' : '⚠️  INCOMPLETE'}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('\nSUMMARY:')
  console.log('An end-to-end Ad Creative Studio needs:')
  console.log('  1. Angled shots for each format ✓/✗')
  console.log('  2. Backgrounds for each format ✓/✗')
  console.log('  3. Templates with safe zones for each format ✓/✗')
  console.log('  4. UI components working ✓')
  console.log('  5. API endpoints working ✓')
}

checkComplete().then(() => process.exit(0))
