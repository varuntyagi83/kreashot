import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'

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

    // Verify product belongs to user's category
    const { data: product } = await supabase
      .from('products')
      .select('*, category:categories!inner(user_id)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get public URLs for the images (use Google Drive URLs if available)
    const imagesWithUrls = (images || []).map((image) => {
      let publicUrl: string

      // Use Google Drive URL if stored in Google Drive
      if (image.storage_provider === 'gdrive' && image.storage_url) {
        publicUrl = image.storage_url
      } else {
        // Fallback to Supabase Storage URL
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

    // Verify product belongs to user's category and get slugs
    const { data: product } = await supabase
      .from('products')
      .select('*, category:categories!inner(user_id, slug)')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Get category slug
    const categorySlug = product.category.slug

    // Get form data
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const format = formData.get('format') as string | null // Aspect ratio (1:1, 4:5, 9:16, 16:9)

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    if (!format) {
      return NextResponse.json({ error: 'Format (aspect ratio) is required' }, { status: 400 })
    }

    // Convert format from "4:5" to "4x5" for folder naming
    const formatFolder = format.replace(':', 'x')

    // Check if this is the first image (will be primary)
    const { count: existingCount } = await supabase
      .from('product_images')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)

    const isFirstImage = existingCount === 0

    const uploadedImages = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Validate file type
      if (!file.type.startsWith('image/')) {
        continue
      }

      // Generate filename following hierarchy:
      // {category-slug}/{product-slug}/product-images/angled-shots/{aspect-ratio}/{filename}
      const fileExt = file.name.split('.').pop() || 'jpg'
      const timestamp = Date.now()
      const sanitizedFileName = file.name
        .replace(/\.[^/.]+$/, '') // Remove extension
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
        .replace(/^-+|-+$/g, '') // Trim hyphens

      const storagePath = `${categorySlug}/${product.slug}/product-images/angled-shots/${formatFolder}/${sanitizedFileName}-${timestamp}.${fileExt}`

      console.log(`📤 Uploading product image to Google Drive: ${storagePath}`)

      // Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer())

      // Upload to Google Drive
      const storageFile = await uploadFile(buffer, storagePath, {
        contentType: file.type,
        provider: 'gdrive',
      })

      console.log(`✅ Upload successful! File ID: ${storageFile.fileId}`)

      // Save to database with Google Drive storage sync fields
      const { data: imageRecord, error: dbError } = await supabase
        .from('product_images')
        .insert({
          product_id: productId,
          file_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          is_primary: isFirstImage && i === 0, // First image of first upload is primary
          storage_provider: 'gdrive',
          storage_path: storagePath,
          storage_url: storageFile.publicUrl,
          gdrive_file_id: storageFile.fileId || null,
        })
        .select()
        .single()

      if (!dbError && imageRecord) {
        uploadedImages.push({
          ...imageRecord,
          public_url: storageFile.publicUrl,
        })
      }
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
