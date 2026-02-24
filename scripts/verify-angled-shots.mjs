import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function verify() {
  try {
    console.log('📊 Verifying angled shots in database...\n')

    const formatCounts = await sql`
      SELECT format, COUNT(*) as count
      FROM angled_shots
      GROUP BY format
      ORDER BY format
    `

    console.log('Angled Shots by Format:')
    let total = 0
    formatCounts.forEach(row => {
      console.log(`  ${row.format}: ${row.count} shots`)
      total += parseInt(row.count)
    })
    console.log(`\nTotal: ${total} angled shots`)

    const pathCheck = await sql`
      SELECT storage_path, format
      FROM angled_shots
      ORDER BY angle_name, format
    `

    console.log(`\nStorage Paths (all ${pathCheck.length} records):`)
    pathCheck.forEach(row => {
      console.log(`  [${row.format}] ${row.storage_path}`)
    })

    // Check for any paths still containing format folders
    const wrongPaths = pathCheck.filter(row =>
      row.storage_path.includes('/1x1/') ||
      row.storage_path.includes('/16:9/') ||
      row.storage_path.includes('/9:16/') ||
      row.storage_path.includes('/4:5/')
    )

    if (wrongPaths.length > 0) {
      console.log(`\n⚠️  Found ${wrongPaths.length} paths still containing format folders:`)
      wrongPaths.forEach(row => {
        console.log(`  ${row.storage_path}`)
      })
    } else {
      console.log(`\n✅ All storage paths are correct (no format subfolders)`)
    }

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await sql.end()
  }
}

verify()
