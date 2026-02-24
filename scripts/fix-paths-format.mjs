/**
 * Fix storage paths to use filesystem-safe format notation
 * Convert: 1:1 → 1x1, 16:9 → 16x9, etc.
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

function formatToPath(format) {
  return format.replace(':', 'x')  // 1:1 → 1x1, 16:9 → 16x9
}

try {
  console.log('🔧 Fixing storage paths to use filesystem-safe format notation\n')

  // Fix composites
  const composites = await sql`
    SELECT id, storage_path, format
    FROM composites
  `

  console.log(`Updating ${composites.length} composites...`)
  for (const comp of composites) {
    const pathFormat = formatToPath(comp.format)
    const newPath = comp.storage_path.replace(
      new RegExp(`/${comp.format}/`),
      `/${pathFormat}/`
    )

    if (newPath !== comp.storage_path) {
      await sql`
        UPDATE composites
        SET storage_path = ${newPath}
        WHERE id = ${comp.id}
      `
      console.log(`✓ ${comp.storage_path} → ${newPath}`)
    }
  }

  // Fix templates
  const templates = await sql`
    SELECT id, storage_path, format
    FROM templates
  `

  console.log(`\nUpdating ${templates.length} templates...`)
  for (const template of templates) {
    const pathFormat = formatToPath(template.format)
    const newPath = template.storage_path.replace(
      new RegExp(`/${template.format}/`),
      `/${pathFormat}/`
    )

    if (newPath !== template.storage_path) {
      await sql`
        UPDATE templates
        SET storage_path = ${newPath}
        WHERE id = ${template.id}
      `
      console.log(`✓ ${template.storage_path} → ${newPath}`)
    }
  }

  // Fix final_assets (if any)
  const finalAssets = await sql`
    SELECT id, storage_path, format
    FROM final_assets
  `

  console.log(`\nUpdating ${finalAssets.length} final assets...`)
  for (const asset of finalAssets) {
    const pathFormat = formatToPath(asset.format)
    const newPath = asset.storage_path.replace(
      new RegExp(`/${asset.format}/`),
      `/${pathFormat}/`
    )

    if (newPath !== asset.storage_path) {
      await sql`
        UPDATE final_assets
        SET storage_path = ${newPath}
        WHERE id = ${asset.id}
      `
      console.log(`✓ ${asset.storage_path} → ${newPath}`)
    }
  }

  console.log('\n✅ All paths fixed!')

} catch (error) {
  console.error('Error:', error)
} finally {
  await sql.end()
}
