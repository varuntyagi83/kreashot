import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import dotenv from 'dotenv'
import fetch from 'node-fetch'
import { Readable } from 'stream'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

// Initialize Google Drive
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

// Angle configurations - OPTIMIZED FOR GEMINI
const ANGLES = [
  {
    name: 'front',
    description: 'Front view',
    prompt: 'Straight front view, camera centered. Product stays identical: same text, logo, colors, design, cap. Only camera angle changes.'
  },
  {
    name: 'three_quarter_right',
    description: 'Three-quarter view from right',
    prompt: 'Camera positioned 45° clockwise from front, showing RIGHT side panel clearly visible. Product stays identical: same text, logo, colors, design, cap. Only camera angle changes.'
  },
  {
    name: 'three_quarter_left',
    description: 'Three-quarter view from left',
    prompt: 'Camera positioned 45° counter-clockwise from front, showing LEFT side panel clearly visible. Product stays identical: same text, logo, colors, design, cap. Only camera angle changes.'
  },
  {
    name: 'right_side',
    description: 'Right side view',
    prompt: 'Camera 90° to the right side, showing ONLY the right panel (not front). Product stays identical: same text, logo, colors, design, cap. Only camera angle changes.'
  },
  {
    name: 'left_side',
    description: 'Left side view',
    prompt: 'Camera 90° to the left side, showing ONLY the left panel (not front). Product stays identical: same text, logo, colors, design, cap. Only camera angle changes.'
  },
  {
    name: 'top_45deg',
    description: 'Top view at 45 degrees',
    prompt: 'Camera elevated 45° above, looking DOWN showing top of jar and front label. Product stays identical: same text, logo, colors, design, cap closed. Only camera angle changes.'
  },
  {
    name: 'isometric',
    description: 'Isometric view',
    prompt: 'Isometric angle showing top, front AND right side simultaneously at 45°. Product stays identical: same text, logo, colors, design, cap. Only camera angle changes.'
  },
]

// Get user, category, product, and product image
const { data: category } = await supabase
  .from('categories')
  .select('id, slug, user_id')
  .eq('id', categoryId)
  .single()

const { data: product } = await supabase
  .from('products')
  .select('id, slug')
  .eq('category_id', categoryId)
  .single()

const { data: productImage } = await supabase
  .from('product_images')
  .select('id, file_name, gdrive_file_id')
  .eq('product_id', product.id)
  .single()

// Download base image
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
console.log(`   ✓ Downloaded (${(baseImageBuffer.length / 1024).toFixed(2)} KB)\n`)

// Helper function to create folder structure in Google Drive
async function getOrCreateFolder(path) {
  const pathParts = path.split('/').filter(Boolean)
  const folders = pathParts.slice(0, -1)

  let currentFolderId = folderId

  for (const folderName of folders) {
    const { data } = await drive.files.list({
      q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (data.files && data.files.length > 0) {
      currentFolderId = data.files[0].id
    } else {
      const { data: folder } = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentFolderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      })
      currentFolderId = folder.id
    }
  }

  return currentFolderId
}

// Generate and save each angle
for (const angle of ANGLES) {
  console.log(`🎨 Generating ${angle.name}...`)

  try {
    // Generate image with Gemini
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: angle.prompt },
              { inlineData: { mimeType: 'image/jpeg', data: baseImageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.85,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: '1:1',
              imageSize: '1K'
            }
          }
        })
      }
    )

    const geminiData = await geminiResponse.json()

    if (!geminiData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      console.error(`   ❌ No image data for ${angle.name}`)
      continue
    }

    const imageDataBase64 = geminiData.candidates[0].content.parts[0].inlineData.data
    const imageBuffer = Buffer.from(imageDataBase64, 'base64')

    // Upload to Google Drive
    const imageNameWithoutExt = productImage.file_name.replace(/\.[^/.]+$/, '')
    const fileName = `${category.slug}/${product.slug}/product-images/${imageNameWithoutExt}-angled-shots/1x1/${angle.name}.jpeg`
    const parentFolderId = await getOrCreateFolder(fileName)
    const justFileName = fileName.split('/').pop()

    const stream = Readable.from(imageBuffer)

    const { data: uploadedFile } = await drive.files.create({
      requestBody: {
        name: justFileName,
        parents: [parentFolderId],
        mimeType: 'image/jpeg',
      },
      media: {
        mimeType: 'image/jpeg',
        body: stream,
      },
      fields: 'id, name, size',
      supportsAllDrives: true,
    })

    // Make publicly accessible
    await drive.permissions.create({
      fileId: uploadedFile.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    })

    const publicUrl = `https://drive.google.com/thumbnail?id=${uploadedFile.id}&sz=w2000`

    // Save to database
    const { error: dbError } = await supabase
      .from('angled_shots')
      .insert({
        product_id: product.id,
        product_image_id: productImage.id,
        category_id: categoryId,
        user_id: category.user_id,
        angle_name: angle.name,
        angle_description: angle.description,
        prompt_used: angle.prompt,
        format: '1:1',
        storage_provider: 'gdrive',
        storage_path: fileName,
        storage_url: publicUrl,
        gdrive_file_id: uploadedFile.id,
        metadata: {},
      })

    if (dbError) {
      console.error(`   ❌ DB error for ${angle.name}:`, dbError.message)
    } else {
      console.log(`   ✅ Saved ${angle.name}`)
    }

  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`)
  }
}

console.log('\n✅ Done!')
