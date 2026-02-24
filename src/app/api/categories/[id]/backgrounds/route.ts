import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions } from '@/lib/formats'

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * GET /api/categories/[id]/backgrounds
 * Lists all backgrounds for a category
 * Optional query param: ?format=1:1 to filter by format
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
      .select('id, name, slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Get optional format filter from query params
    const { searchParams } = new URL(request.url)
    const formatFilter = searchParams.get('format')

    // Build query
    let query = supabase
      .from('backgrounds')
      .select('*')
      .eq('category_id', categoryId)

    // Apply format filter if provided
    if (formatFilter) {
      query = query.eq('format', formatFilter)
      console.log(`Filtering backgrounds by format: ${formatFilter}`)
    }

    // Execute query
    const { data: backgrounds, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching backgrounds:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get public URLs for the images (use Google Drive URLs if available)
    const backgroundsWithUrls = (backgrounds || []).map((bg) => {
      let publicUrl: string

      // Use Google Drive URL if stored in Google Drive
      if (bg.storage_provider === 'gdrive' && bg.storage_url) {
        publicUrl = bg.storage_url
      } else {
        // Fallback to Supabase Storage URL (shouldn't happen with new backgrounds)
        publicUrl = bg.storage_url || ''
      }

      return {
        ...bg,
        public_url: publicUrl,
      }
    })

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      backgrounds: backgroundsWithUrls,
    })
  } catch (error) {
    console.error('Error fetching backgrounds:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/categories/[id]/backgrounds
 * Saves a generated background to Google Drive and database
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
      name,
      description,
      promptUsed,
      imageData,
      mimeType,
      format = '1:1', // NEW: Format parameter
      width,
      height
    } = body

    // Get format dimensions (use provided width/height or defaults from format config)
    const formatDimensions = getFormatDimensions(format)
    const finalWidth = width || formatDimensions.width
    const finalHeight = height || formatDimensions.height

    console.log(`Saving ${format} background: ${finalWidth}x${finalHeight}`)

    // Validate required fields
    if (!name || !imageData) {
      return NextResponse.json(
        { error: 'name and imageData are required' },
        { status: 400 }
      )
    }

    // Generate slug
    const slug = generateSlug(name)

    // Check if background with this slug already exists
    const { data: existing } = await supabase
      .from('backgrounds')
      .select('id')
      .eq('category_id', categoryId)
      .eq('slug', slug)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'A background with this name already exists in this category' },
        { status: 409 }
      )
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Generate filename using format-specific folder (x-notation for filesystem)
    const folderName = formatToFolderName(format)
    const fileExt = mimeType?.split('/')[1] || 'jpg'
    const fileName = `${category.slug}/backgrounds/${folderName}/${slug}_${Date.now()}.${fileExt}`

    // Upload to Google Drive
    console.log(`Uploading ${format} background to Google Drive (folder: ${folderName}): ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: mimeType || 'image/jpeg',
      provider: 'gdrive',
    })

    // Save to database with storage sync fields + format info
    const { data: background, error: dbError } = await supabase
      .from('backgrounds')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        name,
        slug,
        description: description || null,
        prompt_used: promptUsed || null,
        format, // NEW: Format field
        width: finalWidth, // NEW: Width field
        height: finalHeight, // NEW: Height field
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
      // Try to delete the uploaded file
      // Note: deletion queue will handle this if we just return error
      return NextResponse.json(
        { error: 'Failed to save background record' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'Background saved successfully',
        background: {
          ...background,
          public_url: storageFile.publicUrl,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error saving background:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

