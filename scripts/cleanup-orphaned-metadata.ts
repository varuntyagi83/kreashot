#!/usr/bin/env tsx
/**
 * Cleanup orphaned metadata via API endpoint
 * Calls the admin API to remove Supabase records where Google Drive files are trashed/missing
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const API_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://ad-forge-opal.vercel.app'
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) {
  console.error('❌ Missing CRON_SECRET environment variable')
  console.error('   Add CRON_SECRET to .env.local to run this script')
  process.exit(1)
}

async function cleanupOrphanedMetadata(dryRun: boolean = true) {
  console.log(`🔍 Calling cleanup API...`)
  console.log(`   API: ${API_URL}/api/admin/cleanup-orphaned-metadata`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no deletions)' : 'LIVE (will delete)'}\n`)

  try {
    const response = await fetch(`${API_URL}/api/admin/cleanup-orphaned-metadata`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dryRun }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('❌ API Error:', data.error)
      if (data.details) {
        console.error('   Details:', data.details)
      }
      process.exit(1)
    }

    console.log(`✅ ${data.message}\n`)
    console.log(`📊 Statistics:`)
    console.log(`   Total records checked: ${data.stats.total}`)
    console.log(`   ✅ Valid records: ${data.stats.valid}`)
    console.log(`   ❌ Orphaned records: ${data.stats.orphaned}`)
    if (!dryRun) {
      console.log(`   🗑️  Deleted: ${data.stats.deleted}`)
    }

    if (data.orphanedRecords && data.orphanedRecords.length > 0) {
      console.log(`\n📋 Orphaned Records ${dryRun ? '(would be deleted)' : '(deleted)'}:`)
      data.orphanedRecords.forEach((record: any) => {
        console.log(`   - ${record.angle_name} (${record.id})`)
        console.log(`     File: ${record.gdrive_file_id}`)
      })
    }

    if (dryRun && data.stats.orphaned > 0) {
      console.log(`\n💡 To actually delete these records, run with --execute flag`)
    } else if (!dryRun && data.stats.deleted > 0) {
      console.log(`\n🎉 Cleanup complete!`)
    } else if (data.stats.orphaned === 0) {
      console.log(`\n🎉 No orphaned records found! Database is clean.`)
    }
  } catch (error: any) {
    console.error('❌ Error calling API:', error.message)
    process.exit(1)
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
