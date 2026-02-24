/**
 * CORRECT APPROACH:
 * 1. Delete backgrounds ONLY from format-specific folders (4x5, 9x16, 16x9, 1x1)
 * 2. Keep the base image in main backgrounds/ folder
 * 3. Download the base image
 * 4. Use it to generate variations in all aspect ratios
 * 5. Save variations to respective folders
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Readable } from 'stream'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

const FORMATS = [
  { format: '1:1', width: 1080, height: 1080, folder: '1x1', description: 'Instagram Square' },
  { format: '16:9', width: 1920, height: 1080, folder: '16x9', description: 'Facebook Landscape' },
  { format: '9:16', width: 1080, height: 1920, folder: '9x16', description: 'Stories Portrait' },
  { format: '4:5', width: 1080, height: 1350, folder: '4x5', description: 'Instagram Portrait' }
]

async function findFolder(name, parentId) {
  const response = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  })
  return response.data.files?.[0]
}

async function downloadImageFromGDrive(fileId) {
  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(response.data)
}

async function uploadToGoogleDrive(buffer, fileName, folderId, mimeType) {
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
    mimeType: mimeType
  }

  const media = {
    mimeType: mimeType,
    body: Readable.from(buffer)
  }

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
    supportsAllDrives: true
  })

  const publicUrl = `https://drive.google.com/thumbnail?id=${file.data.id}&sz=w2000`

  return {
    fileId: file.data.id,
    publicUrl: publicUrl,
    path: fileName
  }
}

async function generateVariationWithGemini(baseImageBuffer, format, width, height, categoryLookAndFeel) {
  console.log(`\n🎨 Generating ${format} variation (${width}x${height})...`)

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

  // Convert buffer to base64
  const baseImageBase64 = baseImageBuffer.toString('base64')

  const prompt = `Create a variation of this background image in ${format} aspect ratio.

CRITICAL INSTRUCTIONS:
- Maintain the SAME style, colors, and aesthetic as the original image
- This is a product photography background - keep it clean and suitable for placing products on top
- Adapt the composition to fit the ${format} aspect ratio naturally
- Preserve the soft, pastel, colorful bokeh effect
- Do NOT add any products, text, logos, or watermarks
- Professional, studio-quality output

Return a background variation that matches the original's style.`

  const requestBody = {
    contents: [{
      parts: [
        {
          text: prompt
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: baseImageBase64
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.4,  // Lower temperature for more consistency with original
      topP: 0.9,
      maxOutputTokens: 32768,
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: format,
        imageSize: '2K'
      }
    }
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()

  if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
    throw new Error('No image in response')
  }

  const generatedBase64 = data.candidates[0].content.parts[0].inlineData.data
  const generatedMimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/jpeg'

  console.log(`   ✅ Generated ${format} variation successfully`)

  return {
    base64: generatedBase64,
    mimeType: generatedMimeType,
    promptUsed: prompt
  }
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function deleteAndRegenerate() {
  console.log('🔄 Delete Format Backgrounds & Regenerate from Base\n')
  console.log('='.repeat(60))

  try {
    // Get category
    const category = await sql`
      SELECT id, slug, name, look_and_feel, gdrive_folder_id
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    const cat = category[0]
    console.log('\n📂 Category:', cat.name)

    // Step 1: Get the base image (in main backgrounds folder)
    console.log('\n📥 Step 1: Finding base image...')
    const baseBackground = await sql`
      SELECT id, name, storage_path, gdrive_file_id, storage_url
      FROM backgrounds
      WHERE category_id = ${cat.id}
      AND storage_path NOT LIKE '%/1x1/%'
      AND storage_path NOT LIKE '%/16x9/%'
      AND storage_path NOT LIKE '%/9x16/%'
      AND storage_path NOT LIKE '%/4x5/%'
      AND storage_path LIKE '%.jpg'
      LIMIT 1
    `

    if (baseBackground.length === 0) {
      throw new Error('No base background found in main folder')
    }

    const base = baseBackground[0]
    console.log(`   ✓ Found base: ${base.name}`)
    console.log(`   Path: ${base.storage_path}`)
    console.log(`   GDrive ID: ${base.gdrive_file_id}`)

    // Step 2: Download base image
    console.log('\n📥 Step 2: Downloading base image...')
    const baseImageBuffer = await downloadImageFromGDrive(base.gdrive_file_id)
    console.log(`   ✓ Downloaded (${(baseImageBuffer.length / 1024).toFixed(2)} KB)`)

    // Step 3: Delete ONLY format-specific backgrounds
    console.log('\n🗑️  Step 3: Deleting format-specific backgrounds...')
    const deleted = await sql`
      DELETE FROM backgrounds
      WHERE category_id = ${cat.id}
      AND (
        storage_path LIKE '%/1x1/%'
        OR storage_path LIKE '%/16x9/%'
        OR storage_path LIKE '%/9x16/%'
        OR storage_path LIKE '%/4x5/%'
      )
      RETURNING id, name, storage_path
    `

    console.log(`   ✅ Deleted ${deleted.length} format-specific backgrounds`)
    deleted.forEach(bg => {
      console.log(`      - ${bg.name} (${bg.storage_path})`)
    })

    // Step 4: Find backgrounds folder
    console.log('\n📁 Step 4: Finding backgrounds folder...')
    const backgroundsFolder = await findFolder('backgrounds', cat.gdrive_folder_id)
    if (!backgroundsFolder) {
      throw new Error('backgrounds/ folder not found')
    }
    console.log('   ✓ Found backgrounds/ folder')

    // Step 5: Generate variations in all formats
    console.log('\n🎨 Step 5: Generating variations from base image...')

    const results = []
    for (const formatConfig of FORMATS) {
      try {
        // Generate variation using base image
        const generated = await generateVariationWithGemini(
          baseImageBuffer,
          formatConfig.format,
          formatConfig.width,
          formatConfig.height,
          cat.look_and_feel
        )

        // Find format folder
        const formatFolder = await findFolder(formatConfig.folder, backgroundsFolder.id)
        if (!formatFolder) {
          throw new Error(`Format folder ${formatConfig.folder}/ not found`)
        }

        // Convert to buffer
        const buffer = Buffer.from(generated.base64, 'base64')

        // Upload to Google Drive
        const slug = generateSlug(`colorful-bright-${formatConfig.format}`)
        const fileName = `${slug}_${Date.now()}.jpg`

        console.log(`   📤 Uploading to: backgrounds/${formatConfig.folder}/${fileName}`)

        const uploadResult = await uploadToGoogleDrive(
          buffer,
          fileName,
          formatFolder.id,
          generated.mimeType
        )

        // Save to database
        const dbResult = await sql`
          INSERT INTO backgrounds (
            category_id, user_id, name, slug, description, prompt_used,
            format, width, height,
            storage_provider, storage_path, storage_url, gdrive_file_id, metadata
          ) VALUES (
            ${cat.id},
            (SELECT user_id FROM categories WHERE id = ${cat.id}),
            ${'Colorful Bright ' + formatConfig.format},
            ${slug + '-' + Date.now()},
            ${'Variation of base background for ' + formatConfig.description},
            ${generated.promptUsed},
            ${formatConfig.format},
            ${formatConfig.width},
            ${formatConfig.height},
            'gdrive',
            ${'gummy-bear/backgrounds/' + formatConfig.folder + '/' + fileName},
            ${uploadResult.publicUrl},
            ${uploadResult.fileId},
            '{}'::jsonb
          )
          RETURNING id, name, format, width, height
        `

        console.log(`   ✅ Saved ${formatConfig.format} variation to database`)
        console.log(`      ID: ${dbResult[0].id}`)

        results.push({
          format: formatConfig.format,
          success: true,
          id: dbResult[0].id
        })

      } catch (error) {
        console.error(`   ❌ Error for ${formatConfig.format}:`, error.message)
        results.push({
          format: formatConfig.format,
          success: false,
          error: error.message
        })
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))

    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    console.log(`✅ Successfully generated: ${successful.length}/${FORMATS.length}`)
    successful.forEach(r => {
      console.log(`   - ${r.format}: Variation created and saved`)
    })

    if (failed.length > 0) {
      console.log(`\n❌ Failed: ${failed.length}/${FORMATS.length}`)
      failed.forEach(r => {
        console.log(`   - ${r.format}: ${r.error}`)
      })
    }

    // Verify database
    console.log('\n📊 Final database state:')
    const dbBackgrounds = await sql`
      SELECT format, COUNT(*) as count, AVG(width) as avg_width, AVG(height) as avg_height
      FROM backgrounds
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `

    dbBackgrounds.forEach(row => {
      console.log(`   ${row.format}: ${row.count} backgrounds (${Math.round(row.avg_width)}x${Math.round(row.avg_height)})`)
    })

    console.log('\n🎉 Regeneration complete!')
    console.log('📝 Base image preserved in main backgrounds/ folder')
    console.log('📝 Variations saved in format-specific folders')

    return failed.length === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

deleteAndRegenerate().then(exitCode => {
  process.exit(exitCode)
})
