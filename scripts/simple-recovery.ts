#!/usr/bin/env tsx
/**
 * Simple recovery: Download the known file and insert into database
 */

import { createClient } from '@supabase/supabase-js'
import { GoogleDriveAdapter } from '../src/lib/storage/gdrive-adapter'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
const FILE_PATH = 'gummy-bear/copy-docs/headline/useful_1771690961353.json'

async function recoverFile() {
  console.log('🔍 Attempting to recover orphaned copy from Google Drive...\n')
  console.log(`File: ${FILE_PATH}\n`)

  try {
    const gdrive = new GoogleDriveAdapter()

    // Download the file
    console.log('Downloading file from Google Drive...')
    const buffer = await gdrive.download(FILE_PATH)
    const content = buffer.toString('utf-8')
    const copyData = JSON.parse(content)

    console.log(`✅ Downloaded file`)
    console.log(`   Generated Text: "${copyData.generated_text.substring(0, 60)}..."\n`)

    // Get the file ID and public URL
    const publicUrl = gdrive.getPublicUrl(FILE_PATH)
    console.log(`   Public URL: ${publicUrl.substring(0, 60)}...\n`)

    // Use the actual user ID from the database
    const userId = '189a8d40-744d-452c-b716-66bdf3cf8976'

    // Insert into database
    console.log('Inserting into database...')
    const { data: inserted, error } = await supabase
      .from('copy_docs')
      .insert({
        category_id: CATEGORY_ID,
        user_id: userId,
        original_text: copyData.original_text || '',
        generated_text: copyData.generated_text,
        copy_type: copyData.copy_type || 'headline',
        language: copyData.language || 'en',
        prompt_used: copyData.prompt_used,
        storage_provider: 'gdrive',
        storage_path: FILE_PATH,
        storage_url: publicUrl,
        gdrive_file_id: null, // We don't have this from the path alone
        metadata: {},
      })
      .select()
      .single()

    if (error) {
      console.log(`❌ Failed to insert: ${error.message}`)
      console.log(`   Details: ${JSON.stringify(error, null, 2)}`)
    } else {
      console.log(`\n✅ Successfully recovered copy doc!`)
      console.log(`   ID: ${inserted.id}`)
      console.log(`   Type: ${inserted.copy_type}`)
      console.log(`\n🎉 Refresh your browser to see the copy in the gallery!`)
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`)
    if (error.stack) {
      console.error(error.stack)
    }
  }
}

recoverFile()
