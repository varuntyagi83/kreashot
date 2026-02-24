import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import fetch from 'node-fetch'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear
const BACKGROUND_ID = '09238f49-3b8c-45ff-82ba-67e55a7ab3f5' // Colorful Bright 16:9

async function createComposite() {
  console.log('🎨 Creating 16:9 composite with Three Quarter Left view\n')

  // Step 1: Find the three-quarter left angled shot for 16:9
  console.log('Step 1: Finding three-quarter left angled shot...')
  const { data: angledShots } = await supabase
    .from('angled_shots')
    .select('id, display_name, angle_name, format')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')
    .ilike('angle_name', '%three%quarter%left%')

  if (!angledShots || angledShots.length === 0) {
    console.log('❌ No three-quarter left angled shot found for 16:9')
    console.log('\nSearching for any angled shots with "left" in the name...')

    const { data: leftShots } = await supabase
      .from('angled_shots')
      .select('id, display_name, angle_name, format')
      .eq('category_id', CATEGORY_ID)
      .eq('format', '16:9')

    console.log(`Found ${leftShots?.length || 0} 16:9 angled shots:`)
    leftShots?.forEach((shot, i) => {
      console.log(`  ${i+1}. ${shot.display_name} (${shot.angle_name}) - ID: ${shot.id}`)
    })
    return
  }

  const angledShot = angledShots[0]
  console.log(`✅ Found: ${angledShot.display_name} (${angledShot.angle_name})`)
  console.log(`   ID: ${angledShot.id}\n`)

  // Step 2: Verify template
  console.log('Step 2: Checking template...')
  const { data: template } = await supabase
    .from('templates')
    .select('id, name, template_data')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')
    .single()

  const safeZones = template?.template_data?.safe_zones || []
  console.log(`✅ Template: ${template?.name}`)
  console.log(`   Safe Zones: ${safeZones.length}\n`)

  // Step 3: Generate composite
  console.log('Step 3: Generating composite via API...')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const generateResponse = await fetch(
    `${baseUrl}/api/categories/${CATEGORY_ID}/composites/generate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'selected',
        format: '16:9',
        pairs: [
          {
            angledShotId: angledShot.id,
            backgroundId: BACKGROUND_ID,
          },
        ],
        userPrompt: 'Place the product prominently in the product safe zone, ensuring the gummy bottle is clearly visible and well-positioned according to template guidelines',
      }),
    }
  )

  if (!generateResponse.ok) {
    const error = await generateResponse.json()
    console.error('❌ Generate failed:', error)
    return
  }

  const generateData = await generateResponse.json()
  console.log(`✅ Generated ${generateData.results.length} composite(s)\n`)

  if (generateData.results.length === 0) {
    console.log('❌ No composites generated')
    return
  }

  const composite = generateData.results[0]
  console.log('Generated Composite:')
  console.log(`   Angled Shot: ${composite.angledShotName}`)
  console.log(`   Background: ${composite.backgroundName}`)
  console.log(`   Image Size: ${composite.image_base64.length} characters`)
  console.log(`   Prompt Used: ${composite.prompt_used}\n`)

  // Step 4: Save to Google Drive
  console.log('Step 4: Saving to Google Drive...')
  const saveResponse = await fetch(
    `${baseUrl}/api/categories/${CATEGORY_ID}/composites`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Composite 16:9 - Three Quarter Left',
        description: 'Test composite to verify template safe zones with three-quarter left view',
        promptUsed: composite.prompt_used,
        imageData: composite.image_base64,
        mimeType: composite.image_mime_type,
        angledShotId: angledShot.id,
        backgroundId: BACKGROUND_ID,
        format: '16:9',
      }),
    }
  )

  if (!saveResponse.ok) {
    const error = await saveResponse.json()
    console.error('❌ Save failed:', error)
    return
  }

  const saveData = await saveResponse.json()
  console.log('✅ Composite saved successfully!\n')

  // Step 5: Verify in database
  console.log('Step 5: Verifying in database...')
  const { data: dbComposite } = await supabase
    .from('composites')
    .select('*')
    .eq('id', saveData.composite.id)
    .single()

  if (!dbComposite) {
    console.log('❌ Composite not found in database')
    return
  }

  console.log('\n' + '='.repeat(70))
  console.log('✅ COMPOSITE CREATED SUCCESSFULLY')
  console.log('='.repeat(70))
  console.log('\n📊 Composite Details:')
  console.log(`   ID: ${dbComposite.id}`)
  console.log(`   Name: ${dbComposite.name}`)
  console.log(`   Format: ${dbComposite.format}`)
  console.log(`   Dimensions: ${dbComposite.width}x${dbComposite.height}`)
  console.log(`   Storage Provider: ${dbComposite.storage_provider}`)
  console.log(`   Storage Path: ${dbComposite.storage_path}`)
  console.log(`   GDrive File ID: ${dbComposite.gdrive_file_id}`)
  console.log(`\n🔗 View URL: ${dbComposite.storage_url}`)
  console.log('\n📝 Template Safe Zones Applied:')
  safeZones.forEach((zone: any, i: number) => {
    console.log(`   ${i+1}. ${zone.name}: (${zone.x}, ${zone.y}) ${zone.width}x${zone.height}`)
  })
  console.log('\n' + '='.repeat(70))
  console.log('✅ You can now view the composite in Google Drive')
  console.log('='.repeat(70))
}

createComposite().then(() => process.exit(0))
