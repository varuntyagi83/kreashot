import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ACTIVE_COMPANY_COOKIE } from '@/lib/get-company'

/**
 * POST /api/company/switch
 * Sets the active company cookie for users who belong to multiple companies.
 * Validates the user is actually a member of the requested company.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { companyId } = await request.json()
    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    // Verify user is actually a member of the requested company
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', user.id)
      .eq('company_id', companyId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
    return response
  } catch (err: any) {
    console.error('[company/switch POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
