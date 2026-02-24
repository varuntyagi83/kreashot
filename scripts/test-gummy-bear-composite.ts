#!/usr/bin/env tsx
/**
 * Generate Real Composite for Gummy Bear Category
 * 1. Generate a real JPEG background using Gemini
 * 2. Use existing angled shots
 * 3. Create composites (all within same category)
 */

import { createClient } from '@supabase/supabase-js'
import { generateBackgrounds } from '../src/lib/ai/gemini'
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

async function testGummyBearComposite() {
  console.log('🍬 Gummy Bear Complete Composite Test\n')
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
    // Step 1: Get Gummy Bear category
    console.log('\n1️⃣  Finding Gummy Bear Category...')
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel, user_id')
      .eq('slug', 'gummy-bear')
      .single()

    if (!category) {
      throw new Error('Gummy Bear category not found')
    }

    console.log(`   ✅ Category: ${category.name}`)
    console.log(`   Look & Feel: ${category.look_and_feel}`)

    // Step 2: Generate a real JPEG background using Gemini
    console.log('\n2️⃣  Generating Real Background with Gemini AI...')
    console.log('   Prompt: Bright, colorful product photography background')

    const backgrounds = await generateBackgrounds(
      'Bright, colorful product photography background with soft lighting, perfect for gummy vitamins',
      category.look_and_feel || 'Modern, clean product photography with warm tones',
      1
    )

    if (!backgrounds || backgrounds.length === 0) {
      throw new Error('Failed to generate background')
    }

    const background = backgrounds[0]
    console.log(`   ✅ Background generated (${(background.imageData.length / 1024).toFixed(1)}KB)`)

    // Save background to Google Drive
    console.log('\n3️⃣  Saving Background to Google Drive...')
    const bgBuffer = Buffer.from(
      background.imageData.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    )

    const bgFileName = `${category.slug}/backgrounds/colorful-bright-bg_${Date.now()}.jpg`
    const bgFile = await uploadFile(bgBuffer, bgFileName, {
      contentType: 'image/jpeg',
      provider: 'gdrive',
    })

    console.log(`   ✅ Saved to: ${bgFileName}`)

    // Save to database
    const { data: savedBg } = await supabase
      .from('backgrounds')
      .insert({
        category_id: category.id,
        user_id: category.user_id,
        name: 'Colorful Bright Background',
        slug: `colorful-bright-bg-${Date.now()}`,
        description: 'AI-generated bright colorful background for gummy vitamins',
        prompt_used: background.promptUsed,
        storage_provider: 'gdrive',
        storage_path: bgFile.path,
        storage_url: bgFile.publicUrl,
        gdrive_file_id: bgFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    console.log(`   ✅ Background saved to database`)

    // Step 3: Get ALL existing angled shots
    console.log('\n4️⃣  Finding Angled Shots...')
    const { data: angledShots } = await supabase
      .from('angled_shots')
      .select('*')
      .eq('category_id', category.id)
      // Get ALL angled shots to create all combinations

    if (!angledShots || angledShots.length === 0) {
      throw new Error('No angled shots found')
    }

    console.log(`   ✅ Found ${angledShots.length} angled shots`)
    angledShots.forEach((shot, idx) => {
      console.log(`      ${idx + 1}. ${shot.name} (${shot.angle_name})`)
    })

    // Step 4: Generate composites
    console.log(`\n5️⃣  Generating ${angledShots.length} Composites...`)
    console.log('-'.repeat(70))

    const savedComposites = []

    for (const [idx, shot] of angledShots.entries()) {
      console.log(`\n[${idx + 1}/${angledShots.length}] Compositing: ${shot.name} + Colorful Background`)

      try {
        // Download angled shot from Google Drive
        console.log('   📥 Downloading angled shot...')
        const shotResponse = await drive.files.get(
          {
            fileId: shot.gdrive_file_id,
            alt: 'media',
          },
          { responseType: 'arraybuffer' }
        )

        const shotBuffer = Buffer.from(shotResponse.data as ArrayBuffer)
        const shotBase64 = shotBuffer.toString('base64')

        console.log(`   ✅ Downloaded ${(shotBuffer.length / 1024).toFixed(1)}KB`)

        // Generate composite using Gemini
        console.log('   🤖 Generating composite with Gemini AI...')
        const composite = await generateComposite(
          `data:image/jpeg;base64,${shotBase64}`,
          'image/jpeg',
          background.imageData,
          background.mimeType,
          'Place the gummy vitamin bottle naturally in this colorful scene',
          category.look_and_feel || undefined
        )

        console.log('   ✅ Composite generated!')

        // Save composite to Google Drive
        console.log('   💾 Saving to Google Drive...')
        const compositeBuffer = Buffer.from(
          composite.imageData.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        )

        const compositeName = `${shot.name || 'shot'}-on-colorful-bg`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')

        const compositeFileName = `${category.slug}/composites/${compositeName}_${Date.now()}.jpg`

        const compositeFile = await uploadFile(
          compositeBuffer,
          compositeFileName,
          {
            contentType: 'image/jpeg',
            provider: 'gdrive',
          }
        )

        console.log(`   ✅ Saved to: ${compositeFileName}`)

        // Save to database
        const { data: savedComposite } = await supabase
          .from('composites')
          .insert({
            category_id: category.id,
            user_id: category.user_id,
            product_id: shot.product_id,
            angled_shot_id: shot.id,
            background_id: savedBg.id,
            name: `${shot.name} on Colorful Background`,
            slug: compositeName,
            description: `AI-generated composite`,
            prompt_used: composite.promptUsed,
            storage_provider: 'gdrive',
            storage_path: compositeFile.path,
            storage_url: compositeFile.publicUrl,
            gdrive_file_id: compositeFile.fileId || null,
            metadata: {},
          })
          .select()
          .single()

        console.log('   ✅ Saved to database!')
        savedComposites.push(savedComposite)

      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`)
      }
    }

    // Final Summary
    console.log('\n\n')
    console.log('='.repeat(70))
    console.log('🎉 Test Complete!')
    console.log('='.repeat(70))
    console.log(`\n✅ Successfully Generated ${savedComposites.length} Composites:`)

    savedComposites.forEach((comp, idx) => {
      console.log(`\n   ${idx + 1}. ${comp.name}`)
      console.log(`      Path: ${comp.storage_path}`)
      console.log(`      URL: ${comp.storage_url}`)
    })

    console.log('\n📂 Google Drive Structure:')
    console.log(`   AdForge Assets/`)
    console.log(`   └── gummy-bear/`)
    console.log(`       ├── backgrounds/`)
    console.log(`       │   └── ${bgFileName.split('/').pop()}`)
    console.log(`       └── composites/`)
    savedComposites.forEach((comp) => {
      const filename = comp.storage_path.split('/').pop()
      console.log(`           └── ${filename}`)
    })

    console.log('\n🌐 View in UI:')
    console.log('   http://localhost:3000/categories → Gummy Bear → Composites tab')

  } catch (error: any) {
    console.error('\n\n❌ TEST FAILED:', error.message)
    console.error(error)
    process.exit(1)
  }
}

testGummyBearComposite()
