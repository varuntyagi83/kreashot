/**
 * Create placeholder templates for all formats (1:1, 16:9, 9:16, 4:5)
 * These act as starting points for users
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

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY
  },
  scopes: ['https://www.googleapis.com/auth/drive']
})

const drive = google.drive({ version: 'v3', auth })

const FORMATS = [
  {
    format: '1:1',
    width: 1080,
    height: 1080,
    name: 'Instagram Square',
    description: 'Instagram Square Post (1080x1080)',
    productX: 30,
    productY: 35,
    productWidth: 40,
    productHeight: 40
  },
  {
    format: '16:9',
    width: 1920,
    height: 1080,
    name: 'Facebook Landscape',
    description: 'Facebook/YouTube Landscape (1920x1080)',
    productX: 20,
    productY: 25,
    productWidth: 30,
    productHeight: 50
  },
  {
    format: '9:16',
    width: 1080,
    height: 1920,
    name: 'Stories',
    description: 'Instagram/TikTok Stories (1080x1920)',
    productX: 30,
    productY: 40,
    productWidth: 40,
    productHeight: 25
  },
  {
    format: '4:5',
    width: 1080,
    height: 1350,
    name: 'Instagram Portrait',
    description: 'Instagram Portrait Post (1080x1350)',
    productX: 30,
    productY: 35,
    productWidth: 40,
    productHeight: 35
  }
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

async function createFolder(name, parentId) {
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

  return folder.data.id
}

async function findOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId)
  if (existing) {
    return existing.id
  }
  return await createFolder(name, parentId)
}

async function uploadTemplate(templateData, fileName, folderId) {
  const buffer = Buffer.from(JSON.stringify(templateData, null, 2), 'utf-8')

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json'
  }

  const media = {
    mimeType: 'application/json',
    body: Readable.from(buffer)
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
}

function createTemplateData(formatConfig) {
  return {
    layers: [
      {
        id: 'layer-background',
        type: 'background',
        name: 'Background',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        z_index: 0,
        locked: false
      },
      {
        id: 'layer-product',
        type: 'product',
        name: 'Product',
        x: formatConfig.productX,
        y: formatConfig.productY,
        width: formatConfig.productWidth,
        height: formatConfig.productHeight,
        z_index: 1,
        locked: false
      },
      {
        id: 'layer-headline',
        type: 'text',
        name: 'Headline',
        x: 10,
        y: 10,
        width: 80,
        height: 15,
        z_index: 2,
        locked: false,
        font_size: 24,
        font_family: 'Arial',
        color: '#000000',
        text_align: 'center'
      },
      {
        id: 'layer-logo',
        type: 'logo',
        name: 'Logo',
        x: 75,
        y: 5,
        width: 20,
        height: 10,
        z_index: 3,
        locked: false,
        position: 'top-right',
        padding: 10
      }
    ],
    safe_zones: [
      {
        id: 'safe-zone-product',
        name: 'Product Safe Zone',
        x: formatConfig.productX - 5,
        y: formatConfig.productY - 5,
        width: formatConfig.productWidth + 10,
        height: formatConfig.productHeight + 10,
        type: 'safe',
        color: '#00ff00'
      },
      {
        id: 'restricted-zone-top',
        name: 'Top Margin',
        x: 0,
        y: 0,
        width: 100,
        height: 5,
        type: 'restricted',
        color: '#ff0000'
      }
    ]
  }
}

async function createPlaceholderTemplates() {
  console.log('📝 Creating placeholder templates for all formats\n')
  console.log('=' .repeat(60))

  try {
    // Get category
    const category = await sql`
      SELECT id, slug, gdrive_folder_id, user_id
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    if (!category || !category[0]) {
      throw new Error('Gummy Bear category not found')
    }

    const cat = category[0]
    console.log('Category:', cat.slug)
    console.log('User ID:', cat.user_id)

    // Create templates folder structure
    console.log('\n📁 Setting up templates folder structure...')
    const templatesFolder = await findOrCreateFolder('templates', cat.gdrive_folder_id)
    console.log('   ✓ templates/')

    const formatFolders = {}
    for (const format of FORMATS) {
      formatFolders[format.format] = await findOrCreateFolder(format.format, templatesFolder)
      console.log(`   ✓ templates/${format.format}/`)
    }

    // Check which templates already exist
    const existingTemplates = await sql`
      SELECT format
      FROM templates
      WHERE category_id = ${cat.id}
    `
    const existingFormats = new Set(existingTemplates.map(t => t.format))

    // Create a placeholder template for each format
    let created = 0
    let skipped = 0

    for (const formatConfig of FORMATS) {
      if (existingFormats.has(formatConfig.format)) {
        console.log(`\n⏭️  Skipping ${formatConfig.format} template (already exists)`)
        skipped++
        continue
      }

      console.log(`\n📝 Creating ${formatConfig.format} template...`)

      // Create template data
      const templateData = createTemplateData(formatConfig)
      const fileName = `starter-template_${formatConfig.format}_${Date.now()}.json`

      // Upload to Google Drive
      console.log(`   → Uploading to Google Drive...`)
      const uploadResult = await uploadTemplate(
        {
          name: `Starter Template ${formatConfig.format}`,
          description: formatConfig.description,
          format: formatConfig.format,
          width: formatConfig.width,
          height: formatConfig.height,
          template_data: templateData,
          created_at: new Date().toISOString()
        },
        fileName,
        formatFolders[formatConfig.format]
      )
      console.log(`   ✓ Uploaded: ${fileName}`)

      // Save to database
      console.log(`   → Saving to database...`)
      const storagePath = `${cat.slug}/templates/${formatConfig.format}/${fileName}`

      const template = await sql`
        INSERT INTO templates (
          category_id,
          user_id,
          name,
          description,
          format,
          width,
          height,
          template_data,
          storage_provider,
          storage_path,
          storage_url,
          gdrive_file_id,
          slug
        ) VALUES (
          ${cat.id},
          ${cat.user_id},
          ${`Starter Template ${formatConfig.format}`},
          ${formatConfig.description},
          ${formatConfig.format},
          ${formatConfig.width},
          ${formatConfig.height},
          ${JSON.stringify(templateData)},
          'gdrive',
          ${storagePath},
          ${uploadResult.publicUrl},
          ${uploadResult.fileId},
          ${'starter-template-' + formatConfig.format.replace(':', 'x')}
        )
        RETURNING id, name, format
      `

      console.log(`   ✓ Saved to database (ID: ${template[0].id})`)
      created++
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Placeholder templates created: ${created}`)
    console.log(`⏭️  Templates skipped (already exist): ${skipped}`)

    const allTemplates = await sql`
      SELECT format, COUNT(*) as count
      FROM templates
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `

    console.log('\n📋 Templates by format:')
    allTemplates.forEach(row => {
      console.log(`   ${row.format}: ${row.count} templates`)
    })

    console.log('\n🎉 Placeholder templates ready!')
    console.log('✅ Users now have starter templates for each format')

    return 0

  } catch (error) {
    console.error('\n❌ Failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

createPlaceholderTemplates().then(exitCode => {
  process.exit(exitCode)
})
