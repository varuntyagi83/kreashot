/**
 * Ensure ALL assets (backgrounds, composites, angled shots) are publicly shared in GDrive
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

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

async function ensureShared(fileId, name) {
  try {
    const { data } = await drive.files.get({
      fileId,
      fields: 'shared',
      supportsAllDrives: true,
    })

    if (!data.shared) {
      await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      })
      return 'FIXED'
    }
    return 'OK'
  } catch (error) {
    return `ERROR: ${error.message}`
  }
}

try {
  // Composites
  const composites = await sql`SELECT id, name, gdrive_file_id FROM composites WHERE gdrive_file_id IS NOT NULL`
  console.log(`Composites: ${composites.length}`)
  let fixedComposites = 0
  for (const c of composites) {
    const result = await ensureShared(c.gdrive_file_id, c.name)
    if (result === 'FIXED') fixedComposites++
    if (result !== 'OK') console.log(`  ${c.name}: ${result}`)
  }
  console.log(`  ${fixedComposites} fixed, ${composites.length - fixedComposites} already shared\n`)

  // Angled shots
  const shots = await sql`SELECT id, display_name, angle_name, gdrive_file_id FROM angled_shots WHERE gdrive_file_id IS NOT NULL`
  console.log(`Angled shots: ${shots.length}`)
  let fixedShots = 0
  for (const s of shots) {
    const result = await ensureShared(s.gdrive_file_id, s.display_name || s.angle_name)
    if (result === 'FIXED') fixedShots++
    if (result !== 'OK') console.log(`  ${s.display_name || s.angle_name}: ${result}`)
  }
  console.log(`  ${fixedShots} fixed, ${shots.length - fixedShots} already shared\n`)

  // Product images
  const images = await sql`SELECT id, gdrive_file_id FROM product_images WHERE gdrive_file_id IS NOT NULL`
  console.log(`Product images: ${images.length}`)
  let fixedImages = 0
  for (const img of images) {
    const result = await ensureShared(img.gdrive_file_id, img.id)
    if (result === 'FIXED') fixedImages++
    if (result !== 'OK') console.log(`  ${img.id}: ${result}`)
  }
  console.log(`  ${fixedImages} fixed, ${images.length - fixedImages} already shared\n`)

  console.log('Summary:')
  console.log(`  Composites: ${fixedComposites} fixed`)
  console.log(`  Angled shots: ${fixedShots} fixed`)
  console.log(`  Product images: ${fixedImages} fixed`)
  console.log('Done!')
} catch (e) {
  console.error('Fatal:', e)
} finally {
  await sql.end()
}
