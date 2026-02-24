/**
 * Test multi-format background generation
 * Generates backgrounds in all aspect ratios (1:1, 16:9, 9:16, 4:5)
 * to verify:
 * - Gemini API imageConfig.aspectRatio works correctly
 * - Backgrounds are saved to correct format folders
 * - Database stores format metadata correctly
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const FORMATS = [
  { format: '1:1', width: 1080, height: 1080, description: 'Instagram Square' },
  { format: '16:9', width: 1920, height: 1080, description: 'Facebook/YouTube Landscape' },
  { format: '9:16', width: 1080, height: 1920, description: 'Instagram Stories' },
  { format: '4:5', width: 1080, height: 1350, description: 'Instagram Portrait' }
]

async function generateBackgroundsForFormat(categoryId, format, formatConfig) {
  console.log(`\n📸 Generating ${format} background (${formatConfig.width}x${formatConfig.height})...`)
  console.log(`   Platform: ${formatConfig.description}`)

  const API_URL = `http://localhost:3000/api/categories/${categoryId}/backgrounds/generate`

  const requestBody = {
    prompt: 'Colorful, vibrant, playful background with soft bokeh effect and bright pastel colors',
    count: 1,
    format: format // Pass format parameter
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    console.log(`   ✅ Generated ${data.results?.length || 0} background(s)`)

    // Save each generated background
    if (data.results && data.results.length > 0) {
      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i]

        // Save to database via POST endpoint
        const saveResponse = await fetch(`http://localhost:3000/api/categories/${categoryId}/backgrounds`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: `${format} Test Background ${Date.now()}`,
            description: `Test background for ${formatConfig.description}`,
            promptUsed: result.promptUsed,
            imageData: result.imageData,
            mimeType: result.mimeType,
            format: format,
            width: formatConfig.width,
            height: formatConfig.height
          })
        })

        if (!saveResponse.ok) {
          const errorText = await saveResponse.text()
          throw new Error(`Save error (${saveResponse.status}): ${errorText}`)
        }

        const savedData = await saveResponse.json()
        console.log(`   ✅ Saved to database and Google Drive`)
        console.log(`      ID: ${savedData.background?.id}`)
        console.log(`      Path: ${savedData.background?.storage_path}`)
        console.log(`      Format: ${savedData.background?.format} (${savedData.background?.width}x${savedData.background?.height})`)
      }
    }

    return data
  } catch (error) {
    console.error(`   ❌ Error:`, error.message)
    throw error
  }
}

async function testMultiFormatBackgrounds() {
  console.log('🧪 Testing Multi-Format Background Generation\n')
  console.log('='.repeat(60))

  try {
    // Get category
    const category = await sql`
      SELECT id, name, slug, look_and_feel
      FROM categories
      WHERE slug = 'gummy-bear'
      LIMIT 1
    `

    if (!category || category.length === 0) {
      throw new Error('Category not found')
    }

    const cat = category[0]
    console.log('\n📂 Category:', cat.name)
    console.log('   ID:', cat.id)
    console.log('   Look & Feel:', cat.look_and_feel || '(none)')

    // Generate backgrounds for each format
    const results = []
    for (const formatConfig of FORMATS) {
      try {
        const result = await generateBackgroundsForFormat(cat.id, formatConfig.format, formatConfig)
        results.push({
          format: formatConfig.format,
          success: true,
          data: result
        })
      } catch (error) {
        results.push({
          format: formatConfig.format,
          success: false,
          error: error.message
        })
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 TEST RESULTS')
    console.log('='.repeat(60))

    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    console.log(`✅ Successful: ${successful.length}/${FORMATS.length}`)
    successful.forEach(r => {
      console.log(`   - ${r.format}: Generated and saved`)
    })

    if (failed.length > 0) {
      console.log(`\n❌ Failed: ${failed.length}/${FORMATS.length}`)
      failed.forEach(r => {
        console.log(`   - ${r.format}: ${r.error}`)
      })
    }

    // Verify database records
    console.log('\n📊 Database verification:')
    const dbBackgrounds = await sql`
      SELECT format, COUNT(*) as count,
             AVG(width) as avg_width, AVG(height) as avg_height
      FROM backgrounds
      WHERE category_id = ${cat.id}
      GROUP BY format
      ORDER BY format
    `

    dbBackgrounds.forEach(row => {
      console.log(`   ${row.format}: ${row.count} backgrounds (${Math.round(row.avg_width)}x${Math.round(row.avg_height)})`)
    })

    console.log('\n🎉 Multi-format background generation test complete!')
    console.log('📝 Next: Check Google Drive to verify folder organization')

    return failed.length === 0 ? 0 : 1

  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
    return 1
  } finally {
    await sql.end()
  }
}

// Check if dev server is running
console.log('⚠️  Make sure the Next.js dev server is running on http://localhost:3000')
console.log('   Run: npm run dev\n')

setTimeout(() => {
  testMultiFormatBackgrounds().then(exitCode => {
    process.exit(exitCode)
  })
}, 2000)
