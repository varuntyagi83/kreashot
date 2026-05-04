import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile, deleteFile } from '@/lib/storage'
import sharp from 'sharp'
import { detectFormatFromDimensions, formatToFolderName } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyInfo } from '@/lib/get-company'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  if (buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return 'image/jpeg'
  if (buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47) return 'image/png'
  if (buf[0]===0x52 && buf[1]===0x49 && buf[2]===0x46 && buf[3]===0x46 &&
      buf[8]===0x57 && buf[9]===0x45 && buf[10]===0x42 && buf[11]===0x50) return 'image/webp'
  if (buf[0]===0x47 && buf[1]===0x49 && buf[2]===0x46) return 'image/gif'
  return null
}

// GET /api/categories/[id]/products/[productId]/images - List product images
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(`list-product-images:${user.id}`, 100, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId } = companyInfo

    // Verify product belongs to company's category
    const { data: product } = await supabase
      .from('products')
      .select('*, category:categories!inner(company_id)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.company_id', companyId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Get all images for this product
    const { data: images, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[product images GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Get public URLs for the images (use Google Drive URLs if available)
    const imagesWithUrls = (images || []).map((image) => {
      let publicUrl: string

      if (image.storage_url) {
        publicUrl = image.storage_url
      } else {
        // Fallback to Supabase Storage URL (legacy supabase-backed records)
        const {
          data: { publicUrl: supabaseUrl },
        } = supabase.storage.from('product-images').getPublicUrl(image.file_path)
        publicUrl = supabaseUrl
      }

      return {
        ...image,
        public_url: publicUrl,
      }
    })

    return NextResponse.json({ images: imagesWithUrls })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/categories/[id]/products/[productId]/images - Upload product images
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, productId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId, company_slug: companySlug, company_name: companyName } = companyInfo

    const rateLimit = checkRateLimit(`upload:${user.id}`, 20, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Upload rate limit exceeded' }, { status: 429 })
    }

    // Verify product belongs to company's category and get slugs
    const { data: product } = await supabase
      .from('products')
      .select('*, category:categories!inner(company_id, slug)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.company_id', companyId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Get category slug
    const categorySlug = product.category.slug

    // Get form data
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const clientFormat = formData.get('format') as string | null // Fallback only

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Check if this is the first image (will be primary)
    const { count: existingCount } = await supabase
      .from('product_images')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)

    const isFirstImage = existingCount === 0

    const uploadedImages = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      const MAX_IMAGE_SIZE = 20 * 1024 * 1024 // 20MB
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: 'Image too large (max 20MB)' }, { status: 400 })
      }

      // Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer())

      // Magic-byte detection is authoritative — never fall back to browser-supplied file.type,
      // which an attacker can spoof. Reject immediately if detection fails or yields a non-image type.
      const detectedMime = detectImageMime(buffer)
      if (!detectedMime) {
        return NextResponse.json({ error: 'Invalid image file: could not detect format' }, { status: 400 })
      }
      if (!detectedMime.startsWith('image/')) {
        return NextResponse.json({ error: 'Invalid image file: unsupported format' }, { status: 400 })
      }
      if (!['image/jpeg','image/png','image/webp','image/gif'].includes(detectedMime)) {
        return NextResponse.json({ error: 'Invalid image file content' }, { status: 400 })
      }

      // Detect actual image dimensions and determine the correct format
      let detectedFormat = clientFormat || '1:1'
      try {
        const metadata = await sharp(buffer).metadata()
        if (metadata.width && metadata.height) {
          detectedFormat = detectFormatFromDimensions(metadata.width, metadata.height)
          console.log(`🔍 Detected image dimensions: ${metadata.width}x${metadata.height} → format: ${detectedFormat}`)
        }
      } catch (dimError) {
        console.warn(`⚠️ Could not detect image dimensions, using client format: ${clientFormat}`, dimError)
      }

      const formatFolder = formatToFolderName(detectedFormat)
      const sanitizedCompanyName = sanitizeCompanyName(companyName)

      // Generate filename following hierarchy:
      // {companyName}/{companySlug}/{category-slug}/{product-slug}/product-images/angled-shots/{aspect-ratio}/{filename}
      const fileExt = file.name.split('.').pop() || 'jpg'
      const timestamp = Date.now()
      const sanitizedFileName = file.name
        .replace(/\.[^/.]+$/, '') // Remove extension
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
        .replace(/^-+|-+$/g, '') // Trim hyphens

      const storagePath = `${sanitizedCompanyName}/${companySlug}/${categorySlug}/${product.slug}/product-images/angled-shots/${formatFolder}/${sanitizedFileName}-${timestamp}.${fileExt}`

      const storageProvider = (process.env.STORAGE_PROVIDER || 'gcs') as 'gcs' | 'gdrive' | 'supabase'
      console.log(`📤 Uploading product image via ${storageProvider}: ${storagePath}`)

      // Use exclusively the magic-byte detected MIME type. At this point detectedMime is
      // guaranteed non-null because the checks above would have returned a 400 otherwise.
      const resolvedMime = detectedMime

      const storageFile = await uploadFile(buffer, storagePath, {
        contentType: resolvedMime,
      })

      console.log(`✅ Upload successful! URL: ${storageFile.publicUrl}`)

      const { data: imageRecord, error: dbError } = await supabase
        .from('product_images')
        .insert({
          product_id: productId,
          file_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          mime_type: resolvedMime,
          is_primary: isFirstImage && i === 0,
          storage_provider: storageProvider,
          storage_path: storagePath,
          storage_url: storageFile.publicUrl,
          gdrive_file_id: storageFile.fileId || null,
          company_id: companyId,
        })
        .select()
        .single()

      if (dbError || !imageRecord) {
        console.error('[product-images] DB insert failed, cleaning up storage file:', dbError)
        try {
          await deleteFile(storageFile.fileId || storagePath)
        } catch (cleanupErr) {
          console.error('[product-images] Storage cleanup failed:', cleanupErr)
        }
        // continue to next image rather than crashing the whole batch
        continue
      }
      uploadedImages.push({
        ...imageRecord,
        public_url: storageFile.publicUrl,
      })
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json(
        { error: 'Failed to upload images' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: `Successfully uploaded ${uploadedImages.length} image(s)`,
        images: uploadedImages,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
