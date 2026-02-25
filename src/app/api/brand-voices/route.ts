import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ── GET — list user's saved brand voices ─────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: voices, error } = await supabase
      .from('brand_voices')
      .select('id, name, is_default, profile, created_at, updated_at')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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
    return NextResponse.json({ error: error.message || 'Failed to list brand voices' }, { status: 500 })
  }
}

// ── POST — save a new brand voice ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, profile, is_default } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!profile || typeof profile !== 'object') {
      return NextResponse.json({ error: 'profile is required' }, { status: 400 })
    }

    // If setting as default, clear any existing default first
    if (is_default) {
      await supabase
        .from('brand_voices')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true)
    }

    const { data: voice, error } = await supabase
      .from('brand_voices')
      .insert({
        user_id: user.id,
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ voice }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save brand voice' }, { status: 500 })
  }
}
