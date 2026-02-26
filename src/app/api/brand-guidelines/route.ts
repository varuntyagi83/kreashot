import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractPdfText, extractPdfWithVision, translateGuidelinesToColorDescription } from '@/lib/pdf'

export const dynamic = 'force-dynamic'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── GET — list user's saved brand guidelines ─────────────────────────────────

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: guidelines, error } = await supabase
      .from('brand_guidelines')
      .select('id, name, source_file_name, extracted_text, color_description, is_default, created_at, updated_at')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      guidelines: (guidelines || []).map((g) => ({
        id: g.id,
        name: g.name,
        source_file_name: g.source_file_name,
        text_preview: g.extracted_text.substring(0, 200) + (g.extracted_text.length > 200 ? '...' : ''),
        text_length: g.extracted_text.length,
        color_description: g.color_description || null,
        is_default: g.is_default,
        created_at: g.created_at,
        updated_at: g.updated_at,
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list brand guidelines' }, { status: 500 })
  }
}

// ── POST — upload PDF, extract text, save as library item ────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    console.log(`Extracting brand guidelines from PDF: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)

    const arrayBuffer = await file.arrayBuffer()

    // Try Gemini Vision first (reads colors, swatches, visual mood), fall back to text-only
    let extractedText: string | null = null
    let extractionMethod = 'vision'

    extractedText = await extractPdfWithVision(arrayBuffer)
    if (!extractedText) {
      console.log('Vision extraction unavailable, falling back to text-only extraction')
      extractionMethod = 'text'
      extractedText = await extractPdfText(arrayBuffer)
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Could not extract readable content from the PDF. Please ensure the PDF contains text or visual design specifications.' },
        { status: 422 }
      )
    }

    console.log(`PDF extracted via ${extractionMethod}: ${extractedText.trim().length} chars`)

    // Truncate to 20000 chars (fits within Gemini context)
    const truncatedText = extractedText.trim().substring(0, 20000)
    const wasTruncated = extractedText.trim().length > 20000

    // Translate hex codes to natural-language color descriptions for image generation
    const colorDescription = await translateGuidelinesToColorDescription(truncatedText)
    if (colorDescription) {
      console.log(`Color description generated (${colorDescription.length} chars)`)
    }

    // Save to brand_guidelines table
    const { data: guideline, error } = await supabase
      .from('brand_guidelines')
      .insert({
        user_id: user.id,
        name: name.trim(),
        source_file_name: file.name,
        extracted_text: truncatedText,
        color_description: colorDescription,
      })
      .select('id, name, source_file_name, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A guideline with this name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also register in asset_references for @ search
    const slug = generateSlug(name.trim())
    await supabase
      .from('asset_references')
      .insert({
        user_id: user.id,
        category_id: null,
        reference_id: `@brand-guidelines/${slug}`,
        asset_type: 'guideline',
        asset_table_id: guideline.id,
        storage_url: null,
        display_name: name.trim(),
        searchable_text: `${name.trim()} ${file.name} brand guidelines`,
      })
      .then(({ error: refError }) => {
        if (refError) console.error('Failed to create asset reference:', refError)
      })

    console.log(`✅ Brand guidelines saved: "${name.trim()}" (${truncatedText.length} chars)`)

    return NextResponse.json({
      guideline: {
        id: guideline.id,
        name: guideline.name,
        source_file_name: guideline.source_file_name,
        text_length: truncatedText.length,
        was_truncated: wasTruncated,
      },
    }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save brand guidelines' }, { status: 500 })
  }
}
