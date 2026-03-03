import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateAngledShots } from '@/lib/ai/gemini'
import { ANGLE_VARIATIONS } from '@/lib/ai/angle-variations'
import { downloadFile, uploadFile } from '@/lib/storage'
import { createDisplayName } from '@/lib/ai/format-angle-name'
import sharp from 'sharp'
import { detectFormatFromDimensions, formatToFolderName } from '@/lib/formats'

/**
 * POST /api/categories/[id]/angled-shots/generate
 *
 * Generates angled shot variations from a product image using Gemini AI
 * and saves each one directly to Google Drive + Supabase — no base64 in response.
 *
 * Previously the route returned all images as base64 to the client which then
 * re-uploaded them. That caused Railway proxy timeouts (7 × 1-2 MB response).
 * Now generate + save happens entirely server-side.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const { productId, productImageId, selectedAngles, format = '1:1' } = body

    if (!productId || !productImageId) {
      return NextResponse.json(
        { error: 'productId and productImageId are required' },
        { status: 400 }
      )
    }

    const validFormats = ['1:1', '16:9', '9:16', '4:5']
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${validFormats.join(', ')}` },
        { status: 400 }
      )
    }

    const { data: product } = await supabase
      .from('products')
      .select('id, name, slug, category_id')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const { data: productImage } = await supabase
      .from('product_images')
      .select('id, file_path, file_name, mime_type, storage_provider, storage_url, storage_path, gdrive_file_id')
      .eq('id', productImageId)
      .eq('product_id', productId)
      .single()

    if (!productImage) {
      return NextResponse.json({ error: 'Product image not found' }, { status: 404 })
    }

    // Download source image from GDrive or Supabase
    let imageBuffer: Buffer | null = null

    if (productImage.storage_provider === 'gdrive') {
      const gdriveKey = productImage.gdrive_file_id || productImage.storage_path
      if (!gdriveKey) {
        return NextResponse.json(
          { error: 'Product image has no Google Drive file ID or storage path' },
          { status: 500 }
        )
      }
      try {
        imageBuffer = await downloadFile(gdriveKey, { provider: 'gdrive' })
      } catch (error) {
        console.error('Error downloading from Google Drive:', error)
        return NextResponse.json(
          { error: 'Failed to download product image from Google Drive' },
          { status: 500 }
        )
      }
    } else {
      const { data: downloadedBlob, error: downloadError } = await supabase.storage
        .from('product-images')
        .download(productImage.file_path)

      if (downloadError || !downloadedBlob) {
        return NextResponse.json(
          { error: 'Failed to download product image from Supabase Storage' },
          { status: 500 }
        )
      }
      imageBuffer = Buffer.from(await downloadedBlob.arrayBuffer())
    }

    if (!imageBuffer) {
      return NextResponse.json({ error: 'Failed to download product image' }, { status: 500 })
    }

    const base64Image = imageBuffer.toString('base64')

    const anglesToGenerate = selectedAngles
      ? ANGLE_VARIATIONS.filter((angle) => selectedAngles.includes(angle.name))
      : ANGLE_VARIATIONS

    if (anglesToGenerate.length === 0) {
      return NextResponse.json({ error: 'No valid angles selected' }, { status: 400 })
    }

    console.log(`🎨 Generating ${anglesToGenerate.length} angled shots for ${product.name} [${format}]...`)

    // Generate all shots via Gemini (batched concurrency handled inside)
    const generatedShots = await generateAngledShots(
      base64Image,
      productImage.mime_type,
      anglesToGenerate,
      category.look_and_feel || undefined,
      format
    )

    const imageNameWithoutExt = productImage.file_name.replace(/\.[^/.]+$/, '')

    // Save each shot to GDrive + DB directly — no base64 returned to client
    const savedShots = await Promise.all(
      generatedShots.map(async (shot) => {
        try {
          const base64Data = shot.imageData.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')

          // Detect actual dimensions for format tagging
          let detectedFormat = format
          let actualWidth = 1080
          let actualHeight = 1080
          try {
            const metadata = await sharp(buffer).metadata()
            if (metadata.width && metadata.height) {
              detectedFormat = detectFormatFromDimensions(metadata.width, metadata.height)
              actualWidth = metadata.width
              actualHeight = metadata.height
            }
          } catch {
            // use client-provided format as fallback
          }

          const fileExt = shot.mimeType?.split('/')[1] || 'jpg'
          const formatFolder = formatToFolderName(detectedFormat)
          const fileName = `${category.slug}/${product.slug}/product-images/angled-shots/${formatFolder}/${imageNameWithoutExt}-${shot.angleName}_${Date.now()}.${fileExt}`

          const storageFile = await uploadFile(buffer, fileName, {
            contentType: shot.mimeType || 'image/jpeg',
            provider: 'gdrive',
          })

          const displayName = createDisplayName(product.name, shot.angleName)

          const { data: angledShot, error: dbError } = await supabase
            .from('angled_shots')
            .insert({
              product_id: productId,
              product_image_id: productImageId,
              category_id: categoryId,
              user_id: user.id,
              angle_name: shot.angleName,
              angle_description: shot.angleDescription,
              display_name: displayName,
              prompt_used: shot.promptUsed || null,
              format: detectedFormat,
              width: actualWidth,
              height: actualHeight,
              storage_provider: 'gdrive',
              storage_path: storageFile.path,
              storage_url: storageFile.publicUrl,
              gdrive_file_id: storageFile.fileId || null,
              metadata: {},
            })
            .select()
            .single()

          if (dbError) {
            console.error(`DB insert failed for ${shot.angleName}:`, dbError)
            return null
          }

          return { ...angledShot, public_url: storageFile.publicUrl }
        } catch (err) {
          console.error(`Failed to save ${shot.angleName}:`, err)
          return null
        }
      })
    )

    const saved = savedShots.filter(Boolean)
    console.log(`✅ Saved ${saved.length}/${generatedShots.length} angled shots`)

    return NextResponse.json({
      message: `Generated and saved ${saved.length} angled shots for ${format} format`,
      count: saved.length,
      format,
      angledShots: saved,
    })
  } catch (error) {
    console.error('Error generating angled shots:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate angled shots',
      },
      { status: 500 }
    )
  }
}
