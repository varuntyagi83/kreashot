import postgres from 'postgres'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

try {
  console.log('🔍 Phase 2 Verification\n')
  console.log('='.repeat(60))

  const verification = await sql`
    SELECT
      'composites' as resource_type,
      CASE
        WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
        WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
        WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
        WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
        ELSE 'no-format-folder'
      END as format_folder,
      COUNT(*) as count
    FROM composites
    GROUP BY format_folder

    UNION ALL

    SELECT
      'templates' as resource_type,
      CASE
        WHEN storage_path LIKE '%/1x1/%' THEN '1x1'
        WHEN storage_path LIKE '%/16x9/%' THEN '16x9'
        WHEN storage_path LIKE '%/9x16/%' THEN '9x16'
        WHEN storage_path LIKE '%/4x5/%' THEN '4x5'
        ELSE 'no-format-folder'
      END as format_folder,
      COUNT(*) as count
    FROM templates
    GROUP BY format_folder

    ORDER BY resource_type, format_folder
  `

  console.log('\n📊 Storage Path Verification:')
  console.table(verification)

  const hasUnmigrated = verification.some(v => v.format_folder === 'no-format-folder')

  // Sample paths
  const sampleComposites = await sql`
    SELECT storage_path
    FROM composites
    LIMIT 2
  `

  const sampleTemplates = await sql`
    SELECT storage_path
    FROM templates
    LIMIT 1
  `

  console.log('\n📝 Sample Storage Paths:')
  sampleComposites.forEach(p => {
    console.log(`  composite: ${p.storage_path}`)
  })
  sampleTemplates.forEach(p => {
    console.log(`  template: ${p.storage_path}`)
  })

  console.log('\n' + '='.repeat(60))
  if (!hasUnmigrated) {
    console.log('🎉 Phase 2: COMPLETE')
    console.log('✅ All storage paths use format folders')
    console.log('✅ Format notation: 1x1, 16x9, 9x16, 4x5')
    console.log('\n✅ Ready for Phase 3: Template Builder Updates')
  } else {
    console.log('⚠️  Some files still unmigrated')
  }

} catch (error) {
  console.error('Error:', error)
} finally {
  await sql.end()
}
