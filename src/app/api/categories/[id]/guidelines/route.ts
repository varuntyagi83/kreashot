import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile, deleteFile } from '@/lib/storage'
import { getCompanyId } from '@/lib/get-company'

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function detectFileMime(buf: Buffer): string | null {
  if (buf.length < 5) return null
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2D) return 'application/pdf'
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  return null
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Verify category belongs to company
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('id', categoryId)
      .eq('company_id', companyId)
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
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { data: category } = await supabase
      .from('categories')
      .select('id, slug')
      .eq('id', categoryId)
      .eq('company_id', companyId)
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

    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (description && description.length > 1000) {
      return NextResponse.json({ error: 'description must be 1000 characters or fewer' }, { status: 400 })
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
    const fileName = `${companyId}/${category.slug}/guidelines/${slug}_${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const detectedMime = detectFileMime(buffer)
    if (!detectedMime || !allowedTypes.includes(detectedMime)) {
      return NextResponse.json({ error: 'Invalid file type. Only PDF, PNG, and JPEG files are allowed.' }, { status: 400 })
    }

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
        company_id: companyId,
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
      // Clean up the orphaned GDrive file since DB insert failed
      try {
        const fileIdOrPath = storageFile.fileId || storageFile.path
        console.log(`Cleaning up orphaned GDrive file: ${fileIdOrPath}`)
        await deleteFile(fileIdOrPath, { provider: 'gdrive' })
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned GDrive file:', cleanupError)
      }
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
