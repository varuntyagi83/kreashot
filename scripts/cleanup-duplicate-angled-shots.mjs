import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function cleanup() {
  try {
    console.log('🧹 Cleaning up duplicate angled shot records...\n')

    // Find records with old format subfolder paths
    const duplicates = await sql`
      SELECT id, angle_name, format, storage_path
      FROM angled_shots
      WHERE storage_path LIKE '%/16:9/%'
         OR storage_path LIKE '%/9:16/%'
         OR storage_path LIKE '%/4:5/%'
         OR storage_path LIKE '%/1x1/%'
      ORDER BY angle_name, format
    `

    console.log(`Found ${duplicates.length} duplicate records with old paths:\n`)
    duplicates.forEach(rec => {
      console.log(`  [${rec.format}] ${rec.angle_name}`)
      console.log(`      ${rec.storage_path}`)
    })

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!')
      await sql.end()
      return 0
    }

    console.log(`\n⚠️  About to delete ${duplicates.length} duplicate records`)
    console.log('These files no longer exist in Google Drive (moved to parent folder)\n')

    // Delete duplicates
    const deleted = await sql`
      DELETE FROM angled_shots
      WHERE storage_path LIKE '%/16:9/%'
         OR storage_path LIKE '%/9:16/%'
         OR storage_path LIKE '%/4:5/%'
         OR storage_path LIKE '%/1x1/%'
      RETURNING id, angle_name, format
    `

    console.log(`✅ Deleted ${deleted.length} duplicate records`)

    // Verify final state
    const finalCounts = await sql`
      SELECT format, COUNT(*) as count
      FROM angled_shots
      GROUP BY format
      ORDER BY format
    `

    console.log('\n📊 Final angled shots in database:')
    let total = 0
    finalCounts.forEach(row => {
      console.log(`  ${row.format}: ${row.count} shots`)
      total += parseInt(row.count)
    })
    console.log(`\nTotal: ${total} angled shots`)

    console.log('\n🎉 Cleanup complete!')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await sql.end()
  }
}

cleanup()
