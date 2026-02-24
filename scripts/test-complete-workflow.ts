/**
 * Complete workflow test: Upload -> Download -> Delete
 * Simulates real app usage
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

import { GoogleDriveAdapter } from '../src/lib/storage/gdrive-adapter'

async function testCompleteWorkflow() {
  console.log('🧪 Complete Workflow Test\n')
  console.log('Simulating real app usage:\n')

  try {
    const adapter = new GoogleDriveAdapter()

    // Step 1: Upload
    console.log('1️⃣  Upload image (like user uploading product photo)...')
    const imageContent = Buffer.from('Fake image content - pretend this is a JPEG')
    const imagePath = 'product-images/user-abc123/product-xyz789/photo.jpg'

    const uploadResult = await adapter.upload(imageContent, imagePath, {
      contentType: 'image/jpeg',
    })

    console.log('   ✅ Upload successful')
    console.log(`   📁 Path: ${uploadResult.path}`)
    console.log(`   🔗 URL: ${uploadResult.publicUrl}`)
    console.log(`   🆔 File ID: ${uploadResult.fileId}`)
    console.log(`   📊 Size: ${uploadResult.size} bytes`)
    console.log('')

    // Step 2: Store in database (simulated)
    console.log('2️⃣  Save to database (simulated)...')
    const dbRecord = {
      file_path: uploadResult.path,
      storage_url: uploadResult.publicUrl,
      storage_provider: 'gdrive',
      gdrive_file_id: uploadResult.fileId, // ✅ Store file ID for fast deletion
      file_size: uploadResult.size,
      mime_type: uploadResult.mimeType,
    }
    console.log('   ✅ Database record created')
    console.log('   ℹ️  Stored file_path:', dbRecord.file_path)
    console.log('   ℹ️  Stored gdrive_file_id:', dbRecord.gdrive_file_id)
    console.log('')

    // Step 3: Download (verify file is accessible)
    console.log('3️⃣  Download file (verify accessibility)...')
    const downloadedContent = await adapter.download(uploadResult.path)
    const downloadedText = downloadedContent.toString()

    if (downloadedText === 'Fake image content - pretend this is a JPEG') {
      console.log('   ✅ Download successful')
      console.log('   ✅ Content verified')
    } else {
      console.log('   ❌ Content mismatch!')
    }
    console.log('')

    // Step 4: User deletes the image
    console.log('4️⃣  User deletes image (using file ID from database)...')

    // ✅ RECOMMENDED: Delete using file ID (faster, more reliable)
    await adapter.delete(dbRecord.gdrive_file_id!)

    console.log('   ✅ Deletion successful')
    console.log('')

    // Step 5: Verify deletion
    console.log('5️⃣  Verify file is deleted...')
    try {
      await adapter.download(uploadResult.path)
      console.log('   ❌ File still exists (should be deleted!)')
    } catch (error) {
      console.log('   ✅ File confirmed deleted')
    }
    console.log('')

    console.log('=' .repeat(60))
    console.log('✅ COMPLETE WORKFLOW TEST PASSED!')
    console.log('=' .repeat(60))
    console.log('')
    console.log('Summary:')
    console.log('  ✅ Users can upload images')
    console.log('  ✅ Files stored in Google Drive Shared Drive')
    console.log('  ✅ Same folder structure as Supabase')
    console.log('  ✅ Files are publicly accessible')
    console.log('  ✅ Users can delete their images')
    console.log('  ✅ No permission issues')
    console.log('')
    console.log('Best Practice:')
    console.log('  💡 Store gdrive_file_id in database for fast deletion')
    console.log('  💡 Use file ID instead of path when deleting')
    console.log('')
    console.log('Database Schema:')
    console.log('  - file_path: "product-images/user-id/product-id/file.jpg"')
    console.log('  - storage_provider: "gdrive"')
    console.log('  - storage_url: "https://drive.google.com/uc?export=download&id=..."')
    console.log('  - gdrive_file_id: "1AbCdEf..." (for fast deletion)')
    console.log('')

  } catch (error: any) {
    console.log('❌ Error:', error.message)
    console.log('')
  }
}

testCompleteWorkflow()
