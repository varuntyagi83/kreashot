/**
 * Fix greenworld category: find or create its GDrive folder and set gdrive_folder_id
 * Also verify all background image URLs are accessible
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
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: GOOGLE_DRIVE_PRIVATE_KEY,
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

try {
  console.log('='.repeat(60))
  console.log('1. Checking greenworld category')
  console.log('='.repeat(60))

  const [greenworld] = await sql`SELECT id, name, slug, gdrive_folder_id FROM categories WHERE slug = 'greenworld'`

  if (!greenworld) {
    console.log('No greenworld category found')
    process.exit(0)
  }

  console.log(`  Category: ${greenworld.name} (${greenworld.id})`)
  console.log(`  gdrive_folder_id: ${greenworld.gdrive_folder_id || 'MISSING'}`)

  if (!greenworld.gdrive_folder_id) {
    console.log('\n  Searching for greenworld folder in GDrive root...')

    // Search for existing folder
    const { data } = await drive.files.list({
      q: `name='greenworld' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    let folderId = null

    if (data.files && data.files.length > 0) {
      folderId = data.files[0].id
      console.log(`  Found existing folder: ${folderId}`)
    } else {
      console.log('  No existing folder found. Creating...')
      const { data: folder } = await drive.files.create({
        requestBody: {
          name: 'greenworld',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [GOOGLE_DRIVE_FOLDER_ID],
        },
        fields: 'id',
        supportsAllDrives: true,
      })
      folderId = folder.id
      console.log(`  Created folder: ${folderId}`)
    }

    // Update the category
    await sql`UPDATE categories SET gdrive_folder_id = ${folderId} WHERE id = ${greenworld.id}`
    console.log(`  Updated greenworld gdrive_folder_id to: ${folderId}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('2. Verifying all background images are accessible')
  console.log('='.repeat(60))

  const bgs = await sql`
    SELECT b.id, b.name, b.gdrive_file_id, b.storage_url
    FROM backgrounds b
    ORDER BY b.name
  `

  for (const bg of bgs) {
    if (!bg.gdrive_file_id) {
      console.log(`  ${bg.name}: NO FILE ID`)
      continue
    }

    try {
      const response = await drive.files.get({
        fileId: bg.gdrive_file_id,
        fields: 'id, name, mimeType, size, imageMediaMetadata(width,height), shared',
        supportsAllDrives: true,
      })

      const meta = response.data.imageMediaMetadata
      const dims = meta ? `${meta.width}x${meta.height}` : 'no dims'
      console.log(`  ${bg.name}: OK (${dims}, shared: ${response.data.shared || false})`)

      // If not shared, make it accessible
      if (!response.data.shared) {
        console.log(`    Making publicly accessible...`)
        try {
          await drive.permissions.create({
            fileId: bg.gdrive_file_id,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
            supportsAllDrives: true,
          })
          console.log(`    Set to public reader`)
        } catch (permError) {
          console.log(`    Permission update failed: ${permError.message}`)
        }
      }
    } catch (error) {
      console.log(`  ${bg.name}: BROKEN (${error.message})`)
    }
  }

  console.log('\nDone!')
} catch (e) {
  console.error('Fatal:', e)
} finally {
  await sql.end()
}
