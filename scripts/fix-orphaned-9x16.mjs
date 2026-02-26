/**
 * Fix Orphaned 9x16 Background Files
 *
 * This script:
 * 1. Connects to GDrive and Supabase (via postgres)
 * 2. Lists files in the 9x16 backgrounds folder (folder ID: 1p00CPLxYD63CtEI8IsV-4yyRT6Xi9dox)
 * 3. Checks each file for a matching Supabase `backgrounds` record by gdrive_file_id
 * 4. Prints orphaned file details (id, name, created time, size)
 * 5. For orphaned files:
 *    a. Sets sharing permissions (role: reader, type: anyone)
 *    b. Gets the source background info ("Background 3 (1:1)")
 *    c. Creates a Supabase record with appropriate fields
 *
 * Usage:
 *   npx @railway/cli run node scripts/fix-orphaned-9x16.mjs
 */

import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { google } from 'googleapis'
import postgres from 'postgres'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

const FOLDER_ID = '1p00CPLxYD63CtEI8IsV-4yyRT6Xi9dox'

async function main() {
  console.log('=== Fix Orphaned 9x16 Backgrounds ===\n')

  // Step 1: List files in the 9x16 folder
  console.log(`[1] Listing files in 9x16 folder (${FOLDER_ID})...\n`)

  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, createdTime, size, mimeType)',
    orderBy: 'createdTime',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  const files = res.data.files || []
  console.log(`   Found ${files.length} file(s) in 9x16 folder:\n`)

  for (const f of files) {
    console.log(`   - ${f.name}`)
    console.log(`     ID: ${f.id}`)
    console.log(`     Created: ${f.createdTime}`)
    console.log(`     Size: ${f.size ? (Number(f.size) / 1024).toFixed(1) + ' KB' : 'unknown'}`)
    console.log(`     MIME: ${f.mimeType}`)
    console.log()
  }

  // Step 2: Check each file for a matching Supabase record
  console.log(`[2] Checking for matching Supabase backgrounds records...\n`)

  const orphaned = []

  for (const f of files) {
    const rows = await sql`
      SELECT id, name, gdrive_file_id, format
      FROM backgrounds
      WHERE gdrive_file_id = ${f.id}
    `
    if (rows.length > 0) {
      console.log(`   MATCHED: ${f.name} -> DB record "${rows[0].name}" (${rows[0].format})`)
    } else {
      console.log(`   ORPHANED: ${f.name} (${f.id}) -- no matching DB record`)
      orphaned.push(f)
    }
  }

  console.log(`\n   Total orphaned: ${orphaned.length}\n`)

  if (orphaned.length === 0) {
    console.log('No orphaned files found. Nothing to do.')
    await sql.end()
    return
  }

  // Step 3: Get the source background info -- "Background 3" (1:1 format)
  console.log(`[3] Looking up source background ("Background 3")...\n`)

  const sourceRows = await sql`
    SELECT * FROM backgrounds
    WHERE name LIKE 'Background 3%'
    ORDER BY created_at
  `

  console.log(`   Found ${sourceRows.length} "Background 3" record(s):`)
  for (const s of sourceRows) {
    console.log(`   - "${s.name}" | format: ${s.format} | id: ${s.id} | category_id: ${s.category_id}`)
  }

  // Use the 1:1 version as source
  const source = sourceRows.find(r => r.format === '1:1') || sourceRows[0]
  if (!source) {
    console.error('\n   ERROR: Could not find source "Background 3" record. Aborting.')
    await sql.end()
    process.exit(1)
  }

  console.log(`\n   Using source: "${source.name}" (id: ${source.id}, format: ${source.format})`)
  console.log(`   Category ID: ${source.category_id}`)
  console.log(`   User ID: ${source.user_id}`)
  console.log(`   Slug: ${source.slug}`)
  console.log(`   Description: ${source.description || '(none)'}`)
  console.log()

  // Also look up the category to build storage_path
  const catRows = await sql`
    SELECT id, name, slug FROM categories WHERE id = ${source.category_id}
  `
  const category = catRows[0]
  console.log(`   Category: "${category?.name}" (slug: ${category?.slug})\n`)

  // Step 4: Process each orphaned file
  for (const file of orphaned) {
    console.log(`[4] Processing orphaned file: ${file.name} (${file.id})...\n`)

    // 4a. Set sharing permissions
    console.log(`   [4a] Setting sharing permissions (reader, anyone)...`)
    try {
      await drive.permissions.create({
        fileId: file.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      })
      console.log(`   Sharing permissions set successfully.`)
    } catch (err) {
      if (err.message?.includes('already has')) {
        console.log(`   Sharing already configured (skipped).`)
      } else {
        console.log(`   Warning setting permissions: ${err.message}`)
      }
    }

    // 4b. Build the new record
    const newName = `${source.name.replace(/\s*\(1:1\)/, '')} (9:16)`
    const newSlug = `${source.slug}-9x16-${Date.now()}`
    const newDescription = source.description || `Reformatted from ${source.name}`
    const storagePath = `${category?.slug || 'unknown'}/backgrounds/9x16/${file.name}`
    const storageUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w2000`
    const promptUsed = 'Create a variation of this image in 9:16 aspect ratio without changing any design details or causing distortion. Return a high-quality image.'

    console.log(`\n   [4b] New record details:`)
    console.log(`     name:             ${newName}`)
    console.log(`     slug:             ${newSlug}`)
    console.log(`     description:      ${newDescription}`)
    console.log(`     format:           9:16`)
    console.log(`     width:            1080`)
    console.log(`     height:           1920`)
    console.log(`     storage_provider: gdrive`)
    console.log(`     storage_path:     ${storagePath}`)
    console.log(`     storage_url:      ${storageUrl}`)
    console.log(`     gdrive_file_id:   ${file.id}`)
    console.log(`     prompt_used:      ${promptUsed}`)
    console.log(`     category_id:      ${source.category_id}`)
    console.log(`     user_id:          ${source.user_id}`)
    console.log()

    // 4c. Insert the record
    console.log(`   [4c] Inserting backgrounds record...`)
    try {
      const inserted = await sql`
        INSERT INTO backgrounds (
          category_id,
          user_id,
          name,
          slug,
          description,
          prompt_used,
          format,
          width,
          height,
          storage_provider,
          storage_path,
          storage_url,
          gdrive_file_id,
          metadata
        ) VALUES (
          ${source.category_id},
          ${source.user_id},
          ${newName},
          ${newSlug},
          ${newDescription},
          ${promptUsed},
          ${'9:16'},
          ${1080},
          ${1920},
          ${'gdrive'},
          ${storagePath},
          ${storageUrl},
          ${file.id},
          ${{}}
        )
        RETURNING id, name, slug, format, created_at
      `

      const record = inserted[0]
      console.log(`\n   SUCCESS! Created record:`)
      console.log(`     id:         ${record.id}`)
      console.log(`     name:       ${record.name}`)
      console.log(`     slug:       ${record.slug}`)
      console.log(`     format:     ${record.format}`)
      console.log(`     created_at: ${record.created_at}`)
      console.log()
    } catch (err) {
      console.error(`\n   ERROR inserting record: ${err.message}`)
      console.error(`   Full error:`, err)
    }
  }

  // Step 5: Verify
  console.log(`[5] Verification -- re-checking all files in folder...\n`)

  for (const f of files) {
    const rows = await sql`
      SELECT id, name, format, gdrive_file_id, storage_url
      FROM backgrounds
      WHERE gdrive_file_id = ${f.id}
    `
    if (rows.length > 0) {
      console.log(`   OK: ${f.name} -> "${rows[0].name}" (${rows[0].format})`)
      console.log(`       URL: ${rows[0].storage_url}`)
    } else {
      console.log(`   STILL ORPHANED: ${f.name} (${f.id})`)
    }
  }

  console.log('\n=== Done ===')
  await sql.end()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await sql.end()
  process.exit(1)
})
