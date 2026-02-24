import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import dotenv from 'dotenv'
import sharp from 'sharp'
import fetch from 'node-fetch'

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

console.log('🔍 Checking image dimensions...\n')

// Get one image from each format
for (const format of ['1:1', '16:9', '9:16', '4:5']) {
  const { data, error } = await supabase
    .from('angled_shots')
    .select('id, angle_name, format, gdrive_file_id')
    .eq('category_id', categoryId)
    .eq('format', format)
    .limit(1)
    .single()

  if (error) {
    console.log(`${format}: No images found`)
    continue
  }

  try {
    // Download image from Google Drive
    const response = await drive.files.get(
      {
        fileId: data.gdrive_file_id,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(response.data)

    // Get image metadata using sharp
    const metadata = await sharp(buffer).metadata()

    const actualRatio = (metadata.width / metadata.height).toFixed(2)

    // Expected ratios
    const expectedRatios = {
      '1:1': 1.0,
      '16:9': 1.78,
      '9:16': 0.56,
      '4:5': 0.8
    }

    const expected = expectedRatios[format].toFixed(2)
    const match = Math.abs(parseFloat(actualRatio) - parseFloat(expected)) < 0.05 ? '✅' : '❌'

    console.log(`${format} (${data.angle_name}):`)
    console.log(`  Dimensions: ${metadata.width}x${metadata.height}`)
    console.log(`  Actual ratio: ${actualRatio}`)
    console.log(`  Expected ratio: ${expected}`)
    console.log(`  Match: ${match}\n`)

  } catch (err) {
    console.error(`${format}: Error checking image - ${err.message}\n`)
  }
}
