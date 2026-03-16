import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyId } from '@/lib/get-company'

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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const { data: guideline, error } = await supabase
      .from('brand_guidelines')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
      }
      console.error('[brand-guidelines/[id] GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ guideline })
  } catch (error: any) {
    console.error('[brand-guidelines/[id] GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined && body.name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (body.name !== undefined) updateData.name = body.name.trim()

    if (body.is_default === true) {
      await supabase
        .from('brand_guidelines')
        .update({ is_default: false })
        .eq('company_id', companyId)
        .eq('is_default', true)
      updateData.is_default = true
    } else if (body.is_default === false) {
      updateData.is_default = false
    }

    const { data: guideline, error } = await supabase
      .from('brand_guidelines')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id, name, is_default, updated_at')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A guideline with this name already exists' }, { status: 409 })
      }
      console.error('[brand-guidelines/[id] PUT] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
    console.error('[brand-guidelines/[id] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

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
      .eq('company_id', companyId)

    if (error) {
      console.error('[brand-guidelines/[id] DELETE] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Brand guideline deleted' })
  } catch (error: any) {
    console.error('[brand-guidelines/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
