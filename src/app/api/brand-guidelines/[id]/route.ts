import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ── GET — get single guideline with full text ────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: guideline, error } = await supabase
      .from('brand_guidelines')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ guideline })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to get brand guideline' }, { status: 500 })
  }
}

// ── PUT — update name, toggle is_default ─────────────────────────────────────

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
      await supabase
        .from('brand_guidelines')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true)
      updateData.is_default = true
    } else if (body.is_default === false) {
      updateData.is_default = false
    }

    const { data: guideline, error } = await supabase
      .from('brand_guidelines')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, is_default, updated_at')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A guideline with this name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update asset_references display_name if name changed
    if (body.name !== undefined) {
      await supabase
        .from('asset_references')
        .update({ display_name: body.name.trim() })
        .eq('asset_table_id', id)
        .eq('asset_type', 'guideline')
    }

    return NextResponse.json({ guideline })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update brand guideline' }, { status: 500 })
  }
}

// ── DELETE — remove guideline + asset_references row ─────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Delete asset_references entry first
    await supabase
      .from('asset_references')
      .delete()
      .eq('asset_table_id', id)
      .eq('asset_type', 'guideline')

    // Delete the guideline
    const { error } = await supabase
      .from('brand_guidelines')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Brand guideline deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete brand guideline' }, { status: 500 })
  }
}
