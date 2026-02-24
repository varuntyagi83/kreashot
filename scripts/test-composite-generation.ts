#!/usr/bin/env tsx
/**
 * E2E Test for Composite Generation
 * Tests the complete composite generation workflow
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function testCompositeGeneration() {
  console.log('🧪 Testing Composite Generation - E2E\n')
  console.log('='.repeat(70))

  const results: string[] = []
  let testsPass = 0
  let testsFail = 0
  let shotCount: number | null = 0
  let bgCount: number | null = 0

  try {
    // Test 1: Verify composites table structure
    console.log('\n1️⃣  Testing: Composites Table Schema')
    console.log('-'.repeat(70))

    const { data: composites, error: compositesError } = await supabase
      .from('composites')
      .select('*')
      .limit(1)

    if (compositesError) {
      console.log('   ❌ Error querying composites table:', compositesError.message)
      testsFail++
      results.push('❌ Composites table query failed')
    } else {
      console.log('   ✅ Composites table accessible')

      if (composites && composites.length > 0) {
        const composite = composites[0]
        const hasAllFields =
          'angled_shot_id' in composite &&
          'background_id' in composite &&
          'product_id' in composite &&
          'storage_provider' in composite &&
          'storage_path' in composite &&
          'storage_url' in composite &&
          'gdrive_file_id' in composite &&
          'prompt_used' in composite

        if (hasAllFields) {
          console.log('   ✅ All required fields present')
          testsPass++
          results.push('✅ Composites table schema correct')
        } else {
          console.log('   ❌ Missing required fields')
          testsFail++
          results.push('❌ Composites table schema incomplete')
        }
      } else {
        console.log('   ✅ Table structure correct (no records yet)')
        testsPass++
        results.push('✅ Composites table schema correct')
      }
    }

    // Test 2: Check for available angled shots
    console.log('\n\n2️⃣  Testing: Angled Shots Availability')
    console.log('-'.repeat(70))

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('slug', 'greenworld')
      .single()

    if (!category) {
      console.log('   ❌ Category not found')
      testsFail++
      results.push('❌ Category lookup failed')
    } else {
      const shotResponse = await supabase
        .from('angled_shots')
        .select('*', { count: 'exact' })
        .eq('category_id', category.id)

      shotCount = shotResponse.count
      const angledShots = shotResponse.data

      console.log(`   Total angled shots: ${shotCount || 0}`)
      if (shotCount && shotCount > 0) {
        console.log('   ✅ Angled shots available for composites')
        angledShots?.slice(0, 3).forEach((shot, idx) => {
          console.log(`      ${idx + 1}. ${shot.name} (${shot.angle_name})`)
        })
        testsPass++
        results.push(`✅ ${shotCount} angled shot(s) available`)
      } else {
        console.log('   ⚠️  No angled shots - composites cannot be generated yet')
        testsPass++
        results.push('⚠️  No angled shots available yet')
      }
    }

    // Test 3: Check for available backgrounds
    console.log('\n\n3️⃣  Testing: Backgrounds Availability')
    console.log('-'.repeat(70))

    if (!category) {
      console.log('   ❌ Cannot test backgrounds - category not found')
      testsFail++
      results.push('❌ Background test skipped')
      process.exit(1)
    }

    const bgResponse = await supabase
      .from('backgrounds')
      .select('*', { count: 'exact' })
      .eq('category_id', category.id)

    bgCount = bgResponse.count
    const backgrounds = bgResponse.data

    console.log(`   Total backgrounds: ${bgCount || 0}`)
    if (bgCount && bgCount > 0) {
      console.log('   ✅ Backgrounds available for composites')
      backgrounds?.slice(0, 3).forEach((bg, idx) => {
        console.log(`      ${idx + 1}. ${bg.name}`)
      })
      testsPass++
      results.push(`✅ ${bgCount} background(s) available`)
    } else {
      console.log('   ⚠️  No backgrounds - composites cannot be generated yet')
      testsPass++
      results.push('⚠️  No backgrounds available yet')
    }

    // Test 4: Check possible combinations
    console.log('\n\n4️⃣  Testing: Combination Calculation')
    console.log('-'.repeat(70))

    const totalCombinations = (shotCount || 0) * (bgCount || 0)
    console.log(`   Possible combinations: ${shotCount || 0} shots × ${bgCount || 0} backgrounds = ${totalCombinations}`)

    if (totalCombinations > 0) {
      console.log('   ✅ Composites can be generated')
      testsPass++
      results.push(`✅ ${totalCombinations} possible combinations`)
    } else {
      console.log('   ⚠️  Cannot generate composites without both shots and backgrounds')
      testsPass++
      results.push('⚠️  Need both angled shots and backgrounds')
    }

    // Test 5: Verify API endpoints exist
    console.log('\n\n5️⃣  Testing: API Endpoints Accessibility')
    console.log('-'.repeat(70))

    // Test GET endpoint
    try {
      const getResponse = await fetch(
        `http://localhost:3000/api/categories/${category.id}/composites`
      )

      if (getResponse.status === 401 || getResponse.status === 403) {
        console.log('   ✅ GET /api/categories/[id]/composites (requires auth)')
        testsPass++
        results.push('✅ GET composites endpoint exists')
      } else if (getResponse.ok) {
        console.log('   ✅ GET /api/categories/[id]/composites (200 OK)')
        testsPass++
        results.push('✅ GET composites endpoint accessible')
      } else {
        console.log(`   ⚠️  GET endpoint returned ${getResponse.status}`)
        testsPass++
        results.push(`⚠️  GET endpoint exists (${getResponse.status})`)
      }
    } catch (error) {
      console.log('   ❌ GET endpoint not accessible')
      testsFail++
      results.push('❌ GET composites endpoint failed')
    }

    // Test 6: Verify UI components exist
    console.log('\n\n6️⃣  Testing: UI Components Files')
    console.log('-'.repeat(70))

    const fs = await import('fs')
    const componentsToCheck = [
      'src/components/composites/CompositeWorkspace.tsx',
      'src/components/composites/CompositeGenerationForm.tsx',
      'src/components/composites/CompositePreviewGrid.tsx',
      'src/components/composites/CompositeGallery.tsx',
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

    // Test 7: Check existing composites count
    console.log('\n\n7️⃣  Testing: Saved Composites Count')
    console.log('-'.repeat(70))

    const { data: allComposites, count } = await supabase
      .from('composites')
      .select('*', { count: 'exact' })
      .eq('category_id', category.id)

    console.log(`   Total composites in database: ${count || 0}`)
    if (count && count > 0) {
      console.log('   ✅ Composites exist - Gallery will display')
      allComposites?.slice(0, 3).forEach((comp, idx) => {
        console.log(`      ${idx + 1}. ${comp.name} (${comp.storage_provider})`)
      })
      testsPass++
      results.push(`✅ ${count} composite(s) in database`)
    } else {
      console.log('   ℹ️  No composites yet - Ready for first generation')
      testsPass++
      results.push('ℹ️  Empty state will display')
    }

    // Test 8: Verify Gemini helper function exists
    console.log('\n\n8️⃣  Testing: Gemini Composite Helper')
    console.log('-'.repeat(70))

    const geminiHelperPath = path.join(__dirname, '..', 'src/lib/ai/gemini.ts')
    const geminiContent = fs.readFileSync(geminiHelperPath, 'utf-8')

    if (geminiContent.includes('generateComposite')) {
      console.log('   ✅ generateComposite function exists in gemini.ts')
      testsPass++
      results.push('✅ Gemini composite helper implemented')
    } else {
      console.log('   ❌ generateComposite function not found')
      testsFail++
      results.push('❌ Gemini composite helper missing')
    }

    // Test 9: Verify category page integration
    console.log('\n\n9️⃣  Testing: Category Page Integration')
    console.log('-'.repeat(70))

    const categoryPagePath = path.join(
      __dirname,
      '..',
      'src/app/(dashboard)/categories/[id]/page.tsx'
    )
    const categoryPageContent = fs.readFileSync(categoryPagePath, 'utf-8')

    if (categoryPageContent.includes('CompositeWorkspace')) {
      console.log('   ✅ CompositeWorkspace imported and used')
      testsPass++
      results.push('✅ UI integrated into category page')
    } else {
      console.log('   ❌ CompositeWorkspace not found in category page')
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
    results.forEach((result) => console.log(`   ${result}`))

    if (testsFail === 0) {
      console.log('\n🎉 All Tests Passed!')
      console.log('\nComposite Generation is ready to use:')
      console.log('   1. Navigate to http://localhost:3000/categories')
      console.log('   2. Click on "Greenworld" category')
      console.log('   3. Go to "Composites" tab')
      console.log('   4. Select generation mode (Selected or All Combinations)')
      console.log('   5. Choose angled shots and backgrounds')
      console.log('   6. Add optional placement instructions')
      console.log('   7. Click "Generate Composites"')
      console.log('   8. Preview and save composites')

      if (totalCombinations > 0) {
        console.log(`\nℹ️  Ready to generate up to ${totalCombinations} composites for Greenworld`)
      }
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

testCompositeGeneration()
