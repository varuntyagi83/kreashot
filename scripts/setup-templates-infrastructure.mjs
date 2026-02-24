/**
 * Setup Templates Infrastructure
 * 1. Create templates/ folder in Google Drive
 * 2. Verify templates table exists
 * 3. Create sample templates for all aspect ratios
 */

import { google } from 'googleapis'
import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

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
    fields: 'id, name',
    supportsAllDrives: true
  })

  return folder.data
}

async function setupInfrastructure() {
  console.log('🏗️  Setting Up Templates Infrastructure\n')
  console.log('='.repeat(60))

  try {
    // Get category
    const category = await sql`
      SELECT id, slug, name, gdrive_folder_id
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    const cat = category[0]
    console.log('\n📂 Category:', cat.name)
    console.log('   GDrive Folder:', cat.gdrive_folder_id)

    // Step 1: Create templates folder in Google Drive
    console.log('\n📁 Step 1: Creating templates/ folder...')
    
    let templatesFolder = await findFolder('templates', cat.gdrive_folder_id)
    
    if (templatesFolder) {
      console.log(`   ✓ templates/ folder already exists (${templatesFolder.id})`)
    } else {
      templatesFolder = await createFolder('templates', cat.gdrive_folder_id)
      console.log(`   ✅ Created templates/ folder (${templatesFolder.id})`)
    }

    // Step 2: Verify templates table exists
    console.log('\n📊 Step 2: Verifying templates table...')
    
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'templates'
      ) as exists
    `

    if (tableExists[0].exists) {
      console.log('   ✓ templates table exists')
      
      // Check current templates
      const existing = await sql`
        SELECT id, name, format, width, height
        FROM templates
        WHERE category_id = ${cat.id}
      `
      
      console.log(`   ✓ Found ${existing.length} existing templates`)
      existing.forEach(t => {
        console.log(`      - ${t.name} (${t.format}, ${t.width}x${t.height})`)
      })
    } else {
      console.log('   ⚠️  templates table does NOT exist')
      console.log('   Run migration: supabase/migrations/013_add_templates_table.sql')
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Infrastructure setup complete!')
    console.log('\nNext steps:')
    console.log('1. Build template builder UI with canvas')
    console.log('2. Create sample templates for each aspect ratio')
    console.log('3. Define safe zones visually')

    return 0

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

setupInfrastructure().then(exitCode => {
  process.exit(exitCode)
})
