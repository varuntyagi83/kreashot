import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function checkTemplates() {
  try {
    const templates = await sql`
      SELECT id, name, format, width, height, created_at
      FROM templates
      WHERE category_id = (SELECT id FROM categories WHERE slug = 'gummy-bear')
      ORDER BY format, created_at
    `

    console.log(`\n📋 Found ${templates.length} existing templates:\n`)
    templates.forEach((t, i) => {
      console.log(`${i + 1}. [${t.format}] ${t.name}`)
      console.log(`   ID: ${t.id}`)
      console.log(`   Dimensions: ${t.width}x${t.height}`)
      console.log(`   Created: ${new Date(t.created_at).toLocaleString()}`)
      console.log()
    })

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await sql.end()
  }
}

checkTemplates()
