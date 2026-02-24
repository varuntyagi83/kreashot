#!/usr/bin/env tsx
/**
 * Generate a real background for Greenworld using Gemini AI
 * Theme: Hand in front of multiple shades of green mood boxes
 */

import { createClient } from '@supabase/supabase-js'
import { generateBackgrounds } from '../src/lib/ai/gemini'
import { uploadFile } from '../src/lib/storage'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
  console.log('🎨 Generating Background for Greenworld with Gemini AI\n')
  console.log('='.repeat(60))

  // Get Greenworld category
  const { data: category, error: catError } = await supabase
    .from('categories')
    .select('id, name, slug, look_and_feel, user_id')
    .eq('slug', 'greenworld')
    .single()

  if (catError || !category) {
    console.error('\n❌ Greenworld category not found')
    process.exit(1)
  }

  console.log(`\n✅ Category: ${category.name}`)
  console.log(`   Slug: ${category.slug}`)
  console.log(`   Look & Feel: ${category.look_and_feel || '(not set)'}`)

  // Generate background with specific prompt
  console.log('\n🎨 Generating background with Gemini AI...')
  console.log('   Prompt: Hand in front of multiple shades of green mood boxes')
  console.log('   Style: Fresh, organic, green aesthetic\n')

  const userPrompt = `Create a professional product photography background showing a hand delicately positioned in front of multiple mood boxes or color swatches in various shades of green.

The composition should include:
- A human hand (natural skin tone, well-lit) gracefully positioned in the foreground
- Multiple rectangular or square mood boxes/color swatches behind the hand
- Various shades of green: forest green, mint green, sage green, olive green, lime green, emerald green
- Soft, professional lighting with gentle shadows
- Clean, modern aesthetic suitable for organic/natural product photography
- The mood boxes should be arranged artistically, creating depth and visual interest
- Fresh, vibrant feeling that evokes nature, growth, and sustainability

This will be used as a background for organic product photography.`

  const backgrounds = await generateBackgrounds(
    userPrompt,
    category.look_and_feel || 'Fresh, organic, green aesthetic',
    1 // Generate 1 background
  )

  if (!backgrounds || backgrounds.length === 0) {
    console.error('❌ Failed to generate background')
    process.exit(1)
  }

  const bg = backgrounds[0]
  console.log(`✅ Background generated successfully`)
  console.log(`   Image size: ${bg.imageData.length} bytes`)
  console.log(`   MIME type: ${bg.mimeType}\n`)

  // Upload to Google Drive
  console.log('☁️  Uploading to Google Drive...')
  const base64Data = bg.imageData.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const fileExt = bg.mimeType.split('/')[1] || 'jpg'
  const timestamp = Date.now()
  const fileName = `${category.slug}/backgrounds/green-mood-boxes-hand_${timestamp}.${fileExt}`

  console.log(`   Uploading to: ${fileName}`)
  console.log(`   File size: ${buffer.length} bytes`)

  const storageFile = await uploadFile(buffer, fileName, {
    contentType: bg.mimeType,
    provider: 'gdrive'
  })

  console.log(`   ✅ Uploaded successfully`)
  console.log(`   📁 Storage path: ${storageFile.path}`)
  console.log(`   🔗 Public URL: ${storageFile.publicUrl}`)
  console.log(`   🆔 File ID: ${storageFile.fileId}\n`)

  // Save to database
  console.log('💾 Saving to database...')
  const { data: background, error: dbError } = await supabase
    .from('backgrounds')
    .insert({
      category_id: category.id,
      user_id: category.user_id,
      name: 'Green Mood Boxes with Hand',
      slug: `green-mood-boxes-hand-${timestamp}`,
      description: 'Professional background showing hand in front of various shades of green mood boxes',
      prompt_used: bg.promptUsed,
      storage_provider: 'gdrive',
      storage_path: storageFile.path,
      storage_url: storageFile.publicUrl,
      gdrive_file_id: storageFile.fileId || null,
      metadata: {
        theme: 'green-mood-boxes',
        elements: ['hand', 'mood-boxes', 'green-shades'],
        generated_with: 'gemini-3-pro-image-preview'
      }
    })
    .select()
    .single()

  if (dbError) {
    console.error('   ❌ Database error:', dbError)
    process.exit(1)
  }

  console.log(`   ✅ Saved to database`)
  console.log(`   🆔 Background ID: ${background.id}`)
  console.log(`   📝 Name: ${background.name}`)
  console.log(`   🔗 Slug: ${background.slug}`)

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('✅ Background Created Successfully with Gemini AI!')
  console.log('='.repeat(60))
  console.log('\n📁 Google Drive Location:')
  console.log(`   ${storageFile.path}`)
  console.log('\n🔗 View in Google Drive:')
  console.log(`   ${storageFile.publicUrl}`)
  console.log('\n💾 Database:')
  console.log(`   Table: backgrounds`)
  console.log(`   ID: ${background.id}`)
  console.log('\n✨ This background is now ready to use!')
  console.log('   - Available in Google Drive')
  console.log('   - Stored in Supabase database')
  console.log('   - Will be visible in Phase 3 UI')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    if (error.message) {
      console.error('   Message:', error.message)
    }
    if (error.stack) {
      console.error('\n   Stack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  })
