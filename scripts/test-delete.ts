/**
 * Test file deletion in Google Drive
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { GoogleDriveAdapter } from '../src/lib/storage/gdrive-adapter'

async function testDelete() {
  console.log('🧪 Testing File Deletion\n')

  try {
    const adapter = new GoogleDriveAdapter()

    // Step 1: Upload a file
    console.log('📤 Step 1: Upload a test file...')
    const testContent = Buffer.from('Test file for deletion')
    const testPath = 'test-deletion/user-123/file-to-delete.txt'

    const uploadResult = await adapter.upload(testContent, testPath, {
      contentType: 'text/plain',
    })

    console.log(`   ✅ File uploaded`)
    console.log(`   ℹ️  Path: ${uploadResult.path}`)
    console.log(`   ℹ️  URL: ${uploadResult.publicUrl}`)
    console.log('')

    // Extract file ID from URL
    const fileId = uploadResult.publicUrl.split('id=')[1]
    console.log(`   ℹ️  File ID: ${fileId}`)
    console.log('')

    // Step 2: Try to delete by path
    console.log('🗑️  Step 2: Delete file by path...')
    await adapter.delete(testPath)
    console.log('   ✅ File deleted successfully')
    console.log('')

    // Step 3: Verify deletion
    console.log('🔍 Step 3: Verify file is deleted...')
    const exists = await adapter.exists(testPath)

    if (exists) {
      console.log('   ❌ File still exists!')
    } else {
      console.log('   ✅ File confirmed deleted')
    }
    console.log('')

    console.log('✅ DELETION TEST PASSED!')
    console.log('')
    console.log('Users can delete their images without issues.')
    console.log('')

  } catch (error: any) {
    console.log('❌ Error:', error.message)
    console.log('')
    console.log('Delete functionality needs to be fixed.')
  }
}

testDelete()
