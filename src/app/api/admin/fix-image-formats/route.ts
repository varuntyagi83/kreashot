import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { downloadFile, uploadFile, deleteFile } from '@/lib/storage'
import { detectFormatFromDimensions, formatToFolderName } from '@/lib/formats'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/fix-image-formats
 * Finds product images whose storage_path format folder doesn't match
 * the actual image dimensions, then re-uploads to the correct folder
 * and updates the database record.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Optional: limit to specific product image IDs via request body
    let filterIds: string[] | null = null
    try {
      const body = await request.json()
      if (body.ids && Array.isArray(body.ids)) {
        filterIds = body.ids
      }
    } catch {
      // No body or invalid JSON — scan all images
    }

    // Query product images stored in Google Drive
    let query = supabase
      .from('product_images')
      .select('id, file_name, file_path, storage_path, storage_url, gdrive_file_id, storage_provider, mime_type, product_id')
      .eq('storage_provider', 'gdrive')
      .not('gdrive_file_id', 'is', null)

    if (filterIds) {
      query = query.in('id', filterIds)
    }

    const { data: images, error } = await query.order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ message: 'No product images found to check', fixed: 0 })
    }

    const formatFolderRegex = /\/(1x1|16x9|9x16|4x5)\//
    let checked = 0
    let fixed = 0
    let skipped = 0
    const details: Array<{ id: string; file_name: string; oldFormat: string; newFormat: string; newPath: string }> = []

    for (const img of images) {
      checked++
      const path = img.storage_path || img.file_path

      // Extract current format folder from path
      const match = path.match(formatFolderRegex)
      if (!match) {
        skipped++
        continue
      }

      const currentFolderFormat = match[1] // e.g., "16x9"

      // Download the image to detect actual dimensions
      let buffer: Buffer
      try {
        buffer = await downloadFile(img.gdrive_file_id, { provider: 'gdrive' })
      } catch (dlError) {
        console.warn(`⚠️ Could not download ${img.id} (${img.gdrive_file_id}):`, dlError)
        skipped++
        continue
      }

      // Detect actual dimensions
      let detectedFormat: string
      try {
        const metadata = await sharp(buffer).metadata()
        if (!metadata.width || !metadata.height) {
          skipped++
          continue
        }
        detectedFormat = detectFormatFromDimensions(metadata.width, metadata.height)
        console.log(`🔍 Image ${img.id}: ${metadata.width}x${metadata.height} → ${detectedFormat} (currently in ${currentFolderFormat})`)
      } catch (sharpError) {
        console.warn(`⚠️ Could not read dimensions for ${img.id}:`, sharpError)
        skipped++
        continue
      }

      const detectedFolder = formatToFolderName(detectedFormat) // e.g., "1x1"

      // Compare: is the image in the wrong folder?
      if (currentFolderFormat === detectedFolder) {
        // Already correct
        continue
      }

      console.log(`🔧 Fixing ${img.id}: ${currentFolderFormat} → ${detectedFolder}`)

      // Build new path by replacing the format folder
      const newPath = path.replace(`/${currentFolderFormat}/`, `/${detectedFolder}/`)

      // Re-upload to the correct path
      try {
        const newStorageFile = await uploadFile(buffer, newPath, {
          contentType: img.mime_type || 'image/jpeg',
          provider: 'gdrive',
        })

        // Update the database record
        const { error: updateError } = await supabase
          .from('product_images')
          .update({
            file_path: newPath,
            storage_path: newPath,
            storage_url: newStorageFile.publicUrl,
            gdrive_file_id: newStorageFile.fileId,
          })
          .eq('id', img.id)

        if (updateError) {
          console.error(`❌ DB update failed for ${img.id}:`, updateError)
          skipped++
          continue
        }

        // Delete the old file from Google Drive
        try {
          await deleteFile(img.gdrive_file_id, { provider: 'gdrive' })
          console.log(`🗑️ Deleted old file ${img.gdrive_file_id}`)
        } catch (delError) {
          console.warn(`⚠️ Could not delete old file ${img.gdrive_file_id}:`, delError)
          // Non-fatal — the new file is already in place
        }

        fixed++
        details.push({
          id: img.id,
          file_name: img.file_name,
          oldFormat: currentFolderFormat,
          newFormat: detectedFolder,
          newPath,
        })
      } catch (uploadError) {
        console.error(`❌ Re-upload failed for ${img.id}:`, uploadError)
        skipped++
      }
    }

    return NextResponse.json({
      message: `Checked ${checked} images. Fixed ${fixed}, skipped ${skipped}.`,
      checked,
      fixed,
      skipped,
      details,
    })
  } catch (error) {
    console.error('Fix image formats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
