/**
 * Test deletion with delay to account for Google Drive propagation
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { GoogleDriveAdapter } from '../src/lib/storage/gdrive-adapter'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testDeleteWithDelay() {
  console.log('🧪 Testing Deletion with Propagation Delay\n')

  try {
    const adapter = new GoogleDriveAdapter()

    // Step 1: Upload
    console.log('1️⃣  Upload test file...')
    const testContent = Buffer.from('Test file for deletion verification')
    const testPath = 'test-final/user-999/file.txt'

    const uploadResult = await adapter.upload(testContent, testPath, {
      contentType: 'text/plain',
    })

    console.log('   ✅ Uploaded')
    console.log(`   🆔 File ID: ${uploadResult.fileId}`)
    console.log('')

    // Step 2: Verify file exists
    console.log('2️⃣  Verify file exists before deletion...')
    try {
      await adapter.download(testPath)
      console.log('   ✅ File exists and is downloadable')
    } catch {
      console.log('   ❌ File not found (unexpected!)')
    }
    console.log('')

    // Step 3: Delete
    console.log('3️⃣  Delete file using file ID...')
    await adapter.delete(uploadResult.fileId!)
    console.log('   ✅ Delete API call succeeded')
    console.log('')

    // Step 4: Wait for propagation
    console.log('4️⃣  Waiting 3 seconds for Google Drive to propagate...')
    await sleep(3000)
    console.log('   ✅ Wait complete')
    console.log('')

    // Step 5: Verify deletion
    console.log('5️⃣  Verify file is actually deleted...')
    try {
      const content = await adapter.download(testPath)
      console.log('   ❌ File still exists and downloadable!')
      console.log('   ⚠️  This means deletion did NOT work')
      console.log('')
      console.log('Possible issues:')
      console.log('  1. Manager permissions not yet propagated')
      console.log('  2. API is moving to trash instead of deleting')
      console.log('  3. Need to use permanent delete flag')
    } catch (error: any) {
      console.log('   ✅ File confirmed deleted!')
      console.log('   ✅ Download failed as expected')
      console.log('')
      console.log('🎉 DELETION WORKS PERFECTLY!')
    }
    console.log('')

  } catch (error: any) {
    console.log('❌ Error:', error.message)
  }
}

testDeleteWithDelay()
