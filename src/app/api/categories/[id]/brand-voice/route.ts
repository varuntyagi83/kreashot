import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  extractVoiceFromText,
  extractVoiceFromQA,
  extractVoiceFromImages,
} from '@/lib/ai/brand-voice'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ── GET — return current brand voice profile ──────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { id: categoryId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: category } = await supabase
    .from('categories')
    .select('id, brand_voice')
    .eq('id', categoryId)
    .eq('user_id', user.id)
    .single()

  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  return NextResponse.json({ brand_voice: category.brand_voice || null })
}

// ── POST — extract and save brand voice ───────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimit = checkRateLimit(`brand-voice:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, name, look_and_feel')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const body = await request.json()
    const { method, lookAndFeel } = body
    const contextLookAndFeel = lookAndFeel || category.look_and_feel || undefined

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
        const validSamples = samples
          .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
          .map((s: string) => s.slice(0, 2000))
        if (validSamples.length === 0) {
          return NextResponse.json({ error: 'Provide at least one non-empty text sample' }, { status: 400 })
        }
        console.log(`Extracting brand voice from ${validSamples.length} text samples for: ${category.name}`)
        profile = await extractVoiceFromText(validSamples, contextLookAndFeel)
        break
      }

      case 'qa': {
        const { answers } = body
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
          return NextResponse.json({ error: 'answers must be an object' }, { status: 400 })
        }
        const answerEntries = Object.entries(answers)
        if (answerEntries.length > 50) {
          return NextResponse.json({ error: 'Too many answers (max 50)' }, { status: 400 })
        }
        // Cap each answer value at 1000 chars
        const sanitizedAnswers = Object.fromEntries(
          answerEntries.map(([k, v]) => [String(k).slice(0, 100), String(v || '').slice(0, 1000)])
        )
        console.log(`Extracting brand voice from Q&A for: ${category.name}`)
        profile = await extractVoiceFromQA(sanitizedAnswers, contextLookAndFeel)
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

      default:
        return NextResponse.json(
          { error: 'method must be one of: text, qa, images' },
          { status: 400 }
        )
    }

    // Save to database
    const { error: updateError } = await supabase
      .from('categories')
      .update({ brand_voice: profile })
      .eq('id', categoryId)

    if (updateError) {
      console.error('Failed to save brand voice:', updateError)
      return NextResponse.json({ error: 'Failed to save brand voice profile' }, { status: 500 })
    }

    console.log(`✅ Brand voice saved for: ${category.name} (method: ${method})`)

    return NextResponse.json({
      message: 'Brand voice profile extracted and saved',
      brand_voice: profile,
    })
  } catch (error: any) {
    console.error('Error extracting brand voice:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ── DELETE — clear brand voice ────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    await supabase
      .from('categories')
      .update({ brand_voice: null })
      .eq('id', categoryId)

    return NextResponse.json({ message: 'Brand voice profile cleared' })
  } catch (error: any) {
    console.error('[brand-voice DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
