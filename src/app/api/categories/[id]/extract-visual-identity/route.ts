import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeForPrompt } from '@/lib/ai/sanitize'

export const dynamic = 'force-dynamic'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/**
 * POST /api/categories/[id]/extract-visual-identity
 * Upload up to 5 brand images; Gemini analyses them and returns a structured
 * visual identity profile. The look_and_feel field is saved to the category.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`visual-identity:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 })
    }

    const { data: category } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const body = await request.json()
    const { images } = body

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: 'Provide at least one image' }, { status: 400 })
    }
    if (images.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 images allowed' }, { status: 400 })
    }

    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
    if (!GEMINI_API_KEY) throw new Error('GOOGLE_GEMINI_API_KEY is not set')

    // Build Gemini content parts: images first, then the prompt
    const parts: any[] = images.map((img: { base64: string; mimeType: string }) => ({
      inline_data: {
        data: img.base64.replace(/^data:image\/\w+;base64,/, ''),
        mime_type: img.mimeType,
      },
    }))

    parts.push({
      text: `You are a senior brand designer analysing brand images. Study these images carefully — look at the visual aesthetic, colour palette, typography, photography style, mood, and overall design principles.

Return ONLY a valid JSON object (no markdown, no explanation) with this exact shape:
{
  "look_and_feel": "A single rich paragraph (50–80 words) describing the visual aesthetic and mood — written as an AI image generation prompt. Be specific: name the lighting style, colour temperature, textures, settings, and mood. E.g. 'Warm natural light. Earthy tones — sand, terracotta, warm white. Minimal props. Lifestyle scenes in clean domestic spaces. Premium but approachable. Soft bokeh backgrounds.'",
  "color_palette": "Natural language description of the colour palette: primary, accent, and background tones. Describe each as a word (e.g. warm white, deep navy, terracotta) rather than hex codes.",
  "typography_style": "Describe the typographic style: weight (light/medium/bold), classification (serif/sans-serif), character (geometric/humanist/editorial), typical usage (large headlines, body copy, captions).",
  "photography_style": "Describe the photographic style: lighting setup, composition approach, model or product focus, backgrounds, props, and overall feel.",
  "visual_mood": ["adjective1", "adjective2", "adjective3", "adjective4"],
  "design_principles": "Key design principles: use of white space, layout density, hierarchy approach, minimalism vs richness."
}

Rules:
- look_and_feel must be vivid and specific — it is used verbatim as an AI image generation prompt
- Be opinionated and precise, not vague
- Base everything strictly on what you observe in the images`,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Gemini API error: ${response.status} — ${err}`)
    }

    const geminiData = await response.json()
    let text: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

    // Gemini sometimes wraps the JSON in markdown code fences despite responseMimeType
    text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    // Extract JSON object if there's surrounding text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) text = jsonMatch[0]

    let profile: any
    try {
      profile = JSON.parse(text)
    } catch {
      console.error('[extract-visual-identity] raw Gemini text:', text)
      throw new Error('Visual identity extraction returned invalid JSON. Please try again.')
    }

    // Save look_and_feel to the category
    const sanitizedLookAndFeel = sanitizeForPrompt(profile.look_and_feel || '')
    if (sanitizedLookAndFeel) {
      await supabase
        .from('categories')
        .update({ look_and_feel: sanitizedLookAndFeel })
        .eq('id', categoryId)
        .eq('company_id', companyId)
    }

    console.log(`✅ Visual identity extracted for category: ${category.name}`)

    return NextResponse.json({ visual_identity: profile })
  } catch (error: any) {
    console.error('[extract-visual-identity] error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
