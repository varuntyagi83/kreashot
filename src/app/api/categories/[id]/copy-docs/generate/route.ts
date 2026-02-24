import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateCopyVariations, generateCopyKit, CopyType } from '@/lib/ai/openai'

const VALID_COPY_TYPES: CopyType[] = ['hook', 'cta', 'body', 'tagline', 'headline']

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

    // Fetch category including all brand context fields
    const { data: category } = await supabase
      .from('categories')
      .select('id, name, slug, look_and_feel, brand_guidelines, brand_voice')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const { brief, mode = 'single' } = body

    if (!brief || brief.trim().length === 0) {
      return NextResponse.json({ error: 'brief is required' }, { status: 400 })
    }

    // ── KIT MODE: multiple types × multiple tones ──────────────────────────
    if (mode === 'kit') {
      const { copyTypes, tones, targetAudience } = body

      if (!copyTypes || !Array.isArray(copyTypes) || copyTypes.length === 0) {
        return NextResponse.json({ error: 'copyTypes array is required for kit mode' }, { status: 400 })
      }
      if (!tones || !Array.isArray(tones) || tones.length === 0) {
        return NextResponse.json({ error: 'tones array is required for kit mode' }, { status: 400 })
      }

      const invalidTypes = copyTypes.filter((t: string) => !VALID_COPY_TYPES.includes(t as CopyType))
      if (invalidTypes.length > 0) {
        return NextResponse.json({ error: `Invalid copy types: ${invalidTypes.join(', ')}` }, { status: 400 })
      }

      const totalCombinations = copyTypes.length * tones.length
      if (totalCombinations > 25) {
        return NextResponse.json({ error: 'Max 25 combinations at once (e.g. 5 types × 5 tones)' }, { status: 400 })
      }

      console.log(`Generating copy kit: ${copyTypes.length} types × ${tones.length} tones = ${totalCombinations} for ${category.slug}`)

      const results = await generateCopyKit(
        brief,
        copyTypes as CopyType[],
        tones,
        category.look_and_feel || '',
        targetAudience,
        category.brand_guidelines || undefined,
        category.brand_voice || undefined
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

    // ── SINGLE MODE: one type, one tone, N variations (backwards compatible) ─
    const { copyType = 'hook', count = 1, tone, targetAudience } = body

    if (count < 1 || count > 5) {
      return NextResponse.json({ error: 'count must be between 1 and 5' }, { status: 400 })
    }
    if (!VALID_COPY_TYPES.includes(copyType as CopyType)) {
      return NextResponse.json(
        { error: `copyType must be one of: ${VALID_COPY_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    console.log(`Generating ${count} ${copyType} variations for category: ${category.slug}`)

    const results = await generateCopyVariations(
      brief,
      copyType as CopyType,
      category.look_and_feel || '',
      count,
      tone,
      targetAudience,
      category.brand_guidelines || undefined,
      category.brand_voice || undefined
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
    console.error('Error generating copy:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
