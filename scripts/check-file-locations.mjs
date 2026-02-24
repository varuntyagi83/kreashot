/**
 * Check if composite files have Google Drive IDs and verify locations
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

async function checkFileLocations() {
  try {
    console.log('🔍 Checking composite file locations...\n')

    const composites = await sql`
      SELECT id, storage_path, gdrive_file_id
      FROM composites
      ORDER BY created_at DESC
      LIMIT 10
    `

    console.log(`Found ${composites.length} composites:\n`)

    composites.forEach((comp, i) => {
      console.log(`${i + 1}. ${comp.storage_path}`)
      console.log(`   Google Drive ID: ${comp.gdrive_file_id || 'Not set'}`)
      console.log()
    })

    const withGDrive = composites.filter(c => c.gdrive_file_id).length
    const withoutGDrive = composites.filter(c => !c.gdrive_file_id).length

    console.log('Summary:')
    console.log(`  ✓ With Google Drive ID: ${withGDrive}`)
    console.log(`  ⚠  Without Google Drive ID: ${withoutGDrive}`)

    if (withoutGDrive > 0) {
      console.log('\n⚠️  Some composites do not have Google Drive file IDs.')
      console.log('These files cannot be moved automatically.')
      console.log('They may have been created before Google Drive integration.')
    }

    await sql.end()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await sql.end()
    process.exit(1)
  }
}

checkFileLocations()
