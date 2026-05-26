import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile, deleteFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions } from '@/lib/formats'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

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
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId } = await params

    const { searchParams } = new URL(request.url)
    const formatFilter = searchParams.get('format') || undefined

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true, slug: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const backgrounds = await prisma.background.findMany({
      where: { categoryId, ...(formatFilter ? { format: formatFilter } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000, // defensive bound against unbounded growth per category
    })

    const backgroundsWithUrls = backgrounds.map((bg) => ({
      ...bg,
      public_url: bg.storageUrl || '',
      prompt_used: bg.promptUsed,
      storage_path: bg.storagePath,
      storage_url: bg.storageUrl,
      storage_provider: bg.storageProvider,
      gdrive_file_id: bg.gdriveFileId,
      created_at: bg.createdAt,
    }))

    return NextResponse.json({
      category: { id: category.id, name: category.name, slug: category.slug },
      backgrounds: backgroundsWithUrls,
    })
  } catch (error) {
    console.error('Error fetching backgrounds:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/categories/[id]/backgrounds
 * Saves a generated background to GCS and database
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId } = await params

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, slug: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      description,
      promptUsed,
      imageData,
      mimeType,
      format = '1:1',
      width,
      height,
      generationTimeMs,
    } = body

    const formatDimensions = getFormatDimensions(format)
    const finalWidth = width || formatDimensions.width
    const finalHeight = height || formatDimensions.height

    if (!name || !imageData) {
      return NextResponse.json({ error: 'name and imageData are required' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }

    const MAX_BASE64_LENGTH = 50 * 1024 * 1024 * 1.34
    if (imageData.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Image too large (max 50MB)' }, { status: 400 })
    }

    let finalName = name
    let slug = generateSlug(name)

    // If this slug is taken, auto-pick the next free numbered variant
    const existing = await prisma.background.findFirst({
      where: { categoryId, slug },
      select: { id: true },
    })

    if (existing) {
      let found = false
      for (let i = 2; i <= 999; i++) {
        const candidate = `${name} ${i}`
        const candidateSlug = generateSlug(candidate)
        const taken = await prisma.background.findFirst({
          where: { categoryId, slug: candidateSlug },
          select: { id: true },
        })
        if (!taken) {
          finalName = candidate
          slug = candidateSlug
          found = true
          break
        }
      }
      if (!found) {
        return NextResponse.json(
          { error: 'Could not auto-generate a unique name. Please provide a custom name.' },
          { status: 409 }
        )
      }
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const folderName = formatToFolderName(format)
    const fileExt = mimeType?.split('/')[1] || 'jpg'
    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const fileName = `${sanitizedCompanyName}/${company.slug}/${category.slug}/backgrounds/${folderName}/${slug}_${Date.now()}.${fileExt}`

    console.log(`Uploading ${format} background to GCS: ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: mimeType || 'image/jpeg',
      provider: 'gcs',
    })

    try {
      const background = await prisma.background.create({
        data: {
          categoryId,
          companyId,
          userId: user.id,
          name: finalName,
          slug,
          description: description || null,
          promptUsed: promptUsed || 'Uploaded background',
          format,
          storageProvider: 'gcs',
          storagePath: storageFile.path,
          storageUrl: storageFile.publicUrl,
          gdriveFileId: null,
          metadata: { width: finalWidth, height: finalHeight, generationTimeMs: generationTimeMs ?? null },
        },
      })

      return NextResponse.json(
        {
          message: 'Background saved successfully',
          background: { ...background, public_url: storageFile.publicUrl },
        },
        { status: 201 }
      )
    } catch (dbError) {
      console.error('Database error:', dbError)
      try {
        await deleteFile(storageFile.path, { provider: 'gcs' })
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned GCS file:', cleanupError)
      }
      return NextResponse.json({ error: 'Failed to save background record' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error saving background:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
