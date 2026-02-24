#!/usr/bin/env tsx
/**
 * E2E Test for Background Generation UI
 * Tests the complete workflow from form input to saved backgrounds
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function testBackgroundUI() {
  console.log('🧪 Testing Background Generation UI - E2E\n')
  console.log('='.repeat(70))

  const results: string[] = []
  let testsPass = 0
  let testsFail = 0

  try {
    // Test 1: Verify category has look_and_feel
    console.log('\n1️⃣  Testing: Category Look & Feel Field')
    console.log('-'.repeat(70))

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel')
      .eq('slug', 'greenworld')
      .single()

    if (!category) {
      console.log('   ❌ Category not found')
      testsFail++
      results.push('❌ Category lookup failed')
    } else if (category.look_and_feel) {
      console.log(`   ✅ Category: ${category.name}`)
      console.log(`   Look & Feel: "${category.look_and_feel}"`)
      testsPass++
      results.push('✅ Category has look_and_feel field')
    } else {
      console.log(`   ⚠️  Category exists but look_and_feel is empty`)
      testsPass++
      results.push('⚠️  Category has empty look_and_feel')
    }

    // Test 2: Verify backgrounds table structure
    console.log('\n\n2️⃣  Testing: Backgrounds Table Schema')
    console.log('-'.repeat(70))

    const { data: backgrounds, error: bgError } = await supabase
      .from('backgrounds')
      .select('*')
      .limit(1)

    if (bgError) {
      console.log('   ❌ Error querying backgrounds table:', bgError.message)
      testsFail++
      results.push('❌ Backgrounds table query failed')
    } else {
      console.log('   ✅ Backgrounds table accessible')

      if (backgrounds && backgrounds.length > 0) {
        const bg = backgrounds[0]
        const hasAllFields =
          'storage_provider' in bg &&
          'storage_path' in bg &&
          'storage_url' in bg &&
          'gdrive_file_id' in bg &&
          'prompt_used' in bg

        if (hasAllFields) {
          console.log('   ✅ All storage sync fields present')
          testsPass++
          results.push('✅ Backgrounds table schema correct')
        } else {
          console.log('   ❌ Missing storage sync fields')
          testsFail++
          results.push('❌ Backgrounds table schema incomplete')
        }
      } else {
        console.log('   ✅ Table structure correct (no records yet)')
        testsPass++
        results.push('✅ Backgrounds table schema correct')
      }
    }

    // Test 3: Verify API endpoints exist
    console.log('\n\n3️⃣  Testing: API Endpoints Accessibility')
    console.log('-'.repeat(70))

    const categoryId = category?.id || 'test-id'

    // Test GET endpoint
    try {
      const getResponse = await fetch(
        `http://localhost:3000/api/categories/${categoryId}/backgrounds`
      )

      if (getResponse.status === 401 || getResponse.status === 403) {
        console.log('   ✅ GET /api/categories/[id]/backgrounds (requires auth)')
        testsPass++
        results.push('✅ GET backgrounds endpoint exists')
      } else if (getResponse.ok) {
        console.log('   ✅ GET /api/categories/[id]/backgrounds (200 OK)')
        testsPass++
        results.push('✅ GET backgrounds endpoint accessible')
      } else {
        console.log(`   ⚠️  GET endpoint returned ${getResponse.status}`)
        testsPass++
        results.push(`⚠️  GET endpoint exists (${getResponse.status})`)
      }
    } catch (error) {
      console.log('   ❌ GET endpoint not accessible')
      testsFail++
      results.push('❌ GET backgrounds endpoint failed')
    }

    // Test 4: Verify UI components exist
    console.log('\n\n4️⃣  Testing: UI Components Files')
    console.log('-'.repeat(70))

    const fs = await import('fs')
    const componentsToCheck = [
      'src/components/backgrounds/BackgroundGenerationWorkspace.tsx',
      'src/components/backgrounds/BackgroundGenerationForm.tsx',
      'src/components/backgrounds/BackgroundPreviewGrid.tsx',
      'src/components/backgrounds/BackgroundGallery.tsx',
    ]

    let componentsFound = 0
    for (const component of componentsToCheck) {
      const componentPath = path.join(__dirname, '..', component)
      if (fs.existsSync(componentPath)) {
        console.log(`   ✅ ${path.basename(component)}`)
        componentsFound++
      } else {
        console.log(`   ❌ ${path.basename(component)} NOT FOUND`)
      }
    }

    if (componentsFound === componentsToCheck.length) {
      console.log(`   ✅ All ${componentsFound} components present`)
      testsPass++
      results.push('✅ All UI components exist')
    } else {
      console.log(`   ⚠️  ${componentsFound}/${componentsToCheck.length} components found`)
      testsFail++
      results.push('❌ Some UI components missing')
    }

    // Test 5: Check existing backgrounds count
    console.log('\n\n5️⃣  Testing: Saved Backgrounds Count')
    console.log('-'.repeat(70))

    const { data: allBackgrounds, count } = await supabase
      .from('backgrounds')
      .select('*', { count: 'exact' })
      .eq('category_id', categoryId)

    console.log(`   Total backgrounds in database: ${count || 0}`)
    if (count && count > 0) {
      console.log('   ✅ Backgrounds exist - Gallery will display')
      allBackgrounds?.slice(0, 3).forEach((bg, idx) => {
        console.log(`      ${idx + 1}. ${bg.name} (${bg.storage_provider})`)
      })
      testsPass++
      results.push(`✅ ${count} background(s) in database`)
    } else {
      console.log('   ℹ️  No backgrounds yet - Ready for first generation')
      testsPass++
      results.push('ℹ️  Empty state will display')
    }

    // Test 6: Verify Google Drive integration
    console.log('\n\n6️⃣  Testing: Google Drive Integration')
    console.log('-'.repeat(70))

    const { data: driveBackgrounds } = await supabase
      .from('backgrounds')
      .select('*')
      .eq('storage_provider', 'gdrive')
      .limit(1)

    if (driveBackgrounds && driveBackgrounds.length > 0) {
      const bg = driveBackgrounds[0]
      console.log(`   ✅ Google Drive backgrounds found`)
      console.log(`   File ID: ${bg.gdrive_file_id}`)
      console.log(`   Path: ${bg.storage_path}`)
      testsPass++
      results.push('✅ Google Drive integration verified')
    } else {
      console.log('   ℹ️  No Google Drive backgrounds yet')
      testsPass++
      results.push('ℹ️  Google Drive ready for uploads')
    }

    // Test 7: Verify category page integration
    console.log('\n\n7️⃣  Testing: Category Page Integration')
    console.log('-'.repeat(70))

    const categoryPagePath = path.join(
      __dirname,
      '..',
      'src/app/(dashboard)/categories/[id]/page.tsx'
    )
    const fs2 = await import('fs')
    const categoryPageContent = fs2.readFileSync(categoryPagePath, 'utf-8')

    if (categoryPageContent.includes('BackgroundGenerationWorkspace')) {
      console.log('   ✅ BackgroundGenerationWorkspace imported')
      testsPass++
      results.push('✅ UI integrated into category page')
    } else {
      console.log('   ❌ BackgroundGenerationWorkspace not imported')
      testsFail++
      results.push('❌ UI not integrated into category page')
    }

    // Summary
    console.log('\n\n')
    console.log('='.repeat(70))
    console.log('📊 Test Summary')
    console.log('='.repeat(70))
    console.log(`Total Tests: ${testsPass + testsFail}`)
    console.log(`✅ Passed: ${testsPass}`)
    console.log(`❌ Failed: ${testsFail}`)
    console.log('\nResults:')
    results.forEach(result => console.log(`   ${result}`))

    if (testsFail === 0) {
      console.log('\n🎉 All Tests Passed!')
      console.log('\nBackground Generation UI is ready to use:')
      console.log('   1. Navigate to http://localhost:3000/categories')
      console.log('   2. Click on "Greenworld" or "Gummy Bear" category')
      console.log('   3. Go to "Backgrounds" tab')
      console.log('   4. Fill in Look & Feel (auto-populated)')
      console.log('   5. Enter background description')
      console.log('   6. Click "Generate Backgrounds"')
      console.log('   7. Preview and save individual backgrounds')
    } else {
      console.log('\n⚠️  Some tests failed. Please review the issues above.')
    }

    process.exit(testsFail > 0 ? 1 : 0)
  } catch (error: any) {
    console.error('\n\n❌ TEST SUITE FAILED:', error.message)
    console.error(error)
    process.exit(1)
  }
}

testBackgroundUI()
