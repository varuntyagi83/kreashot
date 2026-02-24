#!/usr/bin/env tsx
/**
 * Recover orphaned copy doc from Google Drive
 * File was uploaded but database insert failed
 */

import { createClient } from '@supabase/supabase-js'
import { getFile, listFiles } from '../src/lib/storage'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORY_ID = 'a7510dad-d33d-4e77-8ed2-6b41fb92990f'
const USER_ID = 'your-user-id' // You'll need to provide this

async function recoverOrphanedCopies() {
  console.log('🔍 Searching for orphaned copy docs in Google Drive...\n')

  try {
    // List all files in the copy-docs folder
    const pattern = 'gummy-bear/copy-docs/**/*.json'
    console.log(`Looking for files matching: ${pattern}`)

    const files = await listFiles(pattern, { provider: 'gdrive' })

    console.log(`\n✅ Found ${files.length} files in Google Drive\n`)

    if (files.length === 0) {
      console.log('No files found. The file might have been cleaned up.')
      console.log('Please generate new copy in the UI instead.')
      return
    }

    // For each file, check if it exists in database
    for (const file of files) {
      console.log(`Checking: ${file.path}`)

      // Check if this file is in the database
      const { data: existing } = await supabase
        .from('copy_docs')
        .select('id')
        .eq('storage_path', file.path)
        .single()

      if (existing) {
        console.log(`  ✅ Already in database`)
      } else {
        console.log(`  ❌ ORPHANED - file in Drive but not in database`)

        // Download and parse the file
        const fileContent = await getFile(file.path, { provider: 'gdrive' })
        const copyData = JSON.parse(fileContent.toString('utf-8'))

        console.log(`  📝 Content: "${copyData.generated_text.substring(0, 50)}..."`)

        // Extract copy type from path
        const pathParts = file.path.split('/')
        const copyType = pathParts[2] // gummy-bear/copy-docs/[TYPE]/file.json

        // Get user ID from auth
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id || USER_ID

        // Insert into database
        const { data: inserted, error } = await supabase
          .from('copy_docs')
          .insert({
            category_id: CATEGORY_ID,
            user_id: userId,
            original_text: copyData.original_text || '',
            generated_text: copyData.generated_text,
            copy_type: copyData.copy_type || copyType,
            language: copyData.language || 'en',
            prompt_used: copyData.prompt_used,
            storage_provider: 'gdrive',
            storage_path: file.path,
            storage_url: file.publicUrl,
            gdrive_file_id: file.fileId,
            metadata: {},
          })
          .select()
          .single()

        if (error) {
          console.log(`  ❌ Failed to insert: ${error.message}`)
        } else {
          console.log(`  ✅ Recovered and inserted into database!`)
        }
      }
    }

    console.log('\n✅ Recovery complete!')
    console.log('Refresh your browser to see the recovered copies.')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error('\nNote: This script requires Google Drive credentials.')
    console.error('Easier option: Just generate new copy in the UI!')
  }
}

recoverOrphanedCopies()
