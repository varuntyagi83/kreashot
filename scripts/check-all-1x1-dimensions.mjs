import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import dotenv from 'dotenv'
import sharp from 'sharp'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

const categoryId = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'

console.log('🔍 Checking all 1:1 image dimensions...\n')

// Get all 1:1 images
const { data: shots, error } = await supabase
  .from('angled_shots')
  .select('id, angle_name, format, gdrive_file_id')
  .eq('category_id', categoryId)
  .eq('format', '1:1')

if (error) {
  console.error('Error:', error)
  process.exit(1)
}

console.log(`Found ${shots.length} images in 1:1 format\n`)

let correctCount = 0
let wrongCount = 0

for (const shot of shots) {
  try {
    const response = await drive.files.get(
      {
        fileId: shot.gdrive_file_id,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(response.data)
    const metadata = await sharp(buffer).metadata()
    const ratio = (metadata.width / metadata.height).toFixed(2)

    const isSquare = Math.abs(parseFloat(ratio) - 1.0) < 0.05

    if (isSquare) {
      console.log(`✅ ${shot.angle_name}: ${metadata.width}x${metadata.height} (ratio: ${ratio})`)
      correctCount++
    } else {
      console.log(`❌ ${shot.angle_name}: ${metadata.width}x${metadata.height} (ratio: ${ratio})`)
      wrongCount++
    }

  } catch (err) {
    console.error(`   Error: ${err.message}`)
  }
}

console.log(`\n📊 Summary:`)
console.log(`   Correct (square): ${correctCount}`)
console.log(`   Wrong (not square): ${wrongCount}`)
