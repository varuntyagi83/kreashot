#!/usr/bin/env tsx
/**
 * Create a test background for Gummy Bear category
 * Demonstrates folder structure: gummy-bear/backgrounds/
 */

import { createClient } from '@supabase/supabase-js'
import { uploadFile } from '../src/lib/storage'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const geminiApiKey = process.env.GEMINI_API_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function generateBackgroundWithGemini(
  prompt: string,
  lookAndFeel: string
): Promise<{ promptUsed: string; imageData: string; mimeType: string }> {
  const fullPrompt = `Generate a high-quality product photography background with the following characteristics:

Category Look & Feel: ${lookAndFeel}
User Request: ${prompt}

Create a professional, clean background suitable for product photography. The background should complement the products without overpowering them.`

  console.log('   Calling Gemini API...')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: fullPrompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: '' // Empty for text-to-image generation
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95
        }
      })
    }
  )

  const data = await response.json()

  if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
    // Gemini might not support direct image generation, create a placeholder
    console.log('   ⚠️  Using placeholder image (Gemini API limitation)')

    // Create a simple colored rectangle as a placeholder
    const canvas = Buffer.from(
      '<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="1024" height="1024" fill="#FFE4B5"/>' +
      '<text x="50%" y="50%" text-anchor="middle" font-size="48" fill="#8B4513">Warm Background</text>' +
      '</svg>'
    )

    return {
      promptUsed: fullPrompt,
      imageData: `data:image/svg+xml;base64,${canvas.toString('base64')}`,
      mimeType: 'image/svg+xml'
    }
  }

  const imageData = data.candidates[0].content.parts[0].inlineData.data
  const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType

  return {
    promptUsed: fullPrompt,
    imageData: `data:${mimeType};base64,${imageData}`,
    mimeType
  }
}

async function main() {
  console.log('🎨 Creating Background for Gummy Bear Category\n')
  console.log('='.repeat(60))

  // Get Gummy Bear category
  const { data: category, error: catError } = await supabase
    .from('categories')
    .select('id, name, slug, look_and_feel, user_id')
    .eq('slug', 'gummy-bear')
    .single()

  if (catError || !category) {
    console.error('\n❌ Gummy Bear category not found')
    process.exit(1)
  }

  console.log(`\n✅ Category: ${category.name}`)
  console.log(`   Slug: ${category.slug}`)
  console.log(`   Look & Feel: ${category.look_and_feel || '(not set)'}`)

  // Generate background
  console.log('\n🎨 Generating background...')
  const bg = await generateBackgroundWithGemini(
    'Professional product photography background with warm, vibrant colors',
    category.look_and_feel || 'Modern, clean'
  )

  console.log(`   ✅ Generated (${bg.imageData.length} bytes)`)

  // Upload to Google Drive
  console.log('\n☁️  Uploading to Google Drive...')
  const base64Data = bg.imageData.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const fileExt = bg.mimeType.split('/')[1]?.replace('+xml', '') || 'jpg'
  const timestamp = Date.now()
  const fileName = `${category.slug}/backgrounds/warm-vibrant-bg_${timestamp}.${fileExt}`

  const storageFile = await uploadFile(buffer, fileName, {
    contentType: bg.mimeType,
    provider: 'gdrive'
  })

  console.log(`   ✅ Uploaded successfully`)
  console.log(`   📁 Storage path: ${storageFile.path}`)
  console.log(`   🔗 Public URL: ${storageFile.publicUrl}`)
  console.log(`   🆔 File ID: ${storageFile.fileId}`)

  // Save to database
  console.log('\n💾 Saving to database...')
  const { data: background, error: dbError } = await supabase
    .from('backgrounds')
    .insert({
      category_id: category.id,
      user_id: category.user_id,
      name: 'Warm Vibrant Background',
      slug: `warm-vibrant-bg-${timestamp}`,
      description: 'Professional product photography background with warm, vibrant colors',
      prompt_used: bg.promptUsed,
      storage_provider: 'gdrive',
      storage_path: storageFile.path,
      storage_url: storageFile.publicUrl,
      gdrive_file_id: storageFile.fileId || null,
      metadata: {}
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

  // Verification
  console.log('\n' + '='.repeat(60))
  console.log('✅ Background Created Successfully!')
  console.log('='.repeat(60))
  console.log('\n📁 Google Drive Folder Structure:')
  console.log(`   ${category.slug}/`)
  console.log(`   └── backgrounds/`)
  console.log(`       └── ${path.basename(storageFile.path)}`)
  console.log('\nThis background will persist in:')
  console.log('   - Google Drive (visible in AdForge Shared Drive)')
  console.log('   - Supabase database (backgrounds table)')
  console.log('\n✨ Ready to use in Phase 3 UI!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error)
    process.exit(1)
  })
