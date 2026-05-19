import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { extractPdfText, extractPdfWithVision, translateGuidelinesToColorDescription } from '@/lib/pdf'

export const dynamic = 'force-dynamic'

/**
 * POST /api/categories/[id]/brand-docs
 * Upload a brand guidelines PDF, extract text, store in categories.brand_guidelines
 */
export async function POST(
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
      select: { id: true, name: true, slug: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    console.log(`Parsing brand guidelines PDF: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)

    const arrayBuffer = await file.arrayBuffer()

    const header = new Uint8Array(arrayBuffer, 0, 5)
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46 || header[4] !== 0x2D) {
      return NextResponse.json({ error: 'File does not appear to be a valid PDF' }, { status: 400 })
    }

    let extractedText: string | null = await extractPdfWithVision(arrayBuffer)
    if (!extractedText || extractedText.trim().length < 50) {
      extractedText = await extractPdfText(arrayBuffer)
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract readable text from the PDF. Please ensure the PDF contains text (or visual design specs for Vision).' },
        { status: 422 }
      )
    }

    const truncatedText = extractedText.trim().substring(0, 20000)
    const wasTruncated = extractedText.trim().length > 20000

    const brandGuidelinesColorDescription = await translateGuidelinesToColorDescription(truncatedText)
    if (brandGuidelinesColorDescription) {
      console.log(`Color description for category: ${brandGuidelinesColorDescription.length} chars`)
    }

    await prisma.category.update({
      where: { id: categoryId },
      data: {
        brandGuidelines: truncatedText,
        brandDocName: file.name,
        brandGuidelinesColorDescription: brandGuidelinesColorDescription ?? null,
      },
    })

    console.log(`Brand guidelines saved for category: ${category.slug} (${truncatedText.length} chars)`)

    return NextResponse.json({
      message: 'Brand guidelines uploaded and saved successfully',
      fileName: file.name,
      extractedLength: truncatedText.length,
      wasTruncated,
      preview: truncatedText.substring(0, 200) + '...',
    })
  } catch (error: any) {
    console.error('Error processing brand guidelines PDF:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/categories/[id]/brand-docs
 */
export async function DELETE(
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

    await prisma.category.update({
      where: { id: categoryId },
      data: {
        brandGuidelines: null,
        brandDocName: null,
        brandGuidelinesColorDescription: null,
      },
    })

    return NextResponse.json({ message: 'Brand guidelines removed' })
  } catch (error: any) {
    console.error('[brand-docs DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
