import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f' // Gummy Bear
const PRODUCT_ID = '00d3f3b1-9da5-44ac-b5b1-fcbd50039273' // Vitamin C Gummies
const FILE_ID = '1OPqPH6_IdpyQgNuDSDUGQa-zSLGIKsdb' // front_16:9
const FILE_NAME = 'front_16:9_1771718577469.jpg'

async function importWithProductImage() {
  console.log('📥 Importing front_16:9 with product_image record\n')

  // Get user_id
  const { data: category } = await supabase
    .from('categories')
    .select('user_id')
    .eq('id', CATEGORY_ID)
    .single()

  if (!category) {
    console.log('❌ Category not found')
    return
  }

  const userId = category.user_id

  // Step 1: Create product_image record
  console.log('Creating product_image record...')
  const { data: productImage, error: imgError } = await supabase
    .from('product_images')
    .insert({
      product_id: PRODUCT_ID,
      file_name: FILE_NAME,
      file_path: `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/16x9/${FILE_NAME}`,
      file_size: 1024 * 100, // Dummy size
      mime_type: 'image/jpeg',
      is_primary: false,
    })
    .select()
    .single()

  if (imgError) {
    console.error('❌ Failed to create product_image:', imgError.message)
    return
  }

  console.log(`✅ Product image created: ${productImage.id}\n`)

  // Step 2: Create angled_shot record
  console.log('Creating angled_shot record...')
  const storageUrl = `https://drive.google.com/thumbnail?id=${FILE_ID}&sz=w2000`
  const storagePath = `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/16x9/${FILE_NAME}`

  const { data: angledShot, error: shotError } = await supabase
    .from('angled_shots')
    .insert({
      category_id: CATEGORY_ID,
      product_id: PRODUCT_ID,
      product_image_id: productImage.id,
      user_id: userId,
      angle_name: 'front',
      angle_description: 'Straight-on front view of the product bottle',
      display_name: 'Front',
      format: '16:9',
      width: 1920,
      height: 1080,
      storage_provider: 'gdrive',
      storage_path: storagePath,
      storage_url: storageUrl,
      gdrive_file_id: FILE_ID,
      prompt_used: 'Direct import from Google Drive',
      metadata: {
        imported_from: 'google_drive',
        original_filename: FILE_NAME,
      },
    })
    .select()
    .single()

  if (shotError) {
    console.error('❌ Failed to create angled_shot:', shotError.message)
    return
  }

  console.log('✅ Angled shot imported successfully!\n')
  console.log('📊 Record Details:')
  console.log(`   ID: ${angledShot.id}`)
  console.log(`   Display Name: ${angledShot.display_name}`)
  console.log(`   Angle: ${angledShot.angle_name}`)
  console.log(`   Format: ${angledShot.format} (${angledShot.width}x${angledShot.height})`)
  console.log(`   Storage URL: ${angledShot.storage_url}`)
  console.log(`   GDrive File ID: ${angledShot.gdrive_file_id}`)
  console.log(`   Product Image ID: ${angledShot.product_image_id}`)
}

importWithProductImage().then(() => process.exit(0))
