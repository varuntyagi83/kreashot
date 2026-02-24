import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

async function auditGDriveURLs() {
  console.log('🔍 GOOGLE DRIVE URL AUDIT\n')
  console.log('='  .repeat(70))

  // 1. Check Angled Shots
  console.log('\n1️⃣  ANGLED SHOTS:')
  console.log('-'.repeat(70))
  const { data: shots } = await supabase
    .from('angled_shots')
    .select('id, display_name, format, storage_provider, storage_url, gdrive_file_id')
    .eq('category_id', CATEGORY_ID)
    .limit(5)

  if (shots && shots.length > 0) {
    shots.forEach((shot, i) => {
      const urlOk = shot.storage_url?.includes('drive.google.com')
      const hasFileId = !!shot.gdrive_file_id
      const correctFormat = shot.storage_url?.includes('thumbnail?id=') || shot.storage_url?.includes('uc?id=')

      console.log(`\n  ${i+1}. ${shot.display_name} (${shot.format})`)
      console.log(`     Provider: ${shot.storage_provider}`)
      console.log(`     File ID: ${shot.gdrive_file_id ? '✅' : '❌'}`)
      console.log(`     Storage URL: ${urlOk ? '✅' : '❌'} ${shot.storage_url?.substring(0, 60)}...`)
      console.log(`     URL Format: ${correctFormat ? '✅ Correct' : '⚠️  Check format'}`)
    })
  } else {
    console.log('  ❌ No angled shots found')
  }

  // 2. Check Backgrounds
  console.log('\n\n2️⃣  BACKGROUNDS:')
  console.log('-'.repeat(70))
  const { data: backgrounds } = await supabase
    .from('backgrounds')
    .select('id, name, format, storage_provider, storage_url, gdrive_file_id')
    .eq('category_id', CATEGORY_ID)
    .limit(5)

  if (backgrounds && backgrounds.length > 0) {
    backgrounds.forEach((bg, i) => {
      const urlOk = bg.storage_url?.includes('drive.google.com')
      const hasFileId = !!bg.gdrive_file_id
      const correctFormat = bg.storage_url?.includes('thumbnail?id=') || bg.storage_url?.includes('uc?id=')

      console.log(`\n  ${i+1}. ${bg.name} (${bg.format})`)
      console.log(`     Provider: ${bg.storage_provider}`)
      console.log(`     File ID: ${bg.gdrive_file_id ? '✅' : '❌'}`)
      console.log(`     Storage URL: ${urlOk ? '✅' : '❌'} ${bg.storage_url?.substring(0, 60)}...`)
      console.log(`     URL Format: ${correctFormat ? '✅ Correct' : '⚠️  Check format'}`)
    })
  } else {
    console.log('  ❌ No backgrounds found')
  }

  // 3. Check Composites
  console.log('\n\n3️⃣  COMPOSITES:')
  console.log('-'.repeat(70))
  const { data: composites } = await supabase
    .from('composites')
    .select('id, name, format, storage_provider, storage_url, gdrive_file_id')
    .eq('category_id', CATEGORY_ID)
    .limit(5)

  if (composites && composites.length > 0) {
    composites.forEach((comp, i) => {
      const urlOk = comp.storage_url?.includes('drive.google.com')
      const hasFileId = !!comp.gdrive_file_id
      const correctFormat = comp.storage_url?.includes('thumbnail?id=') || comp.storage_url?.includes('uc?id=')

      console.log(`\n  ${i+1}. ${comp.name} (${comp.format})`)
      console.log(`     Provider: ${comp.storage_provider}`)
      console.log(`     File ID: ${comp.gdrive_file_id ? '✅' : '❌'}`)
      console.log(`     Storage URL: ${urlOk ? '✅' : '❌'} ${comp.storage_url?.substring(0, 60)}...`)
      console.log(`     URL Format: ${correctFormat ? '✅ Correct' : '⚠️  Check format'}`)
    })
  } else {
    console.log('  ⚠️  No composites found (expected if none created yet)')
  }

  // 4. Check Templates
  console.log('\n\n4️⃣  TEMPLATES:')
  console.log('-'.repeat(70))
  const { data: templates } = await supabase
    .from('templates')
    .select('id, name, format, storage_provider, storage_url, gdrive_file_id')
    .eq('category_id', CATEGORY_ID)

  if (templates && templates.length > 0) {
    templates.forEach((tmpl, i) => {
      const urlOk = tmpl.storage_url?.includes('drive.google.com')
      const hasFileId = !!tmpl.gdrive_file_id
      const correctFormat = tmpl.storage_url?.includes('thumbnail?id=') || tmpl.storage_url?.includes('uc?id=')

      console.log(`\n  ${i+1}. ${tmpl.name} (${tmpl.format})`)
      console.log(`     Provider: ${tmpl.storage_provider}`)
      console.log(`     File ID: ${tmpl.gdrive_file_id ? '✅' : '❌'}`)
      console.log(`     Storage URL: ${urlOk ? '✅' : '❌'} ${tmpl.storage_url?.substring(0, 60)}...`)
      console.log(`     URL Format: ${correctFormat ? '✅ Correct' : '⚠️  Check format'}`)
    })
  } else {
    console.log('  ❌ No templates found')
  }

  // 5. Check Product Images
  console.log('\n\n5️⃣  PRODUCT IMAGES:')
  console.log('-'.repeat(70))
  const { data: productImages } = await supabase
    .from('product_images')
    .select('id, file_name, product_id')
    .limit(3)

  if (productImages && productImages.length > 0) {
    console.log(`  Found ${productImages.length} product images`)
    productImages.forEach((img, i) => {
      console.log(`  ${i+1}. ${img.file_name}`)
    })
  } else {
    console.log('  ⚠️  No product images found')
  }

  // Summary
  console.log('\n\n' + '='.repeat(70))
  console.log('SUMMARY:')
  console.log('='.repeat(70))
  console.log('\n✅ All assets should have:')
  console.log('   - storage_provider: "gdrive"')
  console.log('   - storage_url: Google Drive URL (thumbnail or uc format)')
  console.log('   - gdrive_file_id: The file ID from Google Drive')
  console.log('   - storage_path: The logical path in the hierarchy')
  console.log('\n📋 Recommended URL format:')
  console.log('   - https://drive.google.com/thumbnail?id={FILE_ID}&sz=w2000')
  console.log('   - https://drive.google.com/uc?id={FILE_ID}')
  console.log('\n⚠️  If any URLs are missing or malformed, they need to be fixed.')
}

auditGDriveURLs().then(() => process.exit(0))
