import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyMembership } from '@/lib/get-company'

/**
 * GET /api/company
 * Returns the current user's company info + their role.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const membership = await getCompanyMembership(supabase, user.id)
    if (!membership) {
      return NextResponse.json({ error: 'No company found' }, { status: 403 })
    }

    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', membership.company_id)
      .single()

    if (error || !company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    return NextResponse.json({ company, role: membership.role })
  } catch (err: any) {
    console.error('[company GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/company
 * Update company name. Admin only.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const membership = await getCompanyMembership(supabase, user.id)
    if (!membership) {
      return NextResponse.json({ error: 'No company found' }, { status: 403 })
    }
    if (membership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { name } = await request.json()
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }

    const { data: company, error } = await supabase
      .from('companies')
      .update({ name: name.trim() })
      .eq('id', membership.company_id)
      .select()
      .single()

    if (error) {
      console.error('[company PATCH]', error)
      return NextResponse.json({ error: 'Failed to update company' }, { status: 500 })
    }

    return NextResponse.json({ company })
  } catch (err: any) {
    console.error('[company PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
