import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'

export const dynamic = 'force-dynamic'

// ── GET — list company's saved brand voices ───────────────────────────────────

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { data: voices, error } = await supabase
      .from('brand_voices')
      .select('id, name, is_default, profile, created_at, updated_at')
      .eq('company_id', companyId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[brand-voices GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      voices: (voices || []).map((v) => ({
        id: v.id,
        name: v.name,
        is_default: v.is_default,
        tone_words: v.profile?.tone_words || [],
        personality: v.profile?.personality || '',
        created_at: v.created_at,
        updated_at: v.updated_at,
      })),
    })
  } catch (error: any) {
    console.error('[brand-voices GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST — save a new brand voice ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { name, profile, is_default } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (!profile || typeof profile !== 'object') {
      return NextResponse.json({ error: 'profile is required' }, { status: 400 })
    }
    if (JSON.stringify(profile).length > 65536) {
      return NextResponse.json({ error: 'profile must be 64KB or smaller' }, { status: 400 })
    }

    // If setting as default, clear any existing default first
    if (is_default) {
      await supabase
        .from('brand_voices')
        .update({ is_default: false })
        .eq('company_id', companyId)
        .eq('is_default', true)
    }

    // Check for duplicate name within this company (mirrors the UNIQUE(user_id, name) constraint
    // at the application level, now scoped to company_id)
    const { data: duplicate } = await supabase
      .from('brand_voices')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', name.trim())
      .maybeSingle()

    if (duplicate) {
      return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
    }

    const { data: voice, error } = await supabase
      .from('brand_voices')
      .insert({
        user_id: user.id,
        company_id: companyId,
        name: name.trim(),
        profile,
        is_default: is_default || false,
      })
      .select('id, name, is_default, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
      }
      console.error('[brand-voices POST] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ voice }, { status: 201 })
  } catch (error: any) {
    console.error('[brand-voices POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
