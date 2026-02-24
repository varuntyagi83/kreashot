/**
 * Phase 2.5: Generate Multi-Format Angled Shots using Gemini
 *
 * Takes existing 1:1 angled shots and generates 16:9, 9:16, 4:5 variations
 * using Gemini's intelligent aspect ratio conversion
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { Readable } from 'stream'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

// Google Drive Service Account configuration
const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL
const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

// Gemini API configuration
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

// Format configurations
const FORMATS = [
  { name: '16:9', width: 1920, height: 1080, aspectRatio: '16:9', size: '2K' },
  { name: '9:16', width: 1080, height: 1920, aspectRatio: '9:16', size: '2K' },
  { name: '4:5', width: 1080, height: 1350, aspectRatio: '4:5', size: '2K' }
]

/**
 * Download image from Google Drive and convert to base64
 */
async function downloadImageAsBase64(fileId) {
  try {
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: 'media'
      },
      {
        responseType: 'arraybuffer',
        supportsAllDrives: true
      }
    )

    const buffer = Buffer.from(response.data)
    const base64 = buffer.toString('base64')

    return base64
  } catch (error) {
    console.error(`Error downloading file ${fileId}:`, error.message)
    throw error
  }
}

/**
 * Generate new aspect ratio version using Gemini
 */
async function generateFormatVariation(base64Image, targetFormat) {
  try {
    const requestBody = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: `Create a variation of this product image in ${targetFormat.aspectRatio} aspect ratio without changing any design details, product appearance, or causing distortion. Extend the image naturally to fit the new aspect ratio while keeping the product perfectly centered and undistorted. Return a high-quality image.`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.4,  // Lower temperature for more consistent results
        topP: 0.95,
        maxOutputTokens: 32768,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: targetFormat.aspectRatio,
          imageSize: targetFormat.size
        }
      }
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // Extract base64 image from response
    if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      return data.candidates[0].content.parts[0].inlineData.data
    }

    throw new Error('No image data in Gemini response')
  } catch (error) {
    console.error(`Error generating ${targetFormat.aspectRatio} variation:`, error.message)
    throw error
  }
}

/**
 * Upload image to Google Drive
 */
