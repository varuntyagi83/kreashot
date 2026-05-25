import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import {
  extractVoiceFromText,
  extractVoiceFromQA,
  extractVoiceFromImages,
} from '@/lib/ai/brand-voice'
import { checkRateLimit } from '@/lib/rate-limit'

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

  return NextResponse.json({ brand_voice: category.brandVoice || null })
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
        const guideline = await prisma.brandGuideline.findFirst({
          where: { companyId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: { extractedText: true, name: true },
        })
        const guidelinesText = guideline?.extractedText?.trim()
        if (!guidelinesText) {
          return NextResponse.json(
            { error: 'No brand guidelines found. Upload a guidelines PDF in Styles first.' },
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

    const updated = await prisma.category.updateMany({
      where: { id: categoryId, companyId },
      data: { brandVoice: profile as any },
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
