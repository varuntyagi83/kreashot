import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile, deleteFile } from '@/lib/storage'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

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

    const guidelines = await prisma.guideline.findMany({
      where: { categoryId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    return NextResponse.json({
      category: { id: category.id, name: category.name, slug: category.slug },
      guidelines: guidelines.map((g) => ({ ...g, created_at: g.createdAt })),
    })
  } catch (error) {
    console.error('Error fetching guidelines:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, PNG, and JPEG files are allowed.' },
        { status: 400 }
      )
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    const slug = generateSlug(name)
    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const ext = file.name.split('.').pop() || 'bin'
    const fileName = `${sanitizedCompanyName}/${company.slug}/${category.slug}/guidelines/${slug}_${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const detectedMime = detectFileMime(buffer)
    if (!detectedMime || !allowedTypes.includes(detectedMime)) {
      return NextResponse.json({ error: 'Invalid file type. Only PDF, PNG, and JPEG files are allowed.' }, { status: 400 })
    }

    console.log(`Uploading guideline to GCS: ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: file.type,
      provider: 'gcs',
    })

    try {
      const guideline = await prisma.guideline.create({
        data: {
          categoryId,
          userId: user.id,
          companyId,
          name,
          description: description || null,
          storagePath: storageFile.path,
          storageUrl: storageFile.publicUrl,
          storageProvider: 'gcs',
          gdriveFileId: storageFile.fileId || null,
          safeZones: {},
          elementPositions: {},
          metadata: {
            file_type: file.type,
            file_size: file.size,
            original_name: file.name,
          },
        },
      })

      return NextResponse.json(
        { message: 'Guideline uploaded successfully', guideline },
        { status: 201 }
      )
    } catch (dbError) {
      console.error('Database error:', dbError)
      try {
        await deleteFile(storageFile.path, { provider: 'gcs' })
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned GCS file:', cleanupError)
      }
      return NextResponse.json({ error: 'Failed to save guideline' }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Error uploading guideline:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
