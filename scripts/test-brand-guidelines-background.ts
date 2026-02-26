#!/usr/bin/env tsx
/**
 * Test: Generate a "World of Green" background with brand guidelines
 * Using the new brand_guidelines injection in generateBackgrounds()
 */

import { createClient } from '@supabase/supabase-js'
import { generateBackgrounds } from '../src/lib/ai/gemini'
import { uploadFile } from '../src/lib/storage'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('🎨 Test: Generate World of Green Background with Brand Guidelines\n')
  console.log('='.repeat(60))

  // 1. Fetch the Gummy Bear category with brand_guidelines
  const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
  const { data: category, error: catError } = await supabase
    .from('categories')
    .select('id, name, slug, look_and_feel, brand_guidelines, user_id')
    .eq('id', categoryId)
    .single()

  if (catError || !category) {
    console.error('❌ Category not found:', catError)
    process.exit(1)
  }

  console.log(`\n✅ Category: ${category.name}`)
  console.log(`   Look & Feel: ${(category.look_and_feel || '').substring(0, 80)}...`)
  console.log(`   Brand Guidelines: ${category.brand_guidelines ? category.brand_guidelines.substring(0, 80) + '...' : '(empty)'}`)
  console.log(`   Brand Guidelines Length: ${category.brand_guidelines?.length || 0} chars`)

  if (!category.brand_guidelines) {
    console.error('❌ Brand guidelines are empty! Cannot test.')
    process.exit(1)
  }

  // 2. Generate background
  console.log('\n🎨 Generating "World of Green" background with human hand...')
  console.log('   Using brand guidelines from Sunday Natural Design Guide PDF')

  const userPrompt = `Create a professional "World of Green" product photography background.

The composition should show:
- A human hand naturally positioned, as if presenting or reaching toward a product
- Multiple shades of green mood boxes or surfaces arranged artistically behind/around the hand
- Use the Sunday Natural "World of Green" palette: sage green (#7D8C84), earth tones, natural forest greens
- Soft, professional lighting with gentle natural shadows
- Clean, modern aesthetic with warm undertones
- The background should feel organic, fresh, and premium — suitable for supplement product photography
- Leave a clear product-safe zone in the center for compositing

Style: High-end e-commerce photography with natural, organic feel.`

  const lookAndFeel = category.look_and_feel || 'Fresh, organic, green aesthetic with natural lighting and earth tones'

  const startTime = Date.now()
  const backgrounds = await generateBackgrounds(
    userPrompt,
    lookAndFeel,
    1,                    // count
    undefined,            // no style reference images
    '1:1',               // aspect ratio
    '2K',                // image size
    category.brand_guidelines  // brand guidelines from PDF
  )
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if (!backgrounds || backgrounds.length === 0) {
    console.error('❌ Failed to generate background')
    process.exit(1)
  }

  const bg = backgrounds[0]
  console.log(`\n✅ Background generated in ${elapsed}s`)
  console.log(`   Image data length: ${bg.imageData.length} chars`)
  console.log(`   MIME type: ${bg.mimeType}`)
  console.log(`   Prompt used: ${bg.promptUsed.substring(0, 100)}...`)

  // 3. Upload to Google Drive
  console.log('\n☁️  Uploading to Google Drive...')
  const base64Data = bg.imageData.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const fileExt = bg.mimeType.includes('png') ? 'png' : 'jpg'
  const timestamp = Date.now()
  const fileName = `${category.slug}/backgrounds/1x1/world-of-green-hand_${timestamp}.${fileExt}`

  console.log(`   Path: ${fileName}`)
  console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`)

  const storageFile = await uploadFile(buffer, fileName, {
    contentType: bg.mimeType,
    provider: 'gdrive',
  })

  console.log(`   ✅ Uploaded to GDrive`)
  console.log(`   📁 Path: ${storageFile.path}`)
  console.log(`   🔗 URL: ${storageFile.publicUrl}`)
  console.log(`   🆔 File ID: ${storageFile.fileId}`)

  // 4. Save to backgrounds table
  console.log('\n💾 Saving to database...')
  const { data: background, error: dbError } = await supabase
    .from('backgrounds')
    .insert({
      category_id: category.id,
      user_id: category.user_id,
      name: 'World of Green - Hand',
      slug: `world-of-green-hand-${timestamp}`,
      description: 'World of Green background with human hand, generated using brand guidelines from Sunday Natural Design Guide',
      prompt_used: bg.promptUsed,
      format: '1:1',
      storage_provider: 'gdrive',
      storage_path: storageFile.path,
      storage_url: storageFile.publicUrl,
      gdrive_file_id: storageFile.fileId || null,
      metadata: {
        theme: 'world-of-green',
        elements: ['hand', 'green-mood-boxes', 'sage-green'],
        brand_guidelines_used: true,
        generated_with: 'gemini-3-pro-image-preview',
      },
    })
    .select()
    .single()

  if (dbError) {
    console.error('   ❌ Database error:', dbError)
    process.exit(1)
  }

  console.log(`   ✅ Saved to database`)
  console.log(`   🆔 Background ID: ${background.id}`)

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('✅ Test Complete: World of Green Background Generated!')
  console.log('='.repeat(60))
  console.log(`\n📁 GDrive: ${storageFile.path}`)
  console.log(`🔗 URL: ${storageFile.publicUrl}`)
  console.log(`💾 DB ID: ${background.id}`)
  console.log(`⏱  Time: ${elapsed}s`)
  console.log('\nBrand guidelines were successfully injected into the Gemini prompt.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error.message || error)
    if (error.stack) console.error(error.stack)
    process.exit(1)
  })
