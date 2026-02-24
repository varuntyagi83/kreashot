import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'
import { createDisplayName } from '@/lib/ai/format-angle-name'

/**
 * GET /api/categories/[id]/angled-shots
 * Lists all angled shots for a category
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify category belongs to user
    const { data: category } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get('productId')
    const format = searchParams.get('format') // NEW: Format filter

    // Build query
    let query = supabase
      .from('angled_shots')
      .select(
        `
        id,
        angle_name,
        angle_description,
        display_name,
        prompt_used,
        storage_path,
        storage_url,
        storage_provider,
        created_at,
        product:products!inner(id, name, slug),
        product_image:product_images!inner(id, file_name)
      `
      )
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    // Filter by product if specified
    if (productId) {
      query = query.eq('product_id', productId)
    }

    // NEW: Filter by format if specified
    if (format) {
      query = query.eq('format', format)
    }

    const { data: angledShots, error } = await query

    console.log(`[Angled Shots API] Category: ${categoryId}, Format: ${format || 'all'}, Found: ${angledShots?.length || 0}`)

    if (error) {
      console.error('Error fetching angled shots:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get public URLs for the images (use Google Drive URLs if available)
    const angledShotsWithUrls = (angledShots || []).map((shot) => {
      let publicUrl: string

      // Use Google Drive URL if stored in Google Drive
      if (shot.storage_provider === 'gdrive' && shot.storage_url) {
        publicUrl = shot.storage_url
      } else {
        // Fallback to Supabase Storage URL
        const {
          data: { publicUrl: supabaseUrl },
        } = supabase.storage.from('angled-shots').getPublicUrl(shot.storage_path)
        publicUrl = supabaseUrl
      }

      return {
        ...shot,
        public_url: publicUrl,
      }
    })

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
      },
      angledShots: angledShotsWithUrls,
    })
  } catch (error) {
    console.error('Error fetching angled shots:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/categories/[id]/angled-shots
 * Saves a generated angled shot to storage and database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify category belongs to user and get slug
    const { data: category } = await supabase
      .from('categories')
      .select('id, slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get request body
    const body = await request.json()
    const {
      productId,
      productImageId,
      angleName,
      angleDescription,
      promptUsed,
      imageData,
      mimeType,
      format = '1:1', // Aspect ratio (defaults to 1:1)
    } = body

    // Validate required fields
    if (
      !productId ||
      !productImageId ||
      !angleName ||
      !angleDescription ||
      !imageData
    ) {
      return NextResponse.json(
        {
          error:
            'productId, productImageId, angleName, angleDescription, and imageData are required',
        },
        { status: 400 }
      )
    }

    // Calculate width and height based on format
    const formatDimensions: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1080, height: 1080 },
      '16:9': { width: 1920, height: 1080 },
      '9:16': { width: 1080, height: 1920 },
      '4:5': { width: 1080, height: 1350 },
    }
    const dimensions = formatDimensions[format] || formatDimensions['1:1']

    // Verify product belongs to this category and get slug and name
    const { data: product } = await supabase
      .from('products')
      .select('id, slug, name')
      .eq('id', productId)
      .eq('category_id', categoryId)
      .single()

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Get the original product image to determine subfolder name
    const { data: productImage } = await supabase
      .from('product_images')
      .select('id, file_name')
      .eq('id', productImageId)
      .eq('product_id', productId)
      .single()

    if (!productImage) {
      return NextResponse.json(
        { error: 'Product image not found' },
        { status: 404 }
      )
    }

    // Extract filename without extension for the angled-shots subfolder
    const imageNameWithoutExt = productImage.file_name.replace(/\.[^/.]+$/, '')

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Generate filename using the folder structure per STORAGE_HIERARCHY.md:
    // {category}/{product}/product-images/angled-shots/{format}/{image-name}-{angle}_{timestamp}.{ext}
    const fileExt = mimeType?.split('/')[1] || 'jpg'
    const formatFolder = format.replace(':', 'x') // "4:5" → "4x5"
    const fileName = `${category.slug}/${product.slug}/product-images/angled-shots/${formatFolder}/${imageNameWithoutExt}-${angleName}_${Date.now()}.${fileExt}`

    // Upload to Google Drive
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: mimeType || 'image/jpeg',
      provider: 'gdrive',
    })

    // Create display name with product prefix (e.g., "Nike Air Max_Front")
    const displayName = createDisplayName(product.name, angleName)

    // Save to database with Google Drive storage sync fields and format dimensions
    const { data: angledShot, error: dbError } = await supabase
      .from('angled_shots')
      .insert({
        product_id: productId,
        product_image_id: productImageId,
        category_id: categoryId,
        user_id: user.id,
        angle_name: angleName,
        angle_description: angleDescription,
        display_name: displayName, // Product-prefixed display name
        prompt_used: promptUsed || null,
        format: format, // Aspect ratio (1:1, 16:9, 9:16, 4:5)
        width: dimensions.width,
        height: dimensions.height,
        storage_provider: 'gdrive',
        storage_path: storageFile.path,
        storage_url: storageFile.publicUrl,
        gdrive_file_id: storageFile.fileId || null,
        metadata: {},
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save angled shot record' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'Angled shot saved successfully',
        angledShot: {
          ...angledShot,
          public_url: storageFile.publicUrl,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error saving angled shot:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
