import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function checkStatus() {
  try {
    const stats = await sql`
      SELECT 
        status,
        COUNT(*) as count
      FROM deletion_queue
      GROUP BY status
      ORDER BY status
    `
    
    console.log('\n📊 Deletion Queue Status:\n')
    stats.forEach(s => {
      console.log(`   ${s.status}: ${s.count}`)
    })
    
    const total = stats.reduce((sum, s) => sum + parseInt(s.count), 0)
    console.log(`\n   Total: ${total}`)
    
    return 0
  } catch (error) {
    console.error('Error:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

checkStatus().then(exitCode => process.exit(exitCode))
