import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { generateComposite } from '../src/lib/ai/gemini'
import { uploadFile } from '../src/lib/storage'
import { google } from 'googleapis'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear
const BACKGROUND_ID = '09238f49-3b8c-45ff-82ba-67e55a7ab3f5' // Colorful Bright 16:9

async function createCompositeDirect() {
  console.log('🎨 Creating 16:9 composite with Three Quarter Left view\n')
  console.log('='  .repeat(70))

  // Step 1: Find the three-quarter left angled shot for 16:9
  console.log('\n📍 Step 1: Finding angled shot...')
  const { data: angledShots } = await supabase
    .from('angled_shots')
    .select('*')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')
    .ilike('angle_name', '%three%quarter%left%')

  if (!angledShots || angledShots.length === 0) {
    console.log('❌ No three-quarter left angled shot found')
    return
  }

  const angledShot = angledShots[0]
  console.log(`✅ Found: ${angledShot.display_name}`)
  console.log(`   Angle: ${angledShot.angle_name}`)
  console.log(`   ID: ${angledShot.id}`)
  console.log(`   Storage URL: ${angledShot.storage_url}`)

  // Step 2: Get background
  console.log('\n🎨 Step 2: Getting background...')
  const { data: background } = await supabase
    .from('backgrounds')
    .select('*')
    .eq('id', BACKGROUND_ID)
    .single()

  if (!background) {
    console.log('❌ Background not found')
    return
  }

  console.log(`✅ Found: ${background.name}`)
  console.log(`   Storage URL: ${background.storage_url}`)

  // Step 3: Get category and template
  console.log('\n📋 Step 3: Getting category and template...')
  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('id', CATEGORY_ID)
    .single()

  const { data: template } = await supabase
    .from('templates')
    .select('*')
    .eq('category_id', CATEGORY_ID)
    .eq('format', '16:9')
    .single()

  const safeZones = template?.template_data?.safe_zones || []
  console.log(`✅ Category: ${category?.name}`)
  console.log(`✅ Template: ${template?.name} with ${safeZones.length} safe zones`)

  // Step 4: Download images from Google Drive using API
  console.log('\n📥 Step 4: Fetching images from Google Drive API...')

  // Initialize Google Drive API
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  const drive = google.drive({ version: 'v3', auth })

  console.log(`   Downloading angled shot: ${angledShot.gdrive_file_id}`)
  const angledShotResponse = await drive.files.get(
    {
      fileId: angledShot.gdrive_file_id,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'arraybuffer' }
  )
  const angledShotBuffer = Buffer.from(angledShotResponse.data as ArrayBuffer)
  const angledShotMimeType = 'image/jpeg'
  const angledShotBase64 = angledShotBuffer.toString('base64')

  console.log(`   Downloaded: ${angledShotBuffer.length} bytes`)
  console.log(`   First bytes: ${angledShotBuffer.toString('hex').substring(0, 20)}`)

  console.log(`   Downloading background: ${background.gdrive_file_id}`)
  const backgroundResponse = await drive.files.get(
    {
      fileId: background.gdrive_file_id,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'arraybuffer' }
  )
  const backgroundBuffer = Buffer.from(backgroundResponse.data as ArrayBuffer)
  const backgroundMimeType = 'image/jpeg'
  const backgroundBase64 = backgroundBuffer.toString('base64')

  console.log(`   Downloaded: ${backgroundBuffer.length} bytes`)
  console.log(`   First bytes: ${backgroundBuffer.toString('hex').substring(0, 20)}`)

  console.log(`✅ Images downloaded successfully`)

  // Step 5: Generate composite using Gemini
  console.log('\n🤖 Step 5: Generating composite with AI...')
  const userPrompt = 'Place the product prominently in the product safe zone, ensuring the gummy bottle is clearly visible and well-positioned according to template guidelines. Add the headline text "Boost Your Immunity" in a bold, professional font in the text safe zone area, making it prominent and eye-catching.'

  const composite = await generateComposite(
    `data:${angledShotMimeType};base64,${angledShotBase64}`,
    angledShotMimeType,
    `data:${backgroundMimeType};base64,${backgroundBase64}`,
    backgroundMimeType,
    userPrompt,
    category?.look_and_feel || undefined,
    safeZones.length > 0 ? safeZones : undefined,
    1920,
    1080
  )

  console.log('✅ Composite generated!')
  console.log(`   Image size: ${composite.imageData.length} characters`)

  // Step 6: Upload to Google Drive
  console.log('\n📤 Step 6: Uploading to Google Drive...')
  const base64Data = composite.imageData.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const fileName = `${category?.slug}/composites/16x9/three-quarter-left_${Date.now()}.jpg`
  const storageFile = await uploadFile(buffer, fileName, {
    contentType: 'image/jpeg',
    provider: 'gdrive',
  })

  console.log('✅ Uploaded to Google Drive')
  console.log(`   File ID: ${storageFile.fileId}`)
  console.log(`   Public URL: ${storageFile.publicUrl}`)

  // Step 7: Save to database
  console.log('\n💾 Step 7: Saving to database...')
  const { data: dbComposite, error } = await supabase
    .from('composites')
    .insert({
      category_id: CATEGORY_ID,
      user_id: category?.user_id,
      product_id: angledShot.product_id,
      angled_shot_id: angledShot.id,
      background_id: BACKGROUND_ID,
      name: 'Test Composite 16:9 - Immunity Boost',
      slug: `three-quarter-left-immunity-${Date.now()}`,
      description: 'Test composite with headline text "Boost Your Immunity" - verifying duplicate creation works',
      prompt_used: composite.promptUsed,
      format: '16:9',
      width: 1920,
      height: 1080,
      storage_provider: 'gdrive',
      storage_path: storageFile.path,
      storage_url: storageFile.publicUrl,
      gdrive_file_id: storageFile.fileId,
      metadata: {},
    })
    .select()
    .single()

  if (error) {
    console.error('❌ Database error:', error)
    return
  }

  console.log('✅ Saved to database')

  // Final output
  console.log('\n' + '='.repeat(70))
  console.log('🎉 COMPOSITE CREATED SUCCESSFULLY!')
  console.log('='.repeat(70))
  console.log('\n📊 Composite Details:')
  console.log(`   ID: ${dbComposite.id}`)
  console.log(`   Name: ${dbComposite.name}`)
  console.log(`   Format: ${dbComposite.format} (${dbComposite.width}x${dbComposite.height})`)
  console.log(`   Storage Path: ${dbComposite.storage_path}`)
  console.log(`   GDrive File ID: ${dbComposite.gdrive_file_id}`)
  console.log(`\n🔗 View Image:`)
  console.log(`   ${dbComposite.storage_url}`)
  console.log(`\n📐 Template Safe Zones Applied:`)
  safeZones.forEach((zone: any, i: number) => {
    console.log(`   ${i+1}. ${zone.name}:`)
    console.log(`      Position: (${zone.x}, ${zone.y})`)
    console.log(`      Size: ${zone.width}x${zone.height}`)
    console.log(`      Color: ${zone.color}`)
  })
  console.log('\n' + '='.repeat(70))
  console.log('✅ You can now view and verify the composite in Google Drive!')
  console.log('='.repeat(70))
}

createCompositeDirect()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
