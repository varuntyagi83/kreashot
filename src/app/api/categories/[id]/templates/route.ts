import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { GoogleDriveAdapter } from '@/lib/storage/gdrive-adapter'
import { FORMATS } from '@/lib/formats'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params

    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const format = request.nextUrl.searchParams.get('format') || undefined

    const templates = await prisma.template.findMany({
      where: { categoryId, ...(format ? { format } : {}) },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error('Error in templates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params

    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const body = await request.json()
    const { name, description, format, width, height, template_data } = body

    if (!format || !Object.keys(FORMATS).includes(format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${Object.keys(FORMATS).join(', ')}` }, { status: 400 })
    }
    if (name && name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }

    const safeName = (name || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (!safeName) {
      return NextResponse.json({ error: 'Invalid template name' }, { status: 400 })
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, slug: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const formatFolder = format.replace(':', 'x')
    const storagePath = `${sanitizedCompanyName}/${company.slug}/${category.slug}/templates/${formatFolder}/${safeName}.json`

    const template = await prisma.template.create({
      data: {
        categoryId,
        userId: user.id,
        companyId,
        name: safeName,
        format,
        storageProvider: 'gdrive',
        storagePath,
        storageUrl: '',
        metadata: { description: description || null, width: width || null, height: height || null, templateData: template_data || {}, slug: safeName },
      },
    })

    // Upload template JSON to Google Drive
    try {
      const gdrive = new GoogleDriveAdapter()
      const templateBuffer = Buffer.from(JSON.stringify(template_data, null, 2), 'utf-8')
      const uploadResult = await gdrive.upload(templateBuffer, storagePath, { contentType: 'application/json' })

      const updatedTemplate = await prisma.template.update({
        where: { id: template.id },
        data: { storageUrl: uploadResult.publicUrl },
      })

      return NextResponse.json({ template: updatedTemplate }, { status: 201 })
    } catch (uploadError) {
      console.error('Error uploading to Google Drive:', uploadError)
      return NextResponse.json({
        template,
        warning: 'Template created but failed to upload to Google Drive'
      }, { status: 201 })
    }
  } catch (error: any) {
    console.error('Error in templates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
