import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import dotenv from 'dotenv'
import fetch from 'node-fetch'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

// Angle configurations
const ANGLES = [
  { name: 'front', description: 'Front view', prompt: 'Product facing camera directly, centered, front view' },
  { name: 'three_quarter_right', description: 'Three-quarter view from right', prompt: 'Product at 45-degree angle from right side' },
  { name: 'three_quarter_left', description: 'Three-quarter view from left', prompt: 'Product at 45-degree angle from left side' },
  { name: 'right_30deg', description: 'Right side at 30 degrees', prompt: 'Product rotated 30 degrees showing right side' },
  { name: 'left_30deg', description: 'Left side at 30 degrees', prompt: 'Product rotated 30 degrees showing left side' },
  { name: 'top_45deg', description: 'Top view, 45 degree angle', prompt: 'Product viewed from above at 45-degree angle' },
  { name: 'isometric', description: 'Isometric view', prompt: 'Product in isometric perspective view' },
]

console.log('🗑️  Step 1: Deleting existing 1:1 angled shots...\n')

// Get all 1:1 angled shots
const { data: existingShots, error: fetchError } = await supabase
  .from('angled_shots')
  .select('id, gdrive_file_id')
  .eq('category_id', categoryId)
  .eq('format', '1:1')

if (fetchError) {
  console.error('Error fetching existing shots:', fetchError)
  process.exit(1)
}

console.log(`Found ${existingShots.length} existing 1:1 angled shots`)

// Delete from database (will trigger deletion queue for Google Drive)
const { error: deleteError } = await supabase
  .from('angled_shots')
  .delete()
  .eq('category_id', categoryId)
  .eq('format', '1:1')

if (deleteError) {
  console.error('Error deleting shots:', deleteError)
  process.exit(1)
}

console.log('✅ Deleted all 1:1 angled shots from database\n')

console.log('🎨 Step 2: Generating NEW 1:1 angled shots with Gemini...\n')

// Get the product and product image
const { data: product, error: productError } = await supabase
  .from('products')
  .select('id, slug')
  .eq('category_id', categoryId)
  .single()

if (productError || !product) {
  console.error('Error fetching product:', productError)
  process.exit(1)
}

const { data: productImage, error: imageError } = await supabase
  .from('product_images')
  .select('id, gdrive_file_id')
  .eq('product_id', product.id)
  .single()

if (imageError || !productImage) {
  console.error('Error fetching product image:', imageError)
  process.exit(1)
}

// Download the base product image from Google Drive
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

console.log('📥 Downloading base product image...')
const response = await drive.files.get(
  {
    fileId: productImage.gdrive_file_id,
    alt: 'media',
  },
  { responseType: 'arraybuffer' }
)

const baseImageBuffer = Buffer.from(response.data)
const baseImageBase64 = baseImageBuffer.toString('base64')

console.log(`   ✓ Downloaded base image (${(baseImageBuffer.length / 1024).toFixed(2)} KB)\n`)

// Generate each angle
for (const angle of ANGLES) {
  console.log(`🎨 Generating ${angle.name}...`)

  const prompt = `Generate a ${angle.description} of this product. ${angle.prompt}.
Product photography on clean background, professional lighting, maintain product details.`

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: baseImageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: '1:1', // SQUARE format
              imageSize: '2K'
            }
          }
        })
      }
    )

    const geminiData = await geminiResponse.json()

    if (!geminiData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      console.error(`   ❌ No image data in response for ${angle.name}`)
      continue
    }

    const imageData = geminiData.candidates[0].content.parts[0].inlineData.data

    // Save to database via API
    const saveResponse = await fetch(
      `http://localhost:3000/api/categories/${categoryId}/angled-shots`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productImageId: productImage.id,
          angleName: angle.name,
          angleDescription: angle.description,
          promptUsed: prompt,
          imageData: `data:image/jpeg;base64,${imageData}`,
          mimeType: 'image/jpeg',
          format: '1:1'
        })
      }
    )

    if (saveResponse.ok) {
      console.log(`   ✅ Generated and saved ${angle.name}`)
    } else {
      const errorData = await saveResponse.json()
      console.error(`   ❌ Failed to save ${angle.name}:`, errorData.error)
    }

  } catch (err) {
    console.error(`   ❌ Error generating ${angle.name}:`, err.message)
  }
}

console.log('\n✅ Finished regenerating 1:1 angled shots!')
