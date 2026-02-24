import postgres from 'postgres'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

try {
  const columns = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'categories'
    ORDER BY ordinal_position
  `
  console.log('Categories table columns:')
  console.table(columns)

  const sampleCategory = await sql`
    SELECT * FROM categories LIMIT 1
  `
  console.log('\nSample category:')
  console.log(sampleCategory[0])
} catch (error) {
  console.error('Error:', error)
} finally {
  await sql.end()
}
