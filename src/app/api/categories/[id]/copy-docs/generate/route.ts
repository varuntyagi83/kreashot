import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { generateCopyVariations, generateCopyKit, CopyType } from '@/lib/ai/openai'
import { sanitizeForPrompt } from '@/lib/ai/sanitize'

const VALID_COPY_TYPES: CopyType[] = ['hook', 'cta', 'body', 'tagline', 'headline']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId } = await params

    const rateLimit = await checkRateLimit(`copy-docs:${user.id}`, 20, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const planCheck = await checkPlanLimit(companyId, 'copy_doc', 1)
    if (!planCheck.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached for your plan (${planCheck.used}/${planCheck.limit} copy generations today). Upgrade to generate more.` },
        { status: 402 }
      )
    }

    const [category, brandGuideline] = await Promise.all([
      prisma.category.findFirst({
        where: { id: categoryId, companyId },
        select: { id: true, name: true, slug: true, lookAndFeel: true, brandVoice: true },
      }),
      prisma.brandGuideline.findFirst({
        where: { companyId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        select: { extractedText: true },
      }),
    ])

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const { brief, mode = 'single' } = body

    if (!brief || brief.trim().length === 0) {
      return NextResponse.json({ error: 'brief is required' }, { status: 400 })
    }

    const MAX_BRIEF_LENGTH = 2000
    if (brief && brief.length > MAX_BRIEF_LENGTH) {
      return NextResponse.json({ error: `Brief must be under ${MAX_BRIEF_LENGTH} characters` }, { status: 400 })
    }

    const safeBrief = brief ? sanitizeForPrompt(brief) : brief
    const safeLookAndFeel = sanitizeForPrompt(category.lookAndFeel || '')
    const safeBrandGuidelines = brandGuideline?.extractedText
      ? sanitizeForPrompt(brandGuideline.extractedText)
      : undefined

    // Resolve brand voice (library voice overrides category voice)
    let brandVoice: any = category.brandVoice || undefined
    if (body.brandVoiceId) {
      const voice = await prisma.brandVoice.findFirst({
        where: { id: body.brandVoiceId, companyId },
        select: { profile: true },
      })
      if (voice) brandVoice = voice.profile as string
    }

    // KIT MODE: multiple types x multiple tones
    if (mode === 'kit') {
      const { copyTypes, tones, targetAudience } = body

      if (!copyTypes || !Array.isArray(copyTypes) || copyTypes.length === 0) {
        return NextResponse.json({ error: 'copyTypes array is required for kit mode' }, { status: 400 })
      }
      if (copyTypes.length > 10) {
        return NextResponse.json({ error: 'copyTypes array cannot exceed 10 items' }, { status: 400 })
      }
      if (!tones || !Array.isArray(tones) || tones.length === 0) {
        return NextResponse.json({ error: 'tones array is required for kit mode' }, { status: 400 })
      }

      const invalidTypes = copyTypes.filter((t: string) => !VALID_COPY_TYPES.includes(t as CopyType))
      if (invalidTypes.length > 0) {
        return NextResponse.json({ error: `Invalid copy types: ${invalidTypes.join(', ')}` }, { status: 400 })
      }

      const totalCombinations = copyTypes.length * tones.length
      if (totalCombinations > 50) {
        return NextResponse.json({ error: 'Max 50 combinations at once' }, { status: 400 })
      }

      console.log(`Generating copy kit: ${copyTypes.length} types x ${tones.length} tones = ${totalCombinations} for ${category.slug}`)

      const results = await generateCopyKit(
        safeBrief,
        copyTypes as CopyType[],
        tones,
        safeLookAndFeel,
        targetAudience,
        safeBrandGuidelines,
        brandVoice
      )

      return NextResponse.json({
        mode: 'kit',
        message: `Generated ${results.length} copy combinations`,
        category: { id: category.id, name: category.name, slug: category.slug },
        results: results.map((r) => ({
          copy_type: r.copyType,
          tone: r.tone,
          prompt_used: r.promptUsed,
          generated_text: r.generatedText,
        })),
      })
    }

    // SINGLE MODE: one type, one tone, N variations
    const { copyType = 'hook', count = 1, tone, targetAudience } = body

    if (tone && tone.length > 500) {
      return NextResponse.json({ error: 'tone must be 500 characters or fewer' }, { status: 400 })
    }
    if (targetAudience && targetAudience.length > 500) {
      return NextResponse.json({ error: 'targetAudience must be 500 characters or fewer' }, { status: 400 })
    }

    const countNum = typeof count === 'number' ? count : parseInt(String(count), 10)
    if (!Number.isFinite(countNum) || countNum < 1 || countNum > 5) {
      return NextResponse.json({ error: 'count must be an integer between 1 and 5' }, { status: 400 })
    }
    if (!VALID_COPY_TYPES.includes(copyType as CopyType)) {
      return NextResponse.json(
        { error: `copyType must be one of: ${VALID_COPY_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    console.log(`Generating ${countNum} ${copyType} variations for category: ${category.slug}`)

    const results = await generateCopyVariations(
      safeBrief,
      copyType as CopyType,
      safeLookAndFeel,
      countNum,
      tone,
      targetAudience,
      safeBrandGuidelines,
      brandVoice
    )

    return NextResponse.json({
      mode: 'single',
      message: `Generated ${results.length} copy variations`,
      category: { id: category.id, name: category.name, slug: category.slug },
      results: results.map((r) => ({
        copy_type: copyType,
        tone: tone || null,
        prompt_used: r.promptUsed,
        generated_text: r.generatedText,
      })),
    })
  } catch (error: any) {
    console.error('[copy-docs/generate]', error)
    // Keep internal error detail server-side; return a generic, non-leaky message.
    return NextResponse.json(
      { error: 'Copy generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
