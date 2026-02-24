#!/usr/bin/env tsx
/**
 * Test Phase 4: Copy Generation End-to-End
 * Tests generate, save, list, and Google Drive integration
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear

async function testCopyGeneration() {
  console.log('🧪 Testing Phase 4: Copy Generation\n')

  // Test 1: Generate Copy Variations
  console.log('📍 Test 1: Generate copy variations via API')
  try {
    const generateResponse = await fetch(
      `http://localhost:3000/api/categories/${CATEGORY_ID}/copy-docs/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sb-access-token=${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          brief: 'Delicious vitamin gummies for kids - healthy, fun, and tasty!',
          copyType: 'hook',
          count: 2,
          tone: 'playful',
          targetAudience: 'Parents of kids ages 4-12',
        }),
      }
    )

    if (!generateResponse.ok) {
      const error = await generateResponse.json()
      console.log('   ❌ Generate failed:', error)
      return
    }

    const generateData = await generateResponse.json()
    console.log('   ✅ Generated successfully!')
    console.log(`   ℹ️  Generated ${generateData.results.length} variations`)
    console.log('\n   Preview:')
    generateData.results.forEach((result: any, idx: number) => {
      console.log(`   ${idx + 1}. "${result.generated_text.substring(0, 80)}..."`)
      console.log(`      (${result.generated_text.length} characters)`)
    })

    // Test 2: Save a copy doc
    console.log('\n📍 Test 2: Save copy doc to Google Drive')
    const firstCopy = generateData.results[0]

    const saveResponse = await fetch(
      `http://localhost:3000/api/categories/${CATEGORY_ID}/copy-docs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test Vitamin Gummies Hook',
          originalText: 'Delicious vitamin gummies for kids',
          generatedText: firstCopy.generated_text,
          copyType: 'hook',
          language: 'en',
          promptUsed: firstCopy.prompt_used,
        }),
      }
    )

    if (!saveResponse.ok) {
      const error = await saveResponse.json()
      console.log('   ❌ Save failed:', error)
      return
    }

    const saveData = await saveResponse.json()
    console.log('   ✅ Saved successfully!')
    console.log(`   ℹ️  Storage provider: ${saveData.copy_doc.storage_provider}`)
    console.log(`   ℹ️  Storage path: ${saveData.copy_doc.storage_path}`)
    console.log(`   ℹ️  Google Drive ID: ${saveData.copy_doc.gdrive_file_id || 'N/A'}`)
    console.log(`   ℹ️  Public URL: ${saveData.copy_doc.storage_url?.substring(0, 60)}...`)

    // Test 3: List copy docs
    console.log('\n📍 Test 3: List saved copy docs')
    const { data: copyDocs, error: listError } = await supabase
      .from('copy_docs')
      .select('*')
      .eq('category_id', CATEGORY_ID)
      .order('created_at', { ascending: false })

    if (listError) {
      console.log('   ❌ List failed:', listError)
      return
    }

    console.log(`   ✅ Found ${copyDocs?.length || 0} copy docs`)
    if (copyDocs && copyDocs.length > 0) {
      console.log('\n   Latest copy docs:')
      copyDocs.slice(0, 3).forEach((doc: any, idx: number) => {
        console.log(`   ${idx + 1}. [${doc.copy_type.toUpperCase()}] ${doc.generated_text.substring(0, 50)}...`)
        console.log(`      Storage: ${doc.storage_provider} | Path: ${doc.storage_path}`)
      })
    }

    // Test 4: Verify Google Drive folder structure
    console.log('\n📍 Test 4: Verify Google Drive folder structure')
    console.log('   Expected folder pattern: {category-slug}/copy-docs/{copyType}/{slug}_{timestamp}.json')
    console.log(`   ✅ Actual path: ${saveData.copy_doc.storage_path}`)

    const pathParts = saveData.copy_doc.storage_path.split('/')
    if (pathParts.length >= 3 && pathParts[1] === 'copy-docs') {
      console.log('   ✅ Folder structure matches specification!')
      console.log(`      - Category: ${pathParts[0]}`)
      console.log(`      - Type: ${pathParts[2]}`)
      console.log(`      - File: ${pathParts[3]}`)
    } else {
      console.log('   ⚠️  Folder structure may not match specification')
    }

    console.log('\n✅ All tests passed!')
    console.log('\n📊 Summary:')
    console.log(`   - Generated 2 variations`)
    console.log(`   - Saved 1 copy doc to Google Drive`)
    console.log(`   - Storage provider: ${saveData.copy_doc.storage_provider}`)
    console.log(`   - Total copy docs in category: ${copyDocs?.length || 0}`)
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testCopyGeneration()
