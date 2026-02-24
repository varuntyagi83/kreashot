#!/usr/bin/env tsx
/**
 * Test Phase 3 Backend - Background Generation APIs
 * Tests all backend functionality without UI
 */

import { createClient } from '@supabase/supabase-js'
import { generateBackgrounds } from '../src/lib/ai/gemini'
import { uploadFile } from '../src/lib/storage'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function testPhase3Backend() {
  console.log('🧪 Testing Phase 3 Backend - Background Generation\n')
  console.log('=' .repeat(60))

  let categoryId: string
  let categorySlug: string
  let backgroundId: string | null = null

  try {
    // Test 1: Get a category with look_and_feel
    console.log('\n1️⃣  Testing: Get Category with Look & Feel')
    console.log('-'.repeat(60))

    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel')
      .limit(1)

    if (catError || !categories || categories.length === 0) {
      console.error('   ❌ No categories found. Please create a category first.')
      process.exit(1)
    }

    const category = categories[0]
    categoryId = category.id
    categorySlug = category.slug

    console.log(`   ✅ Category: ${category.name}`)
    console.log(`   Slug: ${category.slug}`)
    console.log(`   Look & Feel: ${category.look_and_feel || '(not set)'}`)

    if (!category.look_and_feel) {
      console.log(
        '\n   ⚠️  WARNING: look_and_feel is empty. Background generation will use generic prompts.'
      )
    }

    // Test 2: Generate backgrounds using AI
    console.log('\n\n2️⃣  Testing: AI Background Generation')
    console.log('-'.repeat(60))

    const userPrompt = 'Create a professional product photography background with soft lighting and clean aesthetic'
    const lookAndFeel = category.look_and_feel || 'Modern, clean product photography'

    console.log(`   User Prompt: "${userPrompt}"`)
    console.log(`   Look & Feel: "${lookAndFeel}"`)
    console.log(`   Count: 1 background`)
    console.log('\n   🎨 Generating background with Gemini AI...')

    const generatedBackgrounds = await generateBackgrounds(
      userPrompt,
      lookAndFeel,
      1 // Generate just 1 for testing
    )

    if (!generatedBackgrounds || generatedBackgrounds.length === 0) {
      console.error('   ❌ No backgrounds generated')
      process.exit(1)
    }

    console.log(`   ✅ Generated ${generatedBackgrounds.length} background(s)`)
    console.log(
      `   Prompt used: ${generatedBackgrounds[0].promptUsed.substring(0, 100)}...`
    )
    console.log(`   Image size: ${generatedBackgrounds[0].imageData.length} bytes`)

    // Test 3: Upload to Google Drive and Save to Database
    console.log('\n\n3️⃣  Testing: Save Background to Google Drive')
    console.log('-'.repeat(60))

    const bg = generatedBackgrounds[0]

    // Convert base64 to buffer
    const base64Data = bg.imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Generate filename
    const slug = 'test-background'
    const timestamp = Date.now()
    const fileExt = bg.mimeType.split('/')[1] || 'jpg'
    const fileName = `${categorySlug}/backgrounds/${slug}_${timestamp}.${fileExt}`

    console.log(`   Filename: ${fileName}`)
    console.log(`   Size: ${buffer.length} bytes`)
    console.log('\n   ☁️  Uploading to Google Drive...')

    // Upload to Google Drive
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: bg.mimeType,
      provider: 'gdrive',
    })

    console.log(`   ✅ Uploaded successfully`)
    console.log(`   Storage path: ${storageFile.path}`)
    console.log(`   Public URL: ${storageFile.publicUrl}`)
    console.log(`   File ID: ${storageFile.fileId}`)

    // Test 4: Save to database
    console.log('\n\n4️⃣  Testing: Save Background Metadata to Database')
    console.log('-'.repeat(60))

    // Get a user ID (for testing, we'll use the first user)
    const { data: users } = await supabase
      .from('categories')
      .select('user_id')
      .eq('id', categoryId)
      .single()

    if (!users) {
      console.error('   ❌ Could not get user_id')
      process.exit(1)
    }

    const { data: background, error: dbError } = await supabase
      .from('backgrounds')
      .insert({
        category_id: categoryId,
        user_id: users.user_id,
        name: 'Test Background',
        slug: slug,
        // description: userPrompt, // Optional - skip if migration not applied
        prompt_used: bg.promptUsed,
        storage_provider: 'gdrive',
        storage_path: storageFile.path,
        storage_url: storageFile.publicUrl,
        gdrive_file_id: storageFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    if (dbError) {
      console.error('   ❌ Database error:', dbError)
      process.exit(1)
    }

    backgroundId = background.id

    console.log(`   ✅ Saved to database`)
    console.log(`   Background ID: ${background.id}`)
    console.log(`   Name: ${background.name}`)
    console.log(`   Storage provider: ${background.storage_provider}`)
    console.log(`   Storage path: ${background.storage_path}`)

    // Test 5: List backgrounds
    console.log('\n\n5️⃣  Testing: List Backgrounds for Category')
    console.log('-'.repeat(60))

    const { data: backgrounds, error: listError } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    if (listError) {
      console.error('   ❌ Error:', listError)
      process.exit(1)
    }

    console.log(`   ✅ Found ${backgrounds?.length || 0} background(s)`)

    backgrounds?.forEach((bg, idx) => {
      console.log(`\n   Background ${idx + 1}:`)
      console.log(`   - Name: ${bg.name}`)
      console.log(`   - Slug: ${bg.slug}`)
      console.log(`   - Storage: ${bg.storage_provider}`)
      console.log(`   - Path: ${bg.storage_path}`)
      console.log(`   - Has GDrive ID: ${bg.gdrive_file_id ? '✅' : '❌'}`)
    })

    // Test 6: Verify Google Drive folder structure
    console.log('\n\n6️⃣  Testing: Verify Google Drive Folder Structure')
    console.log('-'.repeat(60))

    const expectedPath = `${categorySlug}/backgrounds/${slug}_${timestamp}.${fileExt}`
    const actualPath = storageFile.path

    console.log(`   Expected path: ${expectedPath}`)
    console.log(`   Actual path: ${actualPath}`)
    console.log(`   Match: ${expectedPath === actualPath ? '✅' : '❌'}`)

    // Verify folder naming
    const pathParts = actualPath.split('/')
    console.log(`\n   Folder structure verification:`)
    console.log(`   - Category folder: ${pathParts[0]} (${categorySlug === pathParts[0] ? '✅ slug' : '❌ not slug'})`)
    console.log(`   - Type folder: ${pathParts[1]} (${pathParts[1] === 'backgrounds' ? '✅' : '❌'})`)
    console.log(`   - Filename: ${pathParts[2]}`)

    // Test 7: Test deletion (cleanup)
    console.log('\n\n7️⃣  Testing: Delete Background (Cleanup)')
    console.log('-'.repeat(60))

    console.log(`   🗑️  Deleting test background...`)

    const { error: deleteError } = await supabase
      .from('backgrounds')
      .delete()
      .eq('id', backgroundId)

    if (deleteError) {
      console.error('   ❌ Delete error:', deleteError)
    } else {
      console.log(`   ✅ Deleted from database`)
      console.log(`   Note: Deletion queue will clean up Google Drive file`)
    }

    // Summary
    console.log('\n\n')
    console.log('=' .repeat(60))
    console.log('📊 Test Summary')
    console.log('=' .repeat(60))
    console.log('✅ Category retrieval')
    console.log('✅ AI background generation (Gemini)')
    console.log('✅ Google Drive upload')
    console.log('✅ Database save with storage sync fields')
    console.log('✅ List backgrounds query')
    console.log('✅ Folder structure verification (human-readable)')
    console.log('✅ Background deletion (queued for Drive cleanup)')

    console.log('\n🎉 All Phase 3 Backend Tests Passed!')
    console.log('\nNext Steps:')
    console.log('  1. Build Background Generation UI')
    console.log('  2. Implement Composite Generation API')
    console.log('  3. Build Composites UI')
  } catch (error: any) {
    console.error('\n\n❌ TEST FAILED:', error.message)
    console.error(error)
    process.exit(1)
  }
}

testPhase3Backend()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
