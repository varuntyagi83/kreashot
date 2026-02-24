/**
 * End-to-End Test Script for Google Drive Storage
 *
 * Tests the complete flow:
 * 1. Copy generation → Google Drive storage
 * 2. Background generation → Google Drive storage
 * 3. Composite generation → Google Drive storage
 * 4. Final asset generation → Google Drive storage
 *
 * Usage:
 *   npx tsx scripts/test-e2e-gdrive-storage.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { google } from 'googleapis'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Initialize Google Drive API
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

interface TestResult {
  feature: string
  passed: boolean
  message: string
  details?: any
}

const results: TestResult[] = []

async function testCopyDocsStorage() {
  console.log('\n📝 Testing Copy Docs Storage...')

  try {
    // 1. Check database schema
    const { data: copyDocs, error } = await supabase
      .from('copy_docs')
      .select('id, storage_provider, storage_path, storage_url, gdrive_file_id')
      .limit(3)

    if (error) throw error

    if (!copyDocs || copyDocs.length === 0) {
      results.push({
        feature: 'Copy Docs Storage',
        passed: false,
        message: 'No copy docs found in database. Generate some copy first.',
      })
      return
    }

    console.log(`   Found ${copyDocs.length} copy docs in database`)

    // 2. Verify all have storage fields
    const hasStorageFields = copyDocs.every(
      (doc) => doc.storage_provider && doc.storage_path && doc.storage_url
    )

    if (!hasStorageFields) {
      results.push({
        feature: 'Copy Docs Storage',
        passed: false,
        message: 'Some copy docs missing storage fields',
        details: copyDocs,
      })
      return
    }

    // 3. Verify Google Drive files exist
    let verifiedCount = 0
    for (const doc of copyDocs.filter((d) => d.gdrive_file_id)) {
      try {
        await drive.files.get({
          fileId: doc.gdrive_file_id!,
          fields: 'id, name',
          supportsAllDrives: true,
        })
        verifiedCount++
      } catch (err) {
        console.log(`   ⚠️  File not found in Google Drive: ${doc.gdrive_file_id}`)
      }
    }

    console.log(`   ✅ Verified ${verifiedCount}/${copyDocs.length} files in Google Drive`)

    results.push({
      feature: 'Copy Docs Storage',
      passed: verifiedCount > 0,
      message: `${verifiedCount}/${copyDocs.length} files verified in Google Drive`,
      details: {
        total: copyDocs.length,
        verified: verifiedCount,
      },
    })
  } catch (error: any) {
    results.push({
      feature: 'Copy Docs Storage',
      passed: false,
      message: `Error: ${error.message}`,
    })
  }
}

async function testBackgroundsStorage() {
  console.log('\n🎨 Testing Backgrounds Storage...')

  try {
    // 1. Check database schema
    const { data: backgrounds, error } = await supabase
      .from('backgrounds')
      .select('id, name, format, storage_provider, storage_path, storage_url, gdrive_file_id')
      .limit(3)

    if (error) throw error

    if (!backgrounds || backgrounds.length === 0) {
      results.push({
        feature: 'Backgrounds Storage',
        passed: false,
        message: 'No backgrounds found in database. Generate some backgrounds first.',
      })
      return
    }

    console.log(`   Found ${backgrounds.length} backgrounds in database`)

    // 2. Verify all have storage fields
    const hasStorageFields = backgrounds.every(
      (bg) => bg.storage_provider && bg.storage_path && bg.storage_url
    )

    if (!hasStorageFields) {
      results.push({
        feature: 'Backgrounds Storage',
        passed: false,
        message: 'Some backgrounds missing storage fields',
        details: backgrounds,
      })
      return
    }

    // 3. Verify format-specific folders
    const formatFolders = backgrounds.map((bg) => {
      const pathParts = bg.storage_path.split('/')
      return pathParts.find((p) => p.includes('x'))
    })
    console.log(`   Formats detected: ${[...new Set(formatFolders)].join(', ')}`)

    // 4. Verify Google Drive files exist
    let verifiedCount = 0
    for (const bg of backgrounds.filter((b) => b.gdrive_file_id)) {
      try {
        const { data } = await drive.files.get({
          fileId: bg.gdrive_file_id!,
          fields: 'id, name, mimeType',
          supportsAllDrives: true,
        })
        verifiedCount++
        console.log(`   ✅ ${bg.name} (${data.mimeType})`)
      } catch (err) {
        console.log(`   ⚠️  File not found: ${bg.name}`)
      }
    }

    results.push({
      feature: 'Backgrounds Storage',
      passed: verifiedCount > 0,
      message: `${verifiedCount}/${backgrounds.length} background files verified`,
      details: {
        total: backgrounds.length,
        verified: verifiedCount,
        formats: [...new Set(backgrounds.map((b) => b.format))],
      },
    })
  } catch (error: any) {
    results.push({
      feature: 'Backgrounds Storage',
      passed: false,
      message: `Error: ${error.message}`,
    })
  }
}

async function testCompositesStorage() {
  console.log('\n🔀 Testing Composites Storage...')

  try {
    // 1. Check database schema
    const { data: composites, error } = await supabase
      .from('composites')
      .select(`
        id,
        name,
        format,
        width,
        height,
        storage_provider,
        storage_path,
        storage_url,
        gdrive_file_id,
        angled_shot:angled_shot_id (angle_name),
        background:background_id (name)
      `)
      .limit(3)

    if (error) throw error

    if (!composites || composites.length === 0) {
      results.push({
        feature: 'Composites Storage',
        passed: false,
        message: 'No composites found in database. Generate some composites first.',
      })
      return
    }

    console.log(`   Found ${composites.length} composites in database`)

    // 2. Verify all have storage fields + format info
    const hasRequiredFields = composites.every(
      (comp) =>
        comp.storage_provider &&
        comp.storage_path &&
        comp.storage_url &&
        comp.format &&
        comp.width &&
        comp.height
    )

    if (!hasRequiredFields) {
      results.push({
        feature: 'Composites Storage',
        passed: false,
        message: 'Some composites missing required fields',
        details: composites,
      })
      return
    }

    console.log('   Format breakdown:')
    const formatGroups = composites.reduce((acc: any, comp) => {
      const key = `${comp.format} (${comp.width}x${comp.height})`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    Object.entries(formatGroups).forEach(([format, count]) => {
      console.log(`      ${format}: ${count} composite(s)`)
    })

    // 3. Verify Google Drive files exist
    let verifiedCount = 0
    for (const comp of composites.filter((c) => c.gdrive_file_id)) {
      try {
        const { data } = await drive.files.get({
          fileId: comp.gdrive_file_id!,
          fields: 'id, name, mimeType, size',
          supportsAllDrives: true,
        })
        verifiedCount++
        const sizeMB = parseInt(data.size || '0') / 1024 / 1024
        console.log(`   ✅ ${comp.name} (${sizeMB.toFixed(2)} MB)`)
      } catch (err) {
        console.log(`   ⚠️  File not found: ${comp.name}`)
      }
    }

    results.push({
      feature: 'Composites Storage',
      passed: verifiedCount > 0,
      message: `${verifiedCount}/${composites.length} composite files verified`,
      details: {
        total: composites.length,
        verified: verifiedCount,
        formats: [...new Set(composites.map((c) => c.format))],
      },
    })
  } catch (error: any) {
    results.push({
      feature: 'Composites Storage',
      passed: false,
      message: `Error: ${error.message}`,
    })
  }
}

async function testFinalAssetsStorage() {
  console.log('\n🎯 Testing Final Assets Storage...')

  try {
    // 1. Check database schema
    const { data: finalAssets, error } = await supabase
      .from('final_assets')
      .select('id, name, format, width, height, storage_provider, storage_path, storage_url, gdrive_file_id')
      .limit(3)

    if (error) throw error

    if (!finalAssets || finalAssets.length === 0) {
      results.push({
        feature: 'Final Assets Storage',
        passed: false,
        message: 'No final assets found in database. Generate some final assets first.',
      })
      return
    }

    console.log(`   Found ${finalAssets.length} final assets in database`)

    // 2. Verify all have storage fields
    const hasStorageFields = finalAssets.every(
      (asset) => asset.storage_provider && asset.storage_path && asset.storage_url
    )

    if (!hasStorageFields) {
      results.push({
        feature: 'Final Assets Storage',
        passed: false,
        message: 'Some final assets missing storage fields',
        details: finalAssets,
      })
      return
    }

    // 3. Verify Google Drive files exist
    let verifiedCount = 0
    for (const asset of finalAssets.filter((a) => a.gdrive_file_id)) {
      try {
        const { data } = await drive.files.get({
          fileId: asset.gdrive_file_id!,
          fields: 'id, name, mimeType',
          supportsAllDrives: true,
        })
        verifiedCount++
        console.log(`   ✅ ${asset.name} (${asset.format})`)
      } catch (err) {
        console.log(`   ⚠️  File not found: ${asset.name}`)
      }
    }

    results.push({
      feature: 'Final Assets Storage',
      passed: verifiedCount > 0,
      message: `${verifiedCount}/${finalAssets.length} final asset files verified`,
      details: {
        total: finalAssets.length,
        verified: verifiedCount,
      },
    })
  } catch (error: any) {
    results.push({
      feature: 'Final Assets Storage',
      passed: false,
      message: `Error: ${error.message}`,
    })
  }
}

async function testEnvironmentVariables() {
  console.log('\n🔐 Testing Environment Variables...')

  const required = {
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'GOOGLE_DRIVE_CLIENT_EMAIL': process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    'GOOGLE_DRIVE_PRIVATE_KEY': process.env.GOOGLE_DRIVE_PRIVATE_KEY,
    'GOOGLE_DRIVE_FOLDER_ID': process.env.GOOGLE_DRIVE_FOLDER_ID,
    'GOOGLE_GEMINI_API_KEY': process.env.GOOGLE_GEMINI_API_KEY,
    'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
  }

  const missing: string[] = []
  Object.entries(required).forEach(([key, value]) => {
    if (!value) {
      missing.push(key)
      console.log(`   ❌ ${key}`)
    } else {
      console.log(`   ✅ ${key}`)
    }
  })

  results.push({
    feature: 'Environment Variables',
    passed: missing.length === 0,
    message: missing.length === 0
      ? 'All required env vars are set'
      : `Missing: ${missing.join(', ')}`,
  })
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║   AdForge E2E Google Drive Storage Test                      ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')

  await testEnvironmentVariables()
  await testCopyDocsStorage()
  await testBackgroundsStorage()
  await testCompositesStorage()
  await testFinalAssetsStorage()

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║   TEST SUMMARY                                                ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌'
    console.log(`${icon} ${result.feature}: ${result.message}`)
    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`)
    }
  })

  console.log('\n' + '═'.repeat(65))
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
  console.log('═'.repeat(65))

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Please check the errors above.')
    console.log('\n📝 Next steps:')
    console.log('   1. Verify environment variables are set in .env.local')
    console.log('   2. Generate test data if missing:')
    console.log('      - Go to Copy tab → Generate copy')
    console.log('      - Go to Backgrounds tab → Generate backgrounds')
    console.log('      - Go to Composites tab → Generate composites')
    console.log('      - Go to Final Assets tab → Generate final asset')
    process.exit(1)
  } else {
    console.log('\n🎉 All tests passed! Google Drive storage is working correctly.')
    process.exit(0)
  }
}

main()
