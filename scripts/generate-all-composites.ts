#!/usr/bin/env tsx
/**
 * Generate ALL Composites for Gummy Bear
 * Uses existing angled shots + existing background
 */

import { createClient } from '@supabase/supabase-js'
import { generateComposite } from '../src/lib/ai/gemini'
import { uploadFile } from '../src/lib/storage'
import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }}
)

async function generateAllComposites() {
  console.log('🍬 Generating ALL Gummy Bear Composites\n')
  console.log('='.repeat(70))

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  const drive = google.drive({ version: 'v3', auth })

  try {
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel, user_id')
      .eq('slug', 'gummy-bear')
      .single()

    if (!category) throw new Error('Gummy Bear not found')

    console.log(`✅ Category: ${category.name}\n`)

    // Get ALL angled shots
    const { data: angledShots } = await supabase
      .from('angled_shots')
      .select('*')
      .eq('category_id', category.id)
      .order('angle_name')

    if (!angledShots || angledShots.length === 0) {
      throw new Error('No angled shots found')
    }

    console.log(`📸 Found ${angledShots.length} angled shots:`)
    angledShots.forEach((s, i) => console.log(`   ${i+1}. ${s.angle_name}`))

    // Get the real JPEG background (not SVG)
    const { data: background } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('category_id', category.id)
      .not('storage_path', 'like', '%.svg')
      .limit(1)
      .single()

    if (!background) throw new Error('No JPEG background found')

    console.log(`\n🎨 Background: ${background.name}`)
    console.log(`\n✨ Generating ${angledShots.length} composites...\n`)
    console.log('='.repeat(70))

    // Download background once
    console.log('\n📥 Downloading background from Google Drive...')
    const bgResponse = await drive.files.get(
      { fileId: background.gdrive_file_id, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    const bgBuffer = Buffer.from(bgResponse.data as ArrayBuffer)
    const bgBase64 = bgBuffer.toString('base64')
    console.log(`✅ Background downloaded (${(bgBuffer.length/1024).toFixed(1)}KB)`)

    const savedComposites = []

    // Generate composites for ALL angled shots
    for (let idx = 0; idx < angledShots.length; idx++) {
      const shot = angledShots[idx]
      console.log(`\n[${idx+1}/${angledShots.length}] ${shot.angle_name}`)
      console.log('-'.repeat(40))

      try {
        // Download angled shot
        console.log('   📥 Downloading angled shot...')
        const shotResponse = await drive.files.get(
          { fileId: shot.gdrive_file_id, alt: 'media' },
          { responseType: 'arraybuffer' }
        )
        const shotBuffer = Buffer.from(shotResponse.data as ArrayBuffer)
        const shotBase64 = shotBuffer.toString('base64')
        console.log(`   ✅ Downloaded (${(shotBuffer.length/1024).toFixed(1)}KB)`)

        // Generate composite
        console.log('   🤖 Generating composite with Gemini...')
        const composite = await generateComposite(
          `data:image/jpeg;base64,${shotBase64}`,
          'image/jpeg',
          `data:image/jpeg;base64,${bgBase64}`,
          'image/jpeg',
          `Place the gummy vitamin bottle naturally in this colorful scene from ${shot.angle_name} angle`,
          category.look_and_feel || undefined
        )
        console.log('   ✅ Composite generated!')

        // Save to Google Drive
        console.log('   💾 Saving to Google Drive...')
        const compositeBuffer = Buffer.from(
          composite.imageData.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        )

        const compositeName = `${shot.angle_name}-on-colorful-bg`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')

        const compositeFileName = `${category.slug}/composites/${compositeName}_${Date.now()}.jpg`

        const compositeFile = await uploadFile(compositeBuffer, compositeFileName, {
          contentType: 'image/jpeg',
          provider: 'gdrive',
        })

        console.log(`   ✅ Saved: ${compositeName}.jpg`)

        // Save to database
        const { data: savedComposite } = await supabase
          .from('composites')
          .insert({
            category_id: category.id,
            user_id: category.user_id,
            product_id: shot.product_id,
            angled_shot_id: shot.id,
            background_id: background.id,
            name: `${shot.angle_name} on Colorful Background`,
            slug: compositeName,
            description: `Composite: ${shot.angle_name} angle with colorful background`,
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

    // Summary
    console.log('\n\n')
    console.log('='.repeat(70))
    console.log('🎉 ALL COMPOSITES GENERATED!')
    console.log('='.repeat(70))
    console.log(`\n✅ Successfully Created: ${savedComposites.length}/${angledShots.length} composites\n`)

    savedComposites.forEach((comp, idx) => {
      const angle = angledShots.find(s => s.id === comp.angled_shot_id)?.angle_name
      console.log(`   ${idx+1}. ${angle}`)
      console.log(`      → ${comp.storage_path}`)
    })

    console.log('\n📂 Google Drive Structure:')
    console.log('   AdForge Assets/')
    console.log('   └── gummy-bear/')
    console.log('       └── composites/')
    savedComposites.forEach((comp) => {
      const filename = comp.storage_path.split('/').pop()
      console.log(`           └── ${filename}`)
    })

    console.log('\n🌐 View in UI:')
    console.log('   http://localhost:3000/categories → Gummy Bear → Composites tab')
    console.log(`\n   You should see ${savedComposites.length} composites in the gallery!`)

  } catch (error: any) {
    console.error('\n\n❌ FAILED:', error.message)
    console.error(error)
    process.exit(1)
  }
}

generateAllComposites()
