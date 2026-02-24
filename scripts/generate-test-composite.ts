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
const ANGLED_SHOT_ID = '6e465d97-f558-4cc6-9ad0-59aedba778da' // Front 16:9
const BACKGROUND_ID = '09238f49-3b8c-45ff-82ba-67e55a7ab3f5' // Colorful Bright 16:9

async function generateAndSaveComposite() {
  console.log('🎨 Generating 16:9 composite with template safe zones\n')

  // Step 1: Generate composite
  console.log('Step 1: Calling generate API...')
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
            angledShotId: ANGLED_SHOT_ID,
            backgroundId: BACKGROUND_ID,
          },
        ],
        userPrompt: 'Place the product prominently in the product safe zone',
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
  console.log(`   Image Size: ${composite.image_base64.length} characters\n`)

  // Step 2: Save composite to Google Drive
  console.log('Step 2: Saving to Google Drive...')
  const saveResponse = await fetch(
    `${baseUrl}/api/categories/${CATEGORY_ID}/composites`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Composite 16:9 - Front View',
        description: 'Test composite to verify template safe zones application',
        promptUsed: composite.prompt_used,
        imageData: composite.image_base64,
        mimeType: composite.image_mime_type,
        angledShotId: ANGLED_SHOT_ID,
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

  // Step 3: Verify in database
  console.log('Step 3: Verifying database record...')
  const { data: dbComposite } = await supabase
    .from('composites')
    .select('*')
    .eq('id', saveData.composite.id)
    .single()

  if (!dbComposite) {
    console.log('❌ Composite not found in database')
    return
  }

  console.log('📊 Composite Record:')
  console.log(`   ID: ${dbComposite.id}`)
  console.log(`   Name: ${dbComposite.name}`)
  console.log(`   Format: ${dbComposite.format}`)
  console.log(`   Dimensions: ${dbComposite.width}x${dbComposite.height}`)
  console.log(`   Storage Provider: ${dbComposite.storage_provider}`)
  console.log(`   Storage Path: ${dbComposite.storage_path}`)
  console.log(`   GDrive File ID: ${dbComposite.gdrive_file_id}`)
  console.log(`   Storage URL: ${dbComposite.storage_url}`)
  console.log('')

  // Step 4: Check template was used
  console.log('Step 4: Verifying template application...')
  const { data: template } = await supabase
    .from('templates')
    .select('template_data')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')
    .single()

  const safeZones = template?.template_data?.safe_zones || []
  console.log(`Template has ${safeZones.length} safe zones`)
  if (safeZones.length > 0) {
    console.log('✅ Template with safe zones was available during generation')
    console.log('\nSafe zones that should have been applied:')
    safeZones.forEach((zone: any, i: number) => {
      console.log(`   ${i+1}. ${zone.name}: (${zone.x}, ${zone.y}) ${zone.width}x${zone.height}`)
    })
  } else {
    console.log('⚠️  No safe zones in template')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ TEST COMPLETE')
  console.log('='.repeat(60))
  console.log(`\nComposite saved to: ${dbComposite.storage_path}`)
  console.log(`View in browser: ${dbComposite.storage_url}`)
}

generateAndSaveComposite().then(() => process.exit(0))