async function uploadToGoogleDrive(base64Data, fileName, parentFolderId) {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    const stream = Readable.from(buffer)

    const fileMetadata = {
      name: fileName,
      parents: [parentFolderId],
      mimeType: 'image/jpeg'
    }

    const media = {
      mimeType: 'image/jpeg',
      body: stream
    }

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true
    })

    // Make file accessible
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      },
      supportsAllDrives: true
    })

    const publicUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`

    return {
      fileId: file.data.id,
      webViewLink: file.data.webViewLink,
      publicUrl: publicUrl
    }
  } catch (error) {
    console.error(`Error uploading ${fileName}:`, error.message)
    throw error
  }
}

/**
 * Find or create a folder
 */
async function findOrCreateFolder(name, parentId) {
  try {
    const response = await drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id
    }

    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    }

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true
    })

    console.log(`  ✓ Created folder: ${name}`)
    return folder.data.id
  } catch (error) {
    console.error(`Error with folder ${name}:`, error.message)
    throw error
  }
}

/**
 * Create format-specific folder structure for angled shots
 */
async function createAngledShotsFolders(categoryFolderId) {
  console.log('\n📁 Creating angled-shots folder structure...')

  const angledShotsFolder = await findOrCreateFolder('angled-shots', categoryFolderId)
  console.log('  ✓ angled-shots/')

  const formatFolders = {}

  // Create format subfolders
  formatFolders['1x1'] = await findOrCreateFolder('1x1', angledShotsFolder)
  for (const format of FORMATS) {
    formatFolders[format.name] = await findOrCreateFolder(format.name, angledShotsFolder)
  }

  console.log('  ✓ All format folders created\n')
  return { root: angledShotsFolder, formats: formatFolders }
}

/**
 * Main function to generate multi-format angled shots
 */
async function generateMultiFormatAngledShots() {
  console.log('🎨 Phase 2.5: Generate Multi-Format Angled Shots')
  console.log('='.repeat(60))
  console.log('\nUsing Gemini to intelligently convert 1:1 angled shots')
  console.log('to 16:9, 9:16, and 4:5 aspect ratios\n')

  try {
    // Get category folder ID
    const category = await sql`
      SELECT id, name, slug, gdrive_folder_id
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    if (!category || !category[0]) {
      throw new Error('Gummy Bear category not found')
    }

    const categoryData = category[0]
    console.log('Category:', categoryData.name)
    console.log('Google Drive Folder:', categoryData.gdrive_folder_id)

    // Create angled-shots folder structure with format subfolders
    const angledShotsFolders = await createAngledShotsFolders(categoryData.gdrive_folder_id)

    // Get all 1:1 angled shots (originals)
    const angledShots = await sql`
      SELECT id, angle_name, storage_path, storage_url, gdrive_file_id, product_image_id, product_id, category_id, user_id
      FROM angled_shots
      WHERE format = '1:1'
        AND source_angled_shot_id IS NULL
        AND gdrive_file_id IS NOT NULL
      ORDER BY created_at
    `

    console.log(`\nFound ${angledShots.length} original 1:1 angled shots to convert\n`)

    let totalGenerated = 0
    let errors = 0

    for (const angledShot of angledShots) {
      console.log('=' .repeat(60))
      console.log(`Processing: ${angledShot.angle_name}`)
      console.log('Original ID:', angledShot.id)
      console.log('Storage Path:', angledShot.storage_path)

      try {
        // Download original image
        console.log('\n1. Downloading original 1:1 image...')
        const base64Image = await downloadImageAsBase64(angledShot.gdrive_file_id)
        console.log('   ✓ Downloaded')

        // Generate each format variation
        for (const format of FORMATS) {
          console.log(`\n2. Generating ${format.aspectRatio} variation with Gemini...`)

          try {
            const newImageBase64 = await generateFormatVariation(base64Image, format)
            console.log(`   ✓ Generated ${format.aspectRatio} image`)

            // Upload to Google Drive (to format-specific folder)
            console.log('   → Uploading to Google Drive...')
            const fileName = `${angledShot.angle_name}_${format.name}_${Date.now()}.jpg`
            const targetFolderId = angledShotsFolders.formats[format.name]
            const uploadResult = await uploadToGoogleDrive(
              newImageBase64,
              fileName,
              targetFolderId
            )
            console.log(`   ✓ Uploaded to angled-shots/${format.name}/${fileName}`)

            // Save to database
            console.log('   → Saving to database...')
            const storagePath = `${categoryData.slug}/angled-shots/${format.name}/${fileName}`

            const newAngledShot = await sql`
              INSERT INTO angled_shots (
                product_id,
                category_id,
                user_id,
                product_image_id,
                angle_name,
                format,
                width,
                height,
                source_angled_shot_id,
                storage_provider,
                storage_path,
                storage_url,
                gdrive_file_id
              ) VALUES (
                ${angledShot.product_id},
                ${angledShot.category_id},
                ${angledShot.user_id},
                ${angledShot.product_image_id},
                ${angledShot.angle_name},
                ${format.name},
                ${format.width},
                ${format.height},
                ${angledShot.id},
                'gdrive',
                ${storagePath},
                ${uploadResult.publicUrl},
                ${uploadResult.fileId}
              )
              RETURNING id, angle_name, format
            `

            console.log(`   ✓ Saved to database (ID: ${newAngledShot[0].id})`)
            totalGenerated++

          } catch (formatError) {
            console.error(`   ✗ Error generating ${format.aspectRatio}:`, formatError.message)
            errors++
          }
        }

        console.log(`\n✅ Completed ${angledShot.angle_name} (generated ${FORMATS.length} formats)\n`)

      } catch (error) {
        console.error(`\n✗ Error processing ${angledShot.angle_name}:`, error.message)
        errors++
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 PHASE 2.5 SUMMARY')
    console.log('='.repeat(60))
    console.log(`\n✅ Original angled shots: ${angledShots.length}`)
    console.log(`✅ Formats generated per shot: ${FORMATS.length}`)
    console.log(`✅ Total new angled shots: ${totalGenerated}`)
    if (errors > 0) {
      console.log(`❌ Errors: ${errors}`)
    }

    console.log('\n📂 Angled Shots by Format:')
    const formatCounts = await sql`
      SELECT format, COUNT(*) as count
      FROM angled_shots
      GROUP BY format
      ORDER BY format
    `
    formatCounts.forEach(row => {
      console.log(`   ${row.format}: ${row.count} angled shots`)
    })

    if (totalGenerated === angledShots.length * FORMATS.length && errors === 0) {
      console.log('\n🎉 Phase 2.5 Complete!')
      console.log('✅ All angled shots available in 4 formats (1:1, 16:9, 9:16, 4:5)')
      console.log('✅ Ready for Phase 3: Template Builder Updates')
      return 0
    } else {
      console.log('\n⚠️  Phase 2.5 completed with some errors')
      console.log('Review errors above')
      return 1
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    return 1
  } finally {
    await sql.end()
  }
}

generateMultiFormatAngledShots().then(exitCode => {
  process.exit(exitCode)
})
