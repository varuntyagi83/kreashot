import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import {
  extractVoiceFromText,
  extractVoiceFromQA,
  extractVoiceFromImages,
} from '@/lib/ai/brand-voice'
import { checkRateLimit } from '@/lib/rate-limit'
import { downloadFile } from '@/lib/storage'
import { extractPdfWithVision, extractPdfText } from '@/lib/pdf'

export const dynamic = 'force-dynamic'

// GET — return current brand voice profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params

  const ctx = await requireSession()
  if (ctx instanceof NextResponse) return ctx
  const { companyId } = ctx

  const category = await prisma.category.findFirst({
    where: { id: categoryId, companyId },
    select: { id: true, brandVoice: true },
  })

  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  let brandVoice = null
  if (category.brandVoice) {
    try {
      brandVoice = typeof category.brandVoice === 'string' ? JSON.parse(category.brandVoice) : category.brandVoice
    } catch {
      brandVoice = category.brandVoice
    }
  }
  return NextResponse.json({ brand_voice: brandVoice })
}

// POST — extract and save brand voice
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params

    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`brand-voice:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true, lookAndFeel: true },
    })

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const body = await request.json()
    const { method, lookAndFeel } = body

    if (lookAndFeel && typeof lookAndFeel === 'string' && lookAndFeel.length > 10000) {
      return NextResponse.json({ error: 'lookAndFeel must be 10000 characters or fewer' }, { status: 400 })
    }

    const contextLookAndFeel = lookAndFeel || category.lookAndFeel || undefined

    let profile

    switch (method) {
      case 'text': {
        const { samples } = body
        if (!samples || !Array.isArray(samples)) {
          return NextResponse.json({ error: 'samples must be an array' }, { status: 400 })
        }
        if (samples.length === 0) {
          return NextResponse.json({ error: 'Provide at least one text sample' }, { status: 400 })
        }
        if (samples.length > 20) {
          return NextResponse.json({ error: 'Maximum 20 samples allowed' }, { status: 400 })
        }
        const tooLong = samples.findIndex((s: any) => typeof s === 'string' && s.length > 2000)
        if (tooLong !== -1) {
          return NextResponse.json({ error: `Sample ${tooLong + 1} exceeds 2000 characters` }, { status: 400 })
        }
        const validSamples = samples.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        if (validSamples.length === 0) {
          return NextResponse.json({ error: 'Provide at least one non-empty text sample' }, { status: 400 })
        }
        console.log(`Extracting brand voice from ${validSamples.length} text samples for: ${category.name}`)
        profile = await extractVoiceFromText(validSamples, contextLookAndFeel)
        break
      }

      case 'guidelines': {
        const brandGuideline = await prisma.brandGuideline.findFirst({
          where: { companyId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: { extractedText: true, name: true },
        })
        let guidelinesText = brandGuideline?.extractedText?.trim()

        // Fall back to category-scoped guideline PDFs (uploaded via Styles tab)
        // These don't have pre-extracted text, so extract on-the-fly
        if (!guidelinesText) {
          const categoryGuideline = await prisma.guideline.findFirst({
            where: { categoryId, companyId },
            orderBy: { createdAt: 'desc' },
            select: { storagePath: true, metadata: true },
          })
          const fileType = (categoryGuideline?.metadata as any)?.file_type
          if (categoryGuideline?.storagePath && fileType === 'application/pdf') {
            try {
              console.log(`Extracting text from category guideline PDF: ${categoryGuideline.storagePath}`)
              const pdfBuffer = await downloadFile(categoryGuideline.storagePath, { provider: 'gcs' })
              const ab = pdfBuffer.buffer.slice(
                pdfBuffer.byteOffset,
                pdfBuffer.byteOffset + pdfBuffer.byteLength
              ) as ArrayBuffer
              const extracted = await extractPdfWithVision(ab) || await extractPdfText(ab)
              if (extracted && extracted.trim().length >= 50) {
                guidelinesText = extracted.trim().substring(0, 20000)
              }
            } catch (pdfErr) {
              console.error('[brand-voice guidelines] category PDF extraction failed:', pdfErr)
            }
          }
        }

        if (!guidelinesText) {
          return NextResponse.json(
            { error: 'No brand guidelines found. Upload a PDF in the Styles tab or add one to your brand library in Settings.' },
            { status: 400 }
          )
        }
        console.log(`Extracting brand voice from guidelines PDF for: ${category.name}`)
        profile = await extractVoiceFromText([guidelinesText], contextLookAndFeel)
        break
      }

      case 'qa': {
        const { answers } = body
        if (!answers || !Array.isArray(answers)) {
          return NextResponse.json({ error: 'answers must be an array' }, { status: 400 })
        }
        if (answers.length > 50) {
          return NextResponse.json({ error: 'Too many answers (max 50)' }, { status: 400 })
        }
        const longQuestion = answers.find((a: any) => typeof a.question === 'string' && a.question.length > 100)
        if (longQuestion) {
          return NextResponse.json({ error: 'Answer questions must be 100 characters or fewer' }, { status: 400 })
        }
        const longAnswer = answers.find((a: any) => typeof a.answer === 'string' && a.answer.length > 1000)
        if (longAnswer) {
          return NextResponse.json({ error: 'Answer values must be 1000 characters or fewer' }, { status: 400 })
        }
        console.log(`Extracting brand voice from Q&A for: ${category.name}`)
        profile = await extractVoiceFromQA(answers, contextLookAndFeel)
        break
      }

      case 'images': {
        const { images } = body
        if (!images || !Array.isArray(images) || images.length === 0) {
          return NextResponse.json({ error: 'Provide at least one image' }, { status: 400 })
        }
        if (images.length > 5) {
          return NextResponse.json({ error: 'Maximum 5 images at once' }, { status: 400 })
        }
        const MAX_IMAGE_B64_CHARS = 4 * 1024 * 1024 // ~3MB decoded
        const oversized = images.find((img: any) => typeof img === 'string' && img.length > MAX_IMAGE_B64_CHARS)
        if (oversized) {
          return NextResponse.json({ error: 'Each image must be under 3MB' }, { status: 400 })
        }
        console.log(`Extracting brand voice from ${images.length} images for: ${category.name}`)
        profile = await extractVoiceFromImages(images, contextLookAndFeel)
        break
      }

      case 'library': {
        const { voiceId } = body
        if (!voiceId) return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })

        const savedVoice = await prisma.brandVoice.findFirst({
          where: { id: voiceId, companyId },
          select: { profile: true },
        })

        if (!savedVoice) return NextResponse.json({ error: 'Brand voice not found in library' }, { status: 404 })
        profile = savedVoice.profile
        console.log(`Applying library brand voice ${voiceId} to: ${category.name}`)
        break
      }

      default:
        return NextResponse.json(
          { error: 'method must be one of: text, qa, images, library' },
          { status: 400 }
        )
    }

    const brandVoiceStr = typeof profile === 'string' ? profile : JSON.stringify(profile)
    const updated = await prisma.category.updateMany({
      where: { id: categoryId, companyId },
      data: { brandVoice: brandVoiceStr },
    })

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Failed to save brand voice profile' }, { status: 500 })
    }

    console.log(`Brand voice saved for: ${category.name} (method: ${method})`)

    return NextResponse.json({
      message: 'Brand voice profile extracted and saved',
      brand_voice: profile,
    })
  } catch (error: any) {
    console.error('Error extracting brand voice:', error)
    if (error?.message?.includes('OPENAI_API_KEY') || error?.message?.includes('GOOGLE_GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'AI service not configured on this server. Contact support.' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — clear brand voice
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

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    await prisma.category.updateMany({
      where: { id: categoryId, companyId },
      data: { brandVoice: null },
    })

    return NextResponse.json({ message: 'Brand voice profile cleared' })
  } catch (error: any) {
    console.error('[brand-voice DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
