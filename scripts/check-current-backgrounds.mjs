import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function checkBackgrounds() {
  try {
    const backgrounds = await sql`
      SELECT id, name, storage_path, storage_url, format, width, height, gdrive_file_id
      FROM backgrounds
      WHERE category_id = (SELECT id FROM categories WHERE slug = 'gummy-bear')
      ORDER BY created_at DESC
    `
    
    console.log('\n📊 ALL CURRENT BACKGROUNDS:\n')
    backgrounds.forEach((bg, i) => {
      console.log(`${i + 1}. ${bg.name}`)
      console.log(`   Path: ${bg.storage_path}`)
      console.log(`   URL: ${bg.storage_url}`)
      console.log(`   Format: ${bg.format} (${bg.width}x${bg.height})`)
      console.log(`   GDrive ID: ${bg.gdrive_file_id}`)
      console.log()
    })
    
    return 0
  } catch (error) {
    console.error('Error:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

checkBackgrounds().then(exitCode => process.exit(exitCode))
