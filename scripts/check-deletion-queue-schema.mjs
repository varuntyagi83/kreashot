import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function checkSchema() {
  try {
    // Check deletion_queue table columns
    const columns = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'deletion_queue'
      ORDER BY ordinal_position
    `
    
    console.log('\n📊 deletion_queue Table Schema:\n')
    columns.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`)
    })
    
    // Check if we have the new columns
    const hasStatus = columns.some(c => c.column_name === 'status')
    const hasRetryCount = columns.some(c => c.column_name === 'retry_count')
    const hasMaxRetries = columns.some(c => c.column_name === 'max_retries')
    
    console.log('\n📝 Required Columns for Auto-Deletion:')
    console.log(`   status: ${hasStatus ? '✅' : '❌'}`)
    console.log(`   retry_count: ${hasRetryCount ? '✅' : '❌'}`)
    console.log(`   max_retries: ${hasMaxRetries ? '✅' : '❌'}`)
    
    if (!hasStatus || !hasRetryCount || !hasMaxRetries) {
      console.log('\n⚠️  Missing columns! Need to run migration.')
    } else {
      console.log('\n✅ Schema is correct!')
    }
    
    return 0
  } catch (error) {
    console.error('Error:', error.message)
    return 1
  } finally {
    await sql.end()
  }
}

checkSchema().then(exitCode => process.exit(exitCode))
