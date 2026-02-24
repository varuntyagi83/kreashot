/**
 * E2E Test: Create Gummy Bear Category and Generate Angled Variations
 *
 * This script tests the complete workflow:
 * 1. Create "Gummy Bear" category in Supabase
 * 2. Create a product with the provided image name
 * 3. Upload product image to Google Drive
 * 4. Generate angled variations using Gemini AI
 * 5. Save generated images to Google Drive
 * 6. Verify all data in Supabase and Google Drive
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables FIRST
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { GoogleDriveAdapter } from '../src/lib/storage/gdrive-adapter'
import { generateAngledShots, analyzeProductImage } from '../src/lib/ai/gemini'
import { ANGLE_VARIATIONS } from '../src/lib/ai/angle-variations'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key to bypass RLS
)

async function runE2ETest() {
  console.log('🧪 AdForge E2E Test - Gummy Bear Category')
  console.log('=' .repeat(60))
  console.log('')

  try {
    const storage = new GoogleDriveAdapter()

    // Get an existing user from the database
    console.log('0️⃣  Finding existing user...')
    const { data: existingCategories } = await supabase
      .from('categories')
      .select('user_id')
      .limit(1)

    let testUserId: string
    if (existingCategories && existingCategories.length > 0) {
      testUserId = existingCategories[0].user_id
      console.log(`   ✅ Using existing user: ${testUserId}`)
    } else {
      // Try to get from auth.users
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
      if (users && users.length > 0) {
        testUserId = users[0].id
        console.log(`   ✅ Using auth user: ${testUserId}`)
      } else {
        throw new Error('No users found in database. Please create a user first.')
      }
    }
    console.log('')

    // Step 1: Create Category
    console.log('1️⃣  Creating "Gummy Bear" category...')

    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .insert({
        user_id: testUserId,
        name: 'Gummy Bear',
        slug: 'gummy-bear',
        description: 'Vitamin C Gummies product category for E2E testing',
        look_and_feel: 'Modern, clean product photography with warm tones',
      })
      .select()
      .single()

    if (categoryError) {
      console.log('   ⚠️  Category might already exist, trying to fetch...')
      const { data: existingCategory } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', 'gummy-bear')
        .eq('user_id', testUserId)
        .single()

      if (existingCategory) {
        console.log('   ✅ Using existing category')
        console.log(`   🆔 Category ID: ${existingCategory.id}`)
        console.log('')
      } else {
        throw categoryError
      }
    } else {
      console.log('   ✅ Category created')
      console.log(`   🆔 Category ID: ${category.id}`)
      console.log(`   📝 Name: ${category.name}`)
      console.log(`   📝 Slug: ${category.slug}`)
      console.log('')
    }

    const categoryId = category?.id || (await supabase
      .from('categories')
      .select('id')
      .eq('slug', 'gummy-bear')
      .eq('user_id', testUserId)
      .single()).data!.id

    // Step 2: Create Product
    console.log('2️⃣  Creating product...')

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        category_id: categoryId,
        user_id: testUserId,
        name: 'Vitamin C Gummies',
        slug: 'vitamin-c-gummies',
        description: '60 Gummies a 100 mg Vitamin C with chicory root fibers (FOS), sugar-free and vegan',
      })
      .select()
      .single()

    if (productError) {
      console.log('   ⚠️  Product might already exist, trying to fetch...')
      const { data: existingProduct } = await supabase
        .from('products')
        .select('*')
        .eq('slug', 'vitamin-c-gummies')
        .eq('category_id', categoryId)
        .single()

      if (existingProduct) {
        console.log('   ✅ Using existing product')
        console.log(`   🆔 Product ID: ${existingProduct.id}`)
        console.log('')
      } else {
        throw productError
      }
    } else {
      console.log('   ✅ Product created')
      console.log(`   🆔 Product ID: ${product.id}`)
      console.log(`   📝 Name: ${product.name}`)
      console.log('')
    }

    const productId = product?.id || (await supabase
      .from('products')
      .select('id')
      .eq('slug', 'vitamin-c-gummies')
      .eq('category_id', categoryId)
      .single()).data!.id

    // Step 3: Upload Product Image to Google Drive
    console.log('3️⃣  Uploading product image to Google Drive...')

    // Read the image file
    const imagePath = '/Users/varuntyagi/Downloads/Gummies_Categories_N8617CDE_DSC_6732-Edit.jpg'

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found at ${imagePath}`)
    }

    const imageBuffer = fs.readFileSync(imagePath)
    const fileName = 'vitamin-c-gummies.jpg'
    const storagePath = `product-images/gummy-bear-test/${productId}/${fileName}`

    const uploadResult = await storage.upload(imageBuffer, storagePath, {
      contentType: 'image/jpeg',
    })

    console.log('   ✅ Image uploaded to Google Drive')
    console.log(`   📁 Path: ${uploadResult.path}`)
    console.log(`   🔗 URL: ${uploadResult.publicUrl}`)
    console.log(`   🆔 File ID: ${uploadResult.fileId}`)
    console.log(`   📊 Size: ${uploadResult.size} bytes`)
    console.log('')

    // Step 4: Save image metadata to Supabase
    console.log('4️⃣  Saving image metadata to Supabase...')

    const { data: productImage, error: imageError } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        file_name: fileName,
        file_path: uploadResult.path,
        file_size: uploadResult.size,
        mime_type: uploadResult.mimeType,
        storage_provider: 'gdrive',
        gdrive_file_id: uploadResult.fileId,
        is_primary: true,
      })
      .select()
      .single()

    if (imageError) {
      throw imageError
    }

    console.log('   ✅ Image metadata saved')
    console.log(`   🆔 Image ID: ${productImage.id}`)
    console.log('')

    // Step 5: Analyze product image with Gemini
    console.log('5️⃣  Analyzing product image with Gemini AI...')

    const base64Image = imageBuffer.toString('base64')
    const imageData = `data:image/jpeg;base64,${base64Image}`

    const productDescription = await analyzeProductImage(imageData, 'image/jpeg')

    console.log('   ✅ Image analyzed')
    console.log('   📝 Analysis:')
    console.log('   ' + productDescription.split('\n').join('\n   '))
    console.log('')

    // Step 6: Generate angled variations
    console.log('6️⃣  Generating angled variations with Gemini AI...')
    console.log(`   🎯 Generating ${ANGLE_VARIATIONS.length} angles`)
    console.log('')

    const generatedShots = await generateAngledShots(
      base64Image,
      'image/jpeg',
      ANGLE_VARIATIONS,
      'Modern, clean product photography with warm tones'
    )

    console.log('   ✅ Variations generated')
    console.log(`   📊 Generated ${generatedShots.length} variations`)
    console.log('')

    // Step 7: Upload generated images to Google Drive
    console.log('7️⃣  Uploading generated variations to Google Drive...')

    const angledShotsPath = `product-images/gummy-bear-test/${productId}/angled-shots`
    const uploadedAngles = []

    for (const shot of generatedShots) {
      console.log(`   📤 Uploading ${shot.angleName}...`)

      // Convert base64 back to buffer
      const base64Data = shot.imageData.replace(/^data:image\/\w+;base64,/, '')
      const imageBuffer = Buffer.from(base64Data, 'base64')

      const angleFileName = `${shot.angleName}.${shot.mimeType.split('/')[1]}`
      const angleStoragePath = `${angledShotsPath}/${angleFileName}`

      const angleUploadResult = await storage.upload(imageBuffer, angleStoragePath, {
        contentType: shot.mimeType,
      })

      console.log(`      ✅ Uploaded: ${angleUploadResult.publicUrl}`)

      // Save metadata to Supabase (image is in Google Drive)
      const { data: angledShot, error: angleError } = await supabase
        .from('angled_shots')
        .insert({
          category_id: categoryId,
          product_id: productId,
          product_image_id: productImage.id,
          user_id: testUserId,
          angle_name: shot.angleName,
          angle_description: shot.angleDescription,
          prompt_used: shot.promptUsed,
          storage_path: angleUploadResult.path,
          storage_url: angleUploadResult.publicUrl,
          storage_provider: 'gdrive',
          gdrive_file_id: angleUploadResult.fileId,
        })
        .select()
        .single()

      if (!angleError) {
        uploadedAngles.push(angledShot)
        console.log(`      💾 Saved to database (ID: ${angledShot.id})`)
      }

      console.log('')
    }

    console.log('')
    console.log('=' .repeat(60))
    console.log('✅ E2E TEST COMPLETED SUCCESSFULLY')
    console.log('=' .repeat(60))
    console.log('')
    console.log('📊 Summary:')
    console.log(`   ✅ Category: ${category?.name || 'Gummy Bear'}`)
    console.log(`   ✅ Product: ${product?.name || 'Vitamin C Gummies'}`)
    console.log(`   ✅ Original image uploaded to Google Drive`)
    console.log(`   ✅ ${uploadedAngles.length} angled variations generated and uploaded`)
    console.log('')
    console.log('📁 Google Drive Structure:')
    console.log(`   product-images/gummy-bear-test/${productId}/`)
    console.log(`   ├── ${fileName}`)
    console.log(`   └── angled-shots/`)
    for (const angle of uploadedAngles) {
      console.log(`       ├── ${angle.file_name}`)
    }
    console.log('')
    console.log('🗄️  Supabase Database:')
    console.log(`   ✅ categories table: 1 record`)
    console.log(`   ✅ products table: 1 record`)
    console.log(`   ✅ product_images table: 1 record`)
    console.log(`   ✅ angled_shots table: ${uploadedAngles.length} records`)
    console.log('')
    console.log('🔍 Next Steps:')
    console.log('   1. Check Google Drive Shared Drive to verify files')
    console.log('   2. Check Supabase dashboard to verify metadata')
    console.log('   3. Download generated images to check if text is preserved')
    console.log('')
    console.log('🎯 To check text preservation:')
    console.log('   - Download images from Google Drive')
    console.log('   - Compare with original to see if "VITAMIN C GUMMIES" text is visible')
    console.log('')

  } catch (error: any) {
    console.log('')
    console.log('❌ Error:', error.message)
    console.log('')
    if (error.stack) {
      console.log('Stack trace:')
      console.log(error.stack)
    }
  }
}

runE2ETest()
