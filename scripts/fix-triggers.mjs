import postgres from 'postgres'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

try {
  console.log('Dropping invalid triggers...\n')

  // Drop composites_updated_at trigger (no updated_at column exists)
  await sql`DROP TRIGGER IF EXISTS composites_updated_at ON composites`
  console.log('✓ Dropped composites_updated_at trigger')

  // Drop the function too
  await sql`DROP FUNCTION IF EXISTS update_composites_updated_at CASCADE`
  console.log('✓ Dropped update_composites_updated_at function')

  console.log('\n✅ Triggers fixed')
} catch (error) {
  console.error('Error:', error)
} finally {
  await sql.end()
}
