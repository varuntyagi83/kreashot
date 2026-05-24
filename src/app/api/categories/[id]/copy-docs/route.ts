import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile } from '@/lib/storage'
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
 * GET /api/categories/[id]/copy-docs
 * Lists all copy docs for a category
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

    const copyDocs = await prisma.copyDoc.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'desc' },
      take: 1000, // defensive bound against unbounded growth per category
    })

    return NextResponse.json({
      category,
      copy_docs: copyDocs,
    })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/categories/[id]/copy-docs
 * Saves a copy doc to GCS + database
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
      originalText,
      generatedText,
      copyType,
      tone,
      language = 'en',
      promptUsed,
    } = body

    if (!name || !generatedText || !copyType) {
      return NextResponse.json(
        { error: 'name, generatedText, and copyType are required' },
        { status: 400 }
      )
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (generatedText.length > 50000) {
      return NextResponse.json({ error: 'generatedText must be 50000 characters or fewer' }, { status: 400 })
    }
    if (originalText && originalText.length > 50000) {
      return NextResponse.json({ error: 'originalText must be 50000 characters or fewer' }, { status: 400 })
    }
    if (promptUsed && promptUsed.length > 10000) {
      return NextResponse.json({ error: 'promptUsed must be 10000 characters or fewer' }, { status: 400 })
    }

    // Check if copy doc with this text already exists
    const existing = await prisma.copyDoc.findFirst({
      where: { categoryId, copyType, generatedText },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'This copy variation already exists' },
        { status: 409 }
      )
    }

    // Save as JSON file to GCS
    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const slug = generateSlug(name)
    const copyData = {
      name,
      original_text: originalText || '',
      generated_text: generatedText,
      copy_type: copyType,
      language,
      prompt_used: promptUsed || null,
      created_at: new Date().toISOString(),
    }

    const fileName = `${sanitizedCompanyName}/${company.slug}/${category.slug}/copy-docs/${copyType}/${slug}_${Date.now()}.json`
    const buffer = Buffer.from(JSON.stringify(copyData, null, 2), 'utf-8')

    console.log(`Uploading copy doc to GCS: ${fileName}`)
    const storageFile = await uploadFile(buffer, fileName, {
      contentType: 'application/json',
      provider: 'gcs',
    })

    const copyDoc = await prisma.copyDoc.create({
      data: {
        categoryId,
        userId: user.id,
        companyId,
        originalText: originalText || '',
        generatedText,
        copyType,
        language,
        metadata: { tone: tone || null, promptUsed: promptUsed || null },
      },
    })

    return NextResponse.json(
      { message: 'Copy doc saved successfully', copy_doc: copyDoc },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error saving copy doc:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
