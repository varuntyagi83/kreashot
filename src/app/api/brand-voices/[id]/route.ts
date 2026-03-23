import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'

// ── GET — fetch full brand voice profile ─────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { data: voice, error } = await supabase
      .from('brand_voices')
      .select('id, name, is_default, profile, created_at')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (error || !voice) return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })

    return NextResponse.json({ voice })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined) {
      if (body.name.length > 200) {
        return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
      }
      // Check for duplicate name within this company (mirrors the UNIQUE(user_id, name) constraint
      // at the application level, now scoped to company_id)
      const { data: duplicate } = await supabase
        .from('brand_voices')
        .select('id')
        .eq('company_id', companyId)
        .eq('name', body.name.trim())
        .neq('id', id)
        .maybeSingle()

      if (duplicate) {
        return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
      }
      updateData.name = body.name.trim()
    }

    if (body.is_default === true) {
      // Clear existing default first
      await supabase
        .from('brand_voices')
        .update({ is_default: false })
        .eq('company_id', companyId)
        .eq('is_default', true)
      updateData.is_default = true
    } else if (body.is_default === false) {
      updateData.is_default = false
    }

    const { data: voice, error } = await supabase
      .from('brand_voices')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id, name, is_default, updated_at')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
      }
      console.error('[brand-voices/[id] PUT] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ voice })
  } catch (error: any) {
    console.error('[brand-voices/[id] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { error } = await supabase
      .from('brand_voices')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('[brand-voices/[id] DELETE] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Brand voice deleted' })
  } catch (error: any) {
    console.error('[brand-voices/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
