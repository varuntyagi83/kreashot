import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractPdfText, extractPdfWithVision, translateGuidelinesToColorDescription } from '@/lib/pdf'
import { getCompanyId } from '@/lib/get-company'

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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Verify ownership
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('id', categoryId)
      .eq('company_id', companyId)
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

    const arrayBuffer = await file.arrayBuffer()

    // Validate PDF magic bytes (%PDF-)
    const header = new Uint8Array(arrayBuffer, 0, 5)
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46 || header[4] !== 0x2D) {
      return NextResponse.json({ error: 'File does not appear to be a valid PDF' }, { status: 400 })
    }

    // Use Vision first (reads colors, swatches, layout) for accurate backgrounds/composites; fallback to text-only
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

    // Truncate to a reasonable size for AI context (keep first ~20000 chars)
    const truncatedText = extractedText.trim().substring(0, 20000)
    const wasTruncated = extractedText.trim().length > 20000

    // Generate natural-language color description so backgrounds/composites get accurate brand colors
    const brandGuidelinesColorDescription = await translateGuidelinesToColorDescription(truncatedText)
    if (brandGuidelinesColorDescription) {
      console.log(`Color description for category: ${brandGuidelinesColorDescription.length} chars`)
    }

    // Save to categories table (text + optional color description for image prompts)
    const { error: updateError } = await supabase
      .from('categories')
      .update({
        brand_guidelines: truncatedText,
        brand_doc_name: file.name,
        brand_guidelines_color_description: brandGuidelinesColorDescription ?? null,
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
      { error: 'Internal server error' },
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    await supabase
      .from('categories')
      .update({ brand_guidelines: null, brand_doc_name: null, brand_guidelines_color_description: null })
      .eq('id', categoryId)

    return NextResponse.json({ message: 'Brand guidelines removed' })
  } catch (error: any) {
    console.error('[brand-docs DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

