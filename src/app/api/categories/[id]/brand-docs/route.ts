import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Parse multipart form data
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

    // Extract text from PDF using pdfjs-dist
    const arrayBuffer = await file.arrayBuffer()
    const extractedText = await extractPdfText(arrayBuffer)

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract readable text from the PDF. Please ensure the PDF contains text (not just scanned images).' },
        { status: 422 }
      )
    }

    // Truncate to a reasonable size for AI context (keep first ~8000 chars)
    const truncatedText = extractedText.trim().substring(0, 8000)
    const wasTruncated = extractedText.trim().length > 8000

    // Save to categories table
    const { error: updateError } = await supabase
      .from('categories')
      .update({
        brand_guidelines: truncatedText,
        brand_doc_name: file.name,
      })
      .eq('id', categoryId)

    if (updateError) {
      console.error('Failed to save brand guidelines:', updateError)
      return NextResponse.json({ error: 'Failed to save brand guidelines' }, { status: 500 })
    }

    console.log(`✅ Brand guidelines saved for category: ${category.slug} (${truncatedText.length} chars)`)

    return NextResponse.json({
      message: 'Brand guidelines uploaded and saved successfully',
      fileName: file.name,
      extractedLength: truncatedText.length,
      wasTruncated,
      preview: truncatedText.substring(0, 200) + '...',
    })
  } catch (error: any) {
    console.error('Error processing brand guidelines PDF:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process PDF' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/categories/[id]/brand-docs
 * Remove brand guidelines from this category
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    await supabase
      .from('categories')
      .update({ brand_guidelines: null, brand_doc_name: null })
      .eq('id', categoryId)

    return NextResponse.json({ message: 'Brand guidelines removed' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to remove brand guidelines' }, { status: 500 })
  }
}

/**
 * Extract text content from a PDF ArrayBuffer using pdfjs-dist
 */
async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // Dynamically import to avoid build-time issues
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any).catch(
      () => import('pdfjs-dist' as any)
    )

    const data = new Uint8Array(arrayBuffer)
    const loadingTask = pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false })
    const pdf = await loadingTask.promise

    let fullText = ''

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
      fullText += pageText + '\n'
    }

    return fullText
  } catch (error) {
    console.error('PDF parsing error:', error)
    throw new Error('Failed to parse PDF. Please ensure the file is a valid, text-based PDF.')
  }
}
