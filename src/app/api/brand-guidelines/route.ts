import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { extractPdfText, extractPdfWithVision, translateGuidelinesToColorDescription } from '@/lib/pdf'
import { sanitizeForPrompt } from '@/lib/ai/sanitize'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── GET — list company's saved brand guidelines ───────────────────────────────────

export async function GET() {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`list-guidelines:${user.id}`, 100, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const guidelines = await prisma.brandGuideline.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        sourceFileName: true,
        extractedText: true,
        colorDescription: true,
        isDefault: true,
        createdAt: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      guidelines: guidelines.map((g: typeof guidelines[number]) => ({
        id: g.id,
        name: g.name,
        source_file_name: g.sourceFileName,
        text_preview: g.extractedText ? g.extractedText.substring(0, 200) + (g.extractedText.length > 200 ? '...' : '') : null,
        text_length: g.extractedText?.length ?? 0,
        color_description: g.colorDescription || null,
        is_default: g.isDefault,
        created_at: g.createdAt,
      })),
    })
  } catch (error: any) {
    console.error('[brand-guidelines GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST — upload PDF, extract text, save as library item ────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`guidelines-upload:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 10MB' }, { status: 400 })
    }

    console.log(`Extracting brand guidelines from PDF: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)

    const arrayBuffer = await file.arrayBuffer()

    // Validate PDF magic bytes (%PDF-)
    const header = new Uint8Array(arrayBuffer, 0, 5)
    if (header[0] !== 0x25 || header[1] !== 0x50 || header[2] !== 0x44 || header[3] !== 0x46 || header[4] !== 0x2D) {
      return NextResponse.json({ error: 'File does not appear to be a valid PDF' }, { status: 400 })
    }

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
    const sanitizedText = sanitizeForPrompt(truncatedText)
    const colorDescription = await translateGuidelinesToColorDescription(sanitizedText)
    if (colorDescription) {
      console.log(`Color description generated (${colorDescription.length} chars)`)
    }

    // Save to brand_guidelines table
    const guideline = await prisma.brandGuideline.create({
      data: {
        userId: user.id,
        companyId,
        name: name.trim(),
        sourceFileName: file.name,
        extractedText: truncatedText,
        colorDescription: colorDescription || null,
        storagePath: '',
        storageUrl: '',
      },
      select: { id: true, name: true, sourceFileName: true, createdAt: true },
    })

    // Also register in asset_references for @ search (fire and forget)
    const slug = generateSlug(name.trim())
    prisma.assetReference.create({
      data: {
        userId: user.id,
        companyId,
        categoryId: null,
        referenceId: `@brand-guidelines/${slug}`,
        assetType: 'guideline',
        assetTableId: guideline.id,
        storageUrl: null,
        displayName: name.trim(),
        searchableText: `${name.trim()} ${file.name} brand guidelines`,
      },
    }).catch((err) => console.error('[brand-guidelines] asset_references insert threw:', err))

    console.log(`Brand guidelines saved: "${name.trim()}" (${truncatedText.length} chars)`)

    return NextResponse.json({
      guideline: {
        id: guideline.id,
        name: guideline.name,
        source_file_name: guideline.sourceFileName,
        text_length: truncatedText.length,
        was_truncated: wasTruncated,
      },
    }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A guideline with this name already exists' }, { status: 409 })
    }
    console.error('[brand-guidelines POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
