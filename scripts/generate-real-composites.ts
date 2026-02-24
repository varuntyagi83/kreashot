#!/usr/bin/env tsx
/**
 * Generate Real Composites Using Gemini AI
 * This script actually generates composites by combining angled shots with backgrounds
 */

import { createClient } from '@supabase/supabase-js'
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

async function generateRealComposites() {
  console.log('🎨 Generating Real Composites with Gemini AI\n')
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
    // Get Greenworld category (has real Gemini background)
    console.log('\n1️⃣  Finding Category...')
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel, user_id')
      .eq('slug', 'greenworld')
      .single()

    if (!category) {
      throw new Error('Greenworld category not found')
    }

    // Note: We'll generate angled shots first if none exist
    const { count: existingShotsCount } = await supabase
      .from('angled_shots')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', category.id)

    if (!existingShotsCount || existingShotsCount === 0) {
      console.log('   ⚠️  No angled shots found.')
      console.log('   Please generate angled shots first using the "Angled Shots" tab.')
      console.log('   Or use the Gummy Bear category which already has angled shots.')
      throw new Error('No angled shots available')
    }

    console.log(`   ✅ Category: ${category.name}`)
    console.log(`   Look & Feel: ${category.look_and_feel || 'None'}`)

    // Get angled shots
    console.log('\n2️⃣  Fetching Angled Shots...')
    const { data: angledShots } = await supabase
      .from('angled_shots')
      .select('*')
      .eq('category_id', category.id)
      .limit(3) // Limit to 3 for faster testing

    console.log(`   ✅ Found ${angledShots?.length || 0} angled shots`)
    angledShots?.forEach((shot, idx) => {
      console.log(`      ${idx + 1}. ${shot.name} (${shot.angle_name})`)
    })

    // Get backgrounds
    console.log('\n3️⃣  Fetching Backgrounds...')
    const { data: backgrounds } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('category_id', category.id)

    console.log(`   ✅ Found ${backgrounds?.length || 0} backgrounds`)
    backgrounds?.forEach((bg, idx) => {
      console.log(`      ${idx + 1}. ${bg.name}`)
    })

    if (!angledShots || angledShots.length === 0) {
      throw new Error('No angled shots found')
    }

    if (!backgrounds || backgrounds.length === 0) {
      throw new Error('No backgrounds found')
    }

    // Generate composites
    const totalComposites = angledShots.length * backgrounds.length
    console.log(
      `\n4️⃣  Generating ${totalComposites} Composites (${angledShots.length} shots × ${backgrounds.length} backgrounds)...`
    )
    console.log('-'.repeat(70))

    let compositeCount = 0
    const savedComposites = []

    for (const shot of angledShots) {
      for (const bg of backgrounds) {
        compositeCount++
        console.log(
          `\n[${compositeCount}/${totalComposites}] Compositing: ${shot.name} + ${bg.name}`
        )

        try {
          // Download angled shot image from Google Drive
          console.log('   📥 Downloading angled shot from Google Drive...')
          let shotBuffer: Buffer | null = null

          if (
            shot.storage_provider === 'gdrive' &&
            shot.gdrive_file_id
          ) {
            try {
              const response = await drive.files.get(
                {
                  fileId: shot.gdrive_file_id,
                  alt: 'media',
                },
                { responseType: 'arraybuffer' }
              )
              shotBuffer = Buffer.from(response.data as ArrayBuffer)
            } catch (error: any) {
              console.log(
                `   ⚠️  Failed to download angled shot: ${error.message}`
              )
            }
          }

          if (!shotBuffer) {
            console.log('   ⚠️  Skipping - no angled shot data')
            continue
          }

          // Download background image from Google Drive
          console.log('   📥 Downloading background from Google Drive...')
          let bgBuffer: Buffer | null = null

          if (bg.storage_provider === 'gdrive' && bg.gdrive_file_id) {
            try {
              const response = await drive.files.get(
                {
                  fileId: bg.gdrive_file_id,
                  alt: 'media',
                },
                { responseType: 'arraybuffer' }
              )
              bgBuffer = Buffer.from(response.data as ArrayBuffer)
            } catch (error: any) {
              console.log(
                `   ⚠️  Failed to download background: ${error.message}`
              )
            }
          }

          if (!bgBuffer) {
            console.log('   ⚠️  Skipping - no background data')
            continue
          }

          // Convert to base64
          const shotBase64 = shotBuffer.toString('base64')
          const shotMimeType = 'image/jpeg' // Assume JPEG for angled shots

          const bgBase64 = bgBuffer.toString('base64')
          // Check if it's SVG based on file extension
          const bgMimeType = bg.storage_path.endsWith('.svg')
            ? 'image/svg+xml'
            : 'image/jpeg'

          // Generate composite using Gemini AI
          console.log('   🤖 Generating composite with Gemini AI...')
          const composite = await generateComposite(
            `data:${shotMimeType};base64,${shotBase64}`,
            shotMimeType,
            `data:${bgMimeType};base64,${bgBase64}`,
            bgMimeType,
            undefined, // No custom placement instruction
            category.look_and_feel || undefined
          )

          console.log('   ✅ Composite generated!')

          // Save to Google Drive
          const compositeName = `${shot.name}-on-${bg.name}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')

          console.log('   💾 Saving to Google Drive...')

          // Convert base64 to buffer
          const base64Data = composite.imageData.replace(
            /^data:image\/\w+;base64,/,
            ''
          )
          const buffer = Buffer.from(base64Data, 'base64')

          // Upload to Google Drive
          const fileExt = composite.mimeType?.split('/')[1] || 'jpg'
          const fileName = `${category.slug}/composites/${compositeName}_${Date.now()}.${fileExt}`

          const storageFile = await uploadFile(buffer, fileName, {
            contentType: composite.mimeType || 'image/jpeg',
            provider: 'gdrive',
          })

          console.log(`   ✅ Uploaded to: ${fileName}`)
          console.log(`   📂 Google Drive File ID: ${storageFile.fileId}`)

          // Save to database
          console.log('   💾 Saving to database...')
          const { data: savedComposite, error: dbError } = await supabase
            .from('composites')
            .insert({
              category_id: category.id,
              user_id: category.user_id,
              product_id: shot.product_id,
              angled_shot_id: shot.id,
              background_id: bg.id,
              name: `${shot.name} on ${bg.name}`,
              slug: compositeName,
              description: `AI-generated composite of ${shot.name} with ${bg.name}`,
              prompt_used: composite.promptUsed,
              storage_provider: 'gdrive',
              storage_path: storageFile.path,
              storage_url: storageFile.publicUrl,
              gdrive_file_id: storageFile.fileId || null,
              metadata: {},
            })
            .select()
            .single()

          if (dbError) {
            console.error('   ❌ Database error:', dbError.message)
          } else {
            console.log('   ✅ Saved to database!')
            savedComposites.push(savedComposite)
          }

          console.log('   🎉 Composite complete!')
        } catch (error: any) {
          console.error(
            `   ❌ Error generating composite: ${error.message}`
          )
        }
      }
    }

    // Summary
    console.log('\n\n')
    console.log('='.repeat(70))
    console.log('📊 Generation Summary')
    console.log('='.repeat(70))
    console.log(`Total Composites Generated: ${savedComposites.length}/${totalComposites}`)
    console.log(`\nSaved Composites:`)

    savedComposites.forEach((comp, idx) => {
      console.log(`   ${idx + 1}. ${comp.name}`)
      console.log(`      Storage: ${comp.storage_provider}`)
      console.log(`      Path: ${comp.storage_path}`)
      console.log(`      URL: ${comp.storage_url}`)
    })

    console.log('\n🎉 All composites generated successfully!')
    console.log('\nTo view composites:')
    console.log('   1. Navigate to http://localhost:3000/categories')
    console.log('   2. Click on "Gummy Bear"')
    console.log('   3. Go to "Composites" tab')
    console.log(`   4. You should see ${savedComposites.length} composites in the gallery`)

    console.log('\nGoogle Drive folder structure:')
    console.log('   AdForge Assets/')
    console.log('   └── gummy-bear/')
    console.log('       └── composites/')
    savedComposites.forEach((comp) => {
      const filename = comp.storage_path.split('/').pop()
      console.log(`           └── ${filename}`)
    })
  } catch (error: any) {
    console.error('\n\n❌ GENERATION FAILED:', error.message)
    console.error(error)
    process.exit(1)
  }
}

generateRealComposites()
