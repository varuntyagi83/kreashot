import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { GoogleDriveAdapter } from '@/lib/storage/gdrive-adapter'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: categoryId, templateId } = await params

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

    const template = await prisma.template.findFirst({
      where: { id: templateId, categoryId },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Error in template GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: categoryId, templateId } = await params

    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const body = await request.json()
    const { name, description, format, width, height, template_data } = body

    if (name && name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, slug: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const formatFolder = format?.replace(':', 'x')
    const newSlug = name?.toLowerCase().replace(/\s+/g, '-')
    const newStoragePath = `${sanitizedCompanyName}/${company.slug}/${category.slug}/templates/${formatFolder}/${newSlug}.json`

    const existing = await prisma.template.findFirst({
      where: { id: templateId, companyId },
      select: { id: true, storagePath: true, metadata: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Template not found or unauthorized' }, { status: 404 })
    }

    const template = await prisma.template.update({
      where: { id: templateId },
      data: {
        name: name || undefined,
        format: format || undefined,
        storagePath: newStoragePath,
        ...(template_data || description !== undefined || width !== undefined || height !== undefined || newSlug ? {
          metadata: {
            ...(existing.metadata as any || {}),
            ...(description !== undefined ? { description } : {}),
            ...(width !== undefined ? { width } : {}),
            ...(height !== undefined ? { height } : {}),
            ...(template_data ? { templateData: template_data } : {}),
            ...(newSlug ? { slug: newSlug } : {}),
          },
        } : {}),
      },
    })

    if (template_data) {
      try {
        const gdrive = new GoogleDriveAdapter()
        const templateBuffer = Buffer.from(JSON.stringify(template_data, null, 2), 'utf-8')

        // Delete old file if path changed
        if (existing.storagePath && existing.storagePath !== newStoragePath) {
          try {
            await gdrive.delete(existing.storagePath)
          } catch (deleteError) {
            console.log('Could not delete old template file:', deleteError)
          }
        }

        const uploadResult = await gdrive.upload(templateBuffer, newStoragePath, { contentType: 'application/json' })

        const updatedTemplate = await prisma.template.update({
          where: { id: template.id },
          data: { storageUrl: uploadResult.publicUrl },
        })

        return NextResponse.json({ template: updatedTemplate })
      } catch (uploadError) {
        console.error('Error uploading to Google Drive:', uploadError)
        return NextResponse.json({
          template,
          warning: 'Template updated but failed to upload to Google Drive'
        })
      }
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error('Error in template PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { templateId } = await params

    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const template = await prisma.template.findFirst({
      where: { id: templateId, companyId },
      select: { id: true },
    })

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    await prisma.template.delete({ where: { id: templateId } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error in template DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
