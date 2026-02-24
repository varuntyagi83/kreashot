import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'

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
 * GET /api/categories/[id]/guidelines
 * Lists all guideline documents for a category
 */
export async function GET(
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

    // Get all guidelines for this category
    const { data: guidelines, error } = await supabase
      .from('guidelines')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching guidelines:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      guidelines: guidelines || [],
    })
  } catch (error) {
    console.error('Error fetching guidelines:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/categories/[id]/guidelines
 * Uploads a guideline document (PDF, PNG, JPEG)
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
      .select('id, slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null
    const description = formData.get('description') as string | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            'Invalid file type. Only PDF, PNG, and JPEG files are allowed.',
        },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      )
    }

    const slug = generateSlug(name)

    // Get file extension
    const ext = file.name.split('.').pop() || 'bin'

    // Upload to Google Drive
    const fileName = `${category.slug}/guidelines/${slug}_${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    console.log(`Uploading guideline to Google Drive: ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: file.type,
      provider: 'gdrive',
    })

    // Save to database
    const { data: guideline, error: dbError } = await supabase
      .from('guidelines')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        name,
        description: description || null,
        storage_path: storageFile.path,
        storage_url: storageFile.publicUrl,
        storage_provider: 'gdrive',
        gdrive_file_id: storageFile.fileId || null,
        slug,
        safe_zones: {},
        element_positions: {},
        metadata: {
          file_type: file.type,
          file_size: file.size,
          original_name: file.name,
        },
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to save guideline' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: 'Guideline uploaded successfully', guideline },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error uploading guideline:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/categories/[id]/guidelines/[guidelineId]
 * Implemented in separate [guidelineId]/route.ts file
 * (Listed here for documentation purposes)
 */
