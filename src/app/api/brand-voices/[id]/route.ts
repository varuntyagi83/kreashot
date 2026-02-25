import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ── PUT — update a brand voice (rename / set default) ────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined) updateData.name = body.name.trim()

    if (body.is_default === true) {
      // Clear existing default first
      await supabase
        .from('brand_voices')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true)
      updateData.is_default = true
    } else if (body.is_default === false) {
      updateData.is_default = false
    }

    const { data: voice, error } = await supabase
      .from('brand_voices')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, is_default, updated_at')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ voice })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update brand voice' }, { status: 500 })
  }
}

// ── DELETE — remove a brand voice ────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('brand_voices')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Brand voice deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete brand voice' }, { status: 500 })
  }
}
