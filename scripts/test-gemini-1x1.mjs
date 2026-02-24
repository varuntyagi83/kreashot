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

const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

// Get the product and product image
const { data: product } = await supabase
  .from('products')
  .select('id')
  .eq('category_id', categoryId)
  .single()

const { data: productImage } = await supabase
  .from('product_images')
  .select('gdrive_file_id')
  .eq('product_id', product.id)
  .single()

// Download the base product image
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

const response = await drive.files.get(
  {
    fileId: productImage.gdrive_file_id,
    alt: 'media',
  },
  { responseType: 'arraybuffer' }
)

const baseImageBuffer = Buffer.from(response.data)
const baseImageBase64 = baseImageBuffer.toString('base64')

console.log('Testing Gemini API with 1:1 aspect ratio...\n')

const prompt = `Generate a front view of this product.
Product photography on clean background, professional lighting, maintain product details.`

const geminiResponse = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GOOGLE_GEMINI_API_KEY}`,
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
          aspectRatio: '1:1',
          imageSize: '2K'
        }
      }
    })
  }
)

const geminiData = await geminiResponse.json()

console.log('Gemini Response:')
console.log(JSON.stringify(geminiData, null, 2))

if (geminiData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
  console.log('\n✅ Image data received!')
  console.log('Data length:', geminiData.candidates[0].content.parts[0].inlineData.data.length)
} else {
  console.log('\n❌ No image data in response')
}
