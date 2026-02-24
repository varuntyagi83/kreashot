import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
})

const drive = google.drive({ version: 'v3', auth })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
const TEMPLATE_ID = '16bccb2f-ce8d-4191-a109-12373a8e10ec'

async function checkTemplate() {
  console.log('🔍 Checking 16:9 Template\n')

  // Get template from database
  const { data: template } = await supabase
    .from('templates')
    .select('*')
    .eq('id', TEMPLATE_ID)
    .single()

  if (!template) {
    console.log('❌ Template not found in database')
    return
  }

  console.log(`Template: ${template.name}`)
  console.log(`Format: ${template.format}`)
  console.log(`GDrive File ID: ${template.gdrive_file_id}`)
  console.log('')

  // Get safe zones from database
  const safeZones = template.template_data?.safe_zones || []
  console.log(`Safe Zones in Database: ${safeZones.length}`)
  if (safeZones.length > 0) {
    safeZones.forEach((zone: any, i: number) => {
      console.log(`  ${i+1}. ${zone.name}: (${zone.x}, ${zone.y}) ${zone.width}x${zone.height}`)
    })
  }
  console.log('')

  // Download template file from Google Drive
  if (template.gdrive_file_id) {
    try {
      console.log('Downloading template from Google Drive...')
      const { data } = await drive.files.get(
        {
          fileId: template.gdrive_file_id,
          alt: 'media',
          supportsAllDrives: true,
        },
        { responseType: 'stream' }
      )

      // Collect data from stream
      const chunks: any[] = []
      for await (const chunk of data as any) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)
      const content = JSON.parse(buffer.toString('utf-8'))

      console.log('\nTemplate File Content:')
      console.log(`  Canvas: ${content.canvas?.width}x${content.canvas?.height}`)

      const fileSafeZones = content.safe_zones || []
      console.log(`  Safe Zones in File: ${fileSafeZones.length}`)
      if (fileSafeZones.length > 0) {
        fileSafeZones.forEach((zone: any, i: number) => {
          console.log(`    ${i+1}. ${zone.name}: (${zone.x}, ${zone.y}) ${zone.width}x${zone.height}`)
        })
      }
    } catch (error: any) {
      console.error('Error downloading template:', error.message)
    }
  }
}

checkTemplate().then(() => process.exit(0))
