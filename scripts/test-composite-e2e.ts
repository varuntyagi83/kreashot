#!/usr/bin/env tsx
/**
 * Complete E2E Test: Generate Angled Shot → Generate Composite
 * This proves the entire pipeline works with real AI generation
 */

import { createClient } from '@supabase/supabase-js'
import { generateAngledShots } from '../src/lib/ai/gemini'
import { generateComposite } from '../src/lib/ai/gemini'
import { uploadFile } from '../src/lib/storage'
import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function testCompositeE2E() {
  console.log('🎯 Complete E2E Test: Angled Shot → Composite\n')
  console.log('='.repeat(70))

  // Initialize Google Drive API client
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n'
      ),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  const drive = google.drive({ version: 'v3', auth })

  try {
    // Step 1: Get Greenworld category
    console.log('\n1️⃣  Finding Greenworld Category...')
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel, user_id')
      .eq('slug', 'greenworld')
      .single()

    if (!category) {
      throw new Error('Greenworld category not found')
    }

    console.log(`   ✅ Category: ${category.name}`)

    // Step 2: Get a product with images
    console.log('\n2️⃣  Finding Product with Images...')
    const { data: product } = await supabase
      .from('products')
      .select('id, name, slug')
      .eq('category_id', category.id)
      .limit(1)
      .single()

    if (!product) {
      throw new Error('No products found in Greenworld')
    }

    console.log(`   ✅ Product: ${product.name}`)

    // Get product images
    const { data: productImages } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', product.id)
      .eq('is_primary', true)
      .limit(1)

    if (!productImages || productImages.length === 0) {
      throw new Error('No product images found')
    }

    const primaryImage = productImages[0]
    console.log(`   ✅ Primary Image: ${primaryImage.file_path}`)

    // Step 3: Download the product image from Google Drive
    console.log('\n3️⃣  Downloading Product Image from Google Drive...')
    const imageResponse = await drive.files.get(
      {
        fileId: primaryImage.gdrive_file_id,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    )

    const imageBuffer = Buffer.from(imageResponse.data as ArrayBuffer)
    const imageBase64 = imageBuffer.toString('base64')
    const imageMimeType = primaryImage.mime_type || 'image/jpeg'

    console.log(`   ✅ Downloaded ${(imageBuffer.length / 1024).toFixed(1)}KB`)

    // Step 4: Generate ONE angled shot using Gemini
    console.log('\n4️⃣  Generating Angled Shot with Gemini AI...')
    console.log('   Angle: Front view')

    const angledShots = await generateAngledShots(
      `data:${imageMimeType};base64,${imageBase64}`,
      imageMimeType,
      [{ name: 'front', description: 'Front facing view', prompt: 'Show the product from a direct front view' }],
      category.look_and_feel || undefined
    )

    if (!angledShots || angledShots.length === 0) {
      throw new Error('Failed to generate angled shot')
    }

    const angledShot = angledShots[0]
    console.log(`   ✅ Angled shot generated (${(angledShot.imageData.length / 1024).toFixed(1)}KB)`)

    // Save angled shot to Google Drive
    console.log('\n5️⃣  Saving Angled Shot to Google Drive...')
    const shotBuffer = Buffer.from(
      angledShot.imageData.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    )

    const shotFileName = `${category.slug}/angled-shots/${product.slug}-front_${Date.now()}.jpg`
    const shotFile = await uploadFile(shotBuffer, shotFileName, {
      contentType: 'image/jpeg',
      provider: 'gdrive',
    })

    console.log(`   ✅ Saved to: ${shotFileName}`)

    // Save to database
    const { data: savedShot } = await supabase
      .from('angled_shots')
      .insert({
        category_id: category.id,
        product_id: product.id,
        user_id: category.user_id,
        name: `${product.name} - Front`,
        angle_name: 'front',
        angle_description: 'Front facing view',
        prompt_used: angledShot.promptUsed,
        storage_provider: 'gdrive',
        storage_path: shotFile.path,
        storage_url: shotFile.publicUrl,
        gdrive_file_id: shotFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    console.log(`   ✅ Saved to database with ID: ${savedShot.id}`)

    // Step 6: Get background
    console.log('\n6️⃣  Finding Background...')
    const { data: background } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('category_id', category.id)
      .limit(1)
      .single()

    if (!background) {
      throw new Error('No backgrounds found')
    }

    console.log(`   ✅ Background: ${background.name}`)

    // Download background from Google Drive
    console.log('\n7️⃣  Downloading Background from Google Drive...')
    const bgResponse = await drive.files.get(
      {
        fileId: background.gdrive_file_id,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    )

    const bgBuffer = Buffer.from(bgResponse.data as ArrayBuffer)
    const bgBase64 = bgBuffer.toString('base64')
    const bgMimeType = 'image/jpeg'

    console.log(`   ✅ Downloaded ${(bgBuffer.length / 1024).toFixed(1)}KB`)

    // Step 7: Generate composite using Gemini
    console.log('\n8️⃣  Generating Composite with Gemini AI...')
    console.log(`   Compositing: ${savedShot.name} + ${background.name}`)

    const composite = await generateComposite(
      `data:image/jpeg;base64,${shotBuffer.toString('base64')}`,
      'image/jpeg',
      `data:${bgMimeType};base64,${bgBase64}`,
      bgMimeType,
      'Place the product naturally in the scene', // User instruction
      category.look_and_feel || undefined
    )

    console.log(`   ✅ Composite generated!`)

    // Step 8: Save composite to Google Drive
    console.log('\n9️⃣  Saving Composite to Google Drive...')
    const compositeBuffer = Buffer.from(
      composite.imageData.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    )

    const compositeName = `${product.slug}-front-on-${background.slug}`
    const compositeFileName = `${category.slug}/composites/${compositeName}_${Date.now()}.jpg`

    const compositeFile = await uploadFile(compositeBuffer, compositeFileName, {
      contentType: 'image/jpeg',
      provider: 'gdrive',
    })

    console.log(`   ✅ Saved to: ${compositeFileName}`)
    console.log(`   📂 Google Drive File ID: ${compositeFile.fileId}`)

    // Save to database
    const { data: savedComposite } = await supabase
      .from('composites')
      .insert({
        category_id: category.id,
        product_id: product.id,
        user_id: category.user_id,
        angled_shot_id: savedShot.id,
        background_id: background.id,
        name: `${savedShot.name} on ${background.name}`,
        slug: compositeName,
        description: `AI-generated composite - E2E test`,
        prompt_used: composite.promptUsed,
        storage_provider: 'gdrive',
        storage_path: compositeFile.path,
        storage_url: compositeFile.publicUrl,
        gdrive_file_id: compositeFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    console.log(`   ✅ Saved to database with ID: ${savedComposite.id}`)

    // Final Summary
    console.log('\n\n')
    console.log('='.repeat(70))
    console.log('🎉 E2E Test Complete!')
    console.log('='.repeat(70))
    console.log('\n✅ Successfully Generated:')
    console.log(`   1. Angled Shot: ${savedShot.name}`)
    console.log(`      Storage: ${savedShot.storage_path}`)
    console.log(`      URL: ${savedShot.storage_url}`)
    console.log(`\n   2. Composite: ${savedComposite.name}`)
    console.log(`      Storage: ${savedComposite.storage_path}`)
    console.log(`      URL: ${savedComposite.storage_url}`)

    console.log('\n📂 Google Drive Structure:')
    console.log(`   AdForge Assets/`)
    console.log(`   └── greenworld/`)
    console.log(`       ├── angled-shots/`)
    console.log(`       │   └── ${shotFileName.split('/').pop()}`)
    console.log(`       └── composites/`)
    console.log(`           └── ${compositeFileName.split('/').pop()}`)

    console.log('\n🌐 View in UI:')
    console.log('   http://localhost:3000/categories → Greenworld → Composites tab')

    console.log('\n✨ The complete pipeline works:')
    console.log('   Product Image → Gemini Angled Shot → Gemini Composite → Google Drive → Database')

  } catch (error: any) {
    console.error('\n\n❌ TEST FAILED:', error.message)
    console.error(error)
    process.exit(1)
  }
}

testCompositeE2E()
