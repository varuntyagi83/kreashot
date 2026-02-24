#!/usr/bin/env node
import { GoogleDriveAdapter } from '../src/lib/storage/adapters/google-drive.js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const gdrive = new GoogleDriveAdapter()

async function listFolders() {
  try {
    console.log('🔍 Checking Google Drive folder structure...\n')
    
    // List files in the gummy-bear folder
    const { data } = await gdrive.drive.files.list({
      q: "name contains 'gummy-bear' or name contains 'angled'",
      fields: 'files(id, name, mimeType, parents)',
      pageSize: 100
    })

    console.log(`Found ${data.files.length} items:\n`)
    
    // Group by type
    const folders = data.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder')
    const files = data.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')

    console.log('📁 Folders:')
    folders.forEach(folder => {
      console.log(`  - ${folder.name} (${folder.id})`)
    })

    console.log(`\n🖼️  Files: ${files.length}`)
    
    // Check for format folders
    const formatFolders = folders.filter(f => 
      f.name === '1x1' || f.name === '16x9' || f.name === '9x16' || f.name === '4x5'
    )
    
    console.log(`\n📊 Format folders found: ${formatFolders.length}`)
    formatFolders.forEach(f => console.log(`  - ${f.name}`))

  } catch (error) {
    console.error('Error:', error.message)
  }
}

listFolders()
