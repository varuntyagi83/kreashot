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

const TEMPLATE_ID = '16bccb2f-ce8d-4191-a109-12373a8e10ec'
const GDRIVE_FILE_ID = '11nfX7bDwMP0bsRzXnvxXtiIiSOnYi_HV'

async function addSafeZones() {
  console.log('📝 Adding safe zones to 16:9 template\n')

  // Create template data with safe zones for 16:9 (1920x1080)
  const templateData = {
    canvas: {
      width: 1920,
      height: 1080,
      format: '16:9',
    },
    safe_zones: [
      {
        name: 'Product Safe Zone',
        description: 'Primary area for product placement',
        x: 100,
        y: 150,
        width: 600,
        height: 700,
        color: '#FF6B6B',
      },
      {
        name: 'Text Safe Zone',
        description: 'Area for headlines and copy',
        x: 900,
        y: 200,
        width: 900,
        height: 300,
        color: '#4ECDC4',
      },
      {
        name: 'Top Margin',
        description: 'Keep clear - top safe margin',
        x: 0,
        y: 0,
        width: 1920,
        height: 80,
        color: '#FFE66D',
      },
      {
        name: 'Bottom Legal Area',
        description: 'Reserved for disclaimers and legal text',
        x: 0,
        y: 980,
        width: 1920,
        height: 100,
        color: '#95E1D3',
      },
      {
        name: 'General Safe Zone',
        description: 'Overall safe composition area',
        x: 50,
        y: 50,
        width: 1820,
        height: 980,
        color: '#F38181',
      },
    ],
    metadata: {
      version: '1.0',
      created_by: 'system',
      description: '16:9 template with product and text safe zones',
    },
  }

  // Upload to Google Drive
  console.log('Uploading updated template to Google Drive...')
  const buffer = Buffer.from(JSON.stringify(templateData, null, 2), 'utf-8')

  await drive.files.update(
    {
      fileId: GDRIVE_FILE_ID,
      media: {
        mimeType: 'application/json',
        body: buffer,
      },
      supportsAllDrives: true,
    }
  )

  console.log('✅ Template file updated in Google Drive\n')

  // Update database
  console.log('Updating database record...')
  const { error } = await supabase
    .from('templates')
    .update({
      template_data: templateData,
    })
    .eq('id', TEMPLATE_ID)

  if (error) {
    console.error('❌ Database update failed:', error.message)
    return
  }

  console.log('✅ Database record updated\n')

  // Show summary
  console.log('📊 Template Summary:')
  console.log(`   Canvas: ${templateData.canvas.width}x${templateData.canvas.height}`)
  console.log(`   Safe Zones: ${templateData.safe_zones.length}`)
  templateData.safe_zones.forEach((zone, i) => {
    console.log(`   ${i+1}. ${zone.name}:`)
    console.log(`      Position: (${zone.x}, ${zone.y})`)
    console.log(`      Size: ${zone.width}x${zone.height}`)
  })
}

addSafeZones().then(() => process.exit(0))
