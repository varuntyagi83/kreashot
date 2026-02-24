import postgres from 'postgres'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

try {
  const columns = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'composites'
    ORDER BY ordinal_position
  `
  console.log('Composites table columns:')
  console.table(columns)

  const triggers = await sql`
    SELECT
      tgname as trigger_name,
      pg_get_triggerdef(oid) as definition
    FROM pg_trigger
    WHERE tgrelid = 'composites'::regclass
      AND tgisinternal = false
  `
  console.log('\nComposites table triggers:')
  console.table(triggers)
} catch (error) {
  console.error('Error:', error)
} finally {
  await sql.end()
}
