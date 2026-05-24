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
 * GET /api/categories/[id]/composites
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

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true, slug: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const formatFilter = searchParams.get('format') || undefined

    const composites = await prisma.composite.findMany({
      where: { categoryId, ...(formatFilter ? { format: formatFilter } : {}) },
      include: {
        angledShot: { select: { id: true, angleName: true, angleDescription: true, format: true } },
        background: { select: { id: true, name: true, description: true, format: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // defensive bound against unbounded growth per category
    })

    const compositesWithUrls = composites.map((composite) => ({
      ...composite,
      public_url: composite.storageUrl || '',
      storage_path: composite.storagePath,
      storage_url: composite.storageUrl,
      storage_provider: composite.storageProvider,
      gdrive_file_id: composite.gdriveFileId,
      created_at: composite.createdAt,
      // The frontend reads snake_case aspect_ratio and angled_shot; Prisma returns
      // camelCase format and angledShot. Map them so the detail view shows the real
      // shot name (and regenerate uses the saved format, not the 1:1 fallback).
      aspect_ratio: composite.format,
      angled_shot: composite.angledShot
        ? {
            id: composite.angledShot.id,
            angle_name: composite.angledShot.angleName,
            angle_description: composite.angledShot.angleDescription,
          }
        : null,
    }))

    return NextResponse.json({
      category: { id: category.id, name: category.name, slug: category.slug },
      composites: compositesWithUrls,
    })
  } catch (error) {
    console.error('Error fetching composites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/categories/[id]/composites
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
      angledShotId,
      backgroundId,
      productId,
      format = '1:1',
      width,
      height,
      generationTimeMs,
    } = body

    if (!name || !imageData || !angledShotId || !backgroundId) {
      return NextResponse.json(
        { error: 'name, imageData, angledShotId, and backgroundId are required' },
        { status: 400 }
      )
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }

    const MAX_BASE64_LENGTH = 50 * 1024 * 1024 * 1.34
    if (imageData.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'Image too large (max 50MB)' }, { status: 400 })
    }

    const formatDimensions = getFormatDimensions(format)
    const finalWidth = width || formatDimensions.width
    const finalHeight = height || formatDimensions.height

    const angledShot = await prisma.angledShot.findFirst({
      where: { id: angledShotId, categoryId },
      select: { id: true, productId: true },
    })

    if (!angledShot) {
      return NextResponse.json({ error: 'Angled shot not found in this category' }, { status: 404 })
    }

    const background = await prisma.background.findFirst({
      where: { id: backgroundId, categoryId },
      select: { id: true },
    })

    if (!background) {
      return NextResponse.json({ error: 'Background not found in this category' }, { status: 404 })
    }

    const slug = generateSlug(name)

    const existing = await prisma.composite.findFirst({
      where: { categoryId, slug },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A composite with this name already exists in this category' },
        { status: 409 }
      )
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const folderName = formatToFolderName(format)
    const fileExt = mimeType?.split('/')[1] || 'jpg'
    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const fileName = `${sanitizedCompanyName}/${company.slug}/${category.slug}/composites/${folderName}/${slug}_${Date.now()}.${fileExt}`

    console.log(`Uploading ${format} composite to GCS: ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: mimeType || 'image/jpeg',
      provider: 'gcs',
    })

    try {
      const composite = await prisma.composite.create({
        data: {
          categoryId,
          companyId,
          userId: user.id,
          productId: productId || angledShot.productId,
          angledShotId,
          backgroundId,
          name,
          slug,
          description: description || null,
          promptUsed: promptUsed || null,
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
          message: 'Composite saved successfully',
          composite: { ...composite, public_url: storageFile.publicUrl },
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
      return NextResponse.json({ error: 'Failed to save composite record' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error saving composite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
