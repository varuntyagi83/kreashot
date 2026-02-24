#!/usr/bin/env tsx
/**
 * Cleanup orphaned metadata - Local version
 * Runs directly against Supabase and Google Drive APIs without needing Vercel
 */

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Google Drive credentials
const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL!
const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

if (!clientEmail || !privateKey) {
  console.error('❌ Missing Google Drive credentials')
  console.error('   Need: GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY')
  console.error('   These are only available in Vercel environment variables')
  console.error('   Please run this from Vercel or add them to .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Initialize Google Drive
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
})

const drive = google.drive({ version: 'v3', auth })

interface OrphanedRecord {
  id: string
  gdrive_file_id: string
  display_name: string
}

async function checkTableForOrphans(
  tableName: string,
  displayNameField: string,
  dryRun: boolean
): Promise<number> {
  console.log(`\n📋 Checking ${tableName}...`)

  // Get all records with Google Drive files
  const { data: records, error: fetchError } = await supabase
    .from(tableName)
    .select('id, gdrive_file_id, storage_provider, ' + displayNameField)
    .eq('storage_provider', 'gdrive')
    .not('gdrive_file_id', 'is', null) as {
      data: Array<{
        id: string
        gdrive_file_id: string
        storage_provider: string
        [key: string]: any
      }> | null
      error: any
    }

  if (fetchError) {
    console.error(`❌ Error fetching ${tableName}:`, fetchError)
    throw fetchError
  }

  if (!records || records.length === 0) {
    console.log(`   No Google Drive records found`)
    return 0
  }

  console.log(`   Found ${records.length} Google Drive records to verify`)

  const orphanedRecords: OrphanedRecord[] = []
  let checkedCount = 0

  // Check each file
  for (const record of records) {
    checkedCount++
    process.stdout.write(`\r   Checking ${checkedCount}/${records.length}...`)

    try {
      const response = await drive.files.get({
        fileId: record.gdrive_file_id!,
        fields: 'id, trashed',
        supportsAllDrives: true,
      })

      // If file is trashed, mark as orphaned
      if (response.data.trashed) {
        orphanedRecords.push({
          id: record.id,
          gdrive_file_id: record.gdrive_file_id,
          display_name: record[displayNameField] || 'Unknown',
        })
        console.log(`\n   ❌ Trashed: ${record[displayNameField]} (${record.id})`)
      }
    } catch (error: any) {
      // File not found or other errors - mark as orphaned
      if (error.code === 404 || error.status === 404) {
        orphanedRecords.push({
          id: record.id,
          gdrive_file_id: record.gdrive_file_id,
          display_name: record[displayNameField] || 'Unknown',
        })
        console.log(`\n   ❌ Not found: ${record[displayNameField]} (${record.id})`)
      } else {
        console.error(`\n   ⚠️  Error checking ${record.gdrive_file_id}:`, error.message)
      }
    }
  }

  console.log(`\n   📊 Results:`)
  console.log(`      Total checked: ${records.length}`)
  console.log(`      ✅ Valid: ${records.length - orphanedRecords.length}`)
  console.log(`      ❌ Orphaned: ${orphanedRecords.length}`)

  if (orphanedRecords.length === 0) {
    return 0
  }

  if (dryRun) {
    console.log(`\n   Orphaned records that would be deleted:`)
    orphanedRecords.forEach(record => {
      console.log(`      - ${record.display_name} (${record.id})`)
    })
  } else {
    console.log(`\n   🗑️  Deleting ${orphanedRecords.length} orphaned records...`)

    const idsToDelete = orphanedRecords.map(r => r.id)
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      console.error(`   ❌ Error deleting orphaned records:`, deleteError)
      throw deleteError
    }

    console.log(`   ✅ Successfully deleted ${orphanedRecords.length} orphaned records`)
  }

  return orphanedRecords.length
}

async function cleanupOrphanedMetadata(dryRun: boolean = true) {
  console.log(`🔍 Scanning for orphaned metadata records...`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no deletions)' : 'LIVE (will delete)'}\n`)

  let totalOrphaned = 0

  // Check all tables with storage sync
  try {
    totalOrphaned += await checkTableForOrphans('angled_shots', 'angle_name', dryRun)
    totalOrphaned += await checkTableForOrphans('product_images', 'file_name', dryRun)
    totalOrphaned += await checkTableForOrphans('backgrounds', 'name', dryRun)
    totalOrphaned += await checkTableForOrphans('composites', 'name', dryRun)
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    process.exit(1)
  }

  console.log(`\n\n📊 Overall Summary:`)
  console.log(`   Total orphaned records: ${totalOrphaned}`)

  if (totalOrphaned === 0) {
    console.log(`\n🎉 No orphaned records found! Database is clean.`)
  } else if (dryRun) {
    console.log(`\n⚠️  DRY RUN MODE - No deletions performed`)
    console.log(`\nTo actually delete these records, run with --execute flag`)
  } else {
    console.log(`\n🎉 Database cleanup complete!`)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = !args.includes('--execute')

if (dryRun) {
  console.log('⚠️  Running in DRY RUN mode. Use --execute to actually delete records.\n')
}

cleanupOrphanedMetadata(dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
