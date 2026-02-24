import postgres from 'postgres'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

try {
  const columns = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'templates'
    ORDER BY ordinal_position
  `
  console.log('Templates table columns:')
  console.table(columns)
  
  const constraints = await sql`
    SELECT
      conname,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conrelid = 'templates'::regclass
  `
  console.log('\nTemplates table constraints:')
  console.table(constraints)
} catch (error) {
  console.error('Error:', error)
} finally {
  await sql.end()
}
