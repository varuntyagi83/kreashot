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

async function importAngledShot() {
  console.log('📥 Importing front_16:9 angled shot to database\n')

  // First, get the user_id from the category
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

  // Create storage URL using thumbnail API
  const storageUrl = `https://drive.google.com/thumbnail?id=${FILE_ID}&sz=w2000`
  const storagePath = `gummy-bear/vitamin-c-gummies/product-images/vitamin-c-gummies-angled-shots/16x9/${FILE_NAME}`

  // Insert angled shot record
  const { data: angledShot, error} = await supabase
    .from('angled_shots')
    .insert({
      category_id: CATEGORY_ID,
      product_id: PRODUCT_ID,
      product_image_id: null, // No product image record
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

  if (error) {
    console.error('❌ Import failed:', error.message)
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
}

importAngledShot().then(() => process.exit(0))
