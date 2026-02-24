/**
 * Reset backgrounds and generate multi-format versions
 * 1. Delete all format-specific backgrounds
 * 2. Keep the original background in main folder
 * 3. Generate new backgrounds in all formats using Gemini REST API
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Readable } from 'stream'

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

async function generateBackgroundWithGemini(format, width, height, categoryLookAndFeel) {
  console.log(`\n🎨 Generating ${format} background (${width}x${height})...`)

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

  const prompt = `Generate a high-quality product photography background in ${format} aspect ratio with the following characteristics:

Category Style: ${categoryLookAndFeel}
User Request: Colorful, vibrant, playful background with soft bokeh effect and bright pastel colors

CRITICAL INSTRUCTIONS:
- This is ONLY a background — no products, no text, no logos, no watermarks
- The background should complement a product that will be composited on top later
- Leave clear space in the center/foreground for a product to be placed
- Match the lighting style to the category aesthetic
- Professional, studio-quality output suitable for e-commerce
- Aspect ratio: ${format} (strictly enforced)
- The scene should feel natural and inviting
- Consider depth of field, lighting, and composition
- Make it visually appealing and aligned with modern product photography trends

Return a professional product photography background.`

  const requestBody = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
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

  console.log(`   ✅ Generated ${format} image successfully`)

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

async function resetAndGenerate() {
  console.log('🔄 Reset and Generate Multi-Format Backgrounds\n')
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
    console.log('   Look & Feel:', cat.look_and_feel)

    // Step 1: Delete all format-specific backgrounds from database
    console.log('\n🗑️  Step 1: Deleting format-specific backgrounds...')
    const deleted = await sql`
      DELETE FROM backgrounds
      WHERE category_id = ${cat.id}
      AND storage_path LIKE '%/1x1/%'
         OR storage_path LIKE '%/16x9/%'
         OR storage_path LIKE '%/9x16/%'
         OR storage_path LIKE '%/4x5/%'
      RETURNING id, name, storage_path
    `

    console.log(`   ✅ Deleted ${deleted.length} backgrounds from database`)
    deleted.forEach(bg => {
      console.log(`      - ${bg.name} (${bg.storage_path})`)
    })

    // Step 2: Find backgrounds folder
    console.log('\n📁 Step 2: Finding backgrounds folder...')
    const backgroundsFolder = await findFolder('backgrounds', cat.gdrive_folder_id)
    if (!backgroundsFolder) {
      throw new Error('backgrounds/ folder not found')
    }
    console.log('   ✓ Found backgrounds/ folder')

    // Step 3: Generate backgrounds in all formats
    console.log('\n🎨 Step 3: Generating multi-format backgrounds...')

    const results = []
    for (const formatConfig of FORMATS) {
      try {
        // Generate with Gemini
        const generated = await generateBackgroundWithGemini(
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
        const slug = generateSlug(`vibrant-pastel-${formatConfig.format}`)
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
            ${'Vibrant Pastel ' + formatConfig.format},
            ${slug + '-' + Date.now()},
            ${'Generated background for ' + formatConfig.description},
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

        console.log(`   ✅ Saved ${formatConfig.format} background to database`)
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
      console.log(`   - ${r.format}: Generated, uploaded, and saved`)
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

    console.log('\n🎉 Reset and regeneration complete!')
    console.log('📝 Next: Use these backgrounds to create composites with guardrails/zones')
    console.log('📝 Then: Add Hooks and CTAs within safe zones')

    return failed.length === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

resetAndGenerate().then(exitCode => {
  process.exit(exitCode)
})
