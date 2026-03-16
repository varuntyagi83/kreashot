import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyMembership } from '@/lib/get-company'

/**
 * GET /api/company/members
 * List all members of the current user's company.
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

    const { data: members, error } = await supabase
      .from('company_members')
      .select('id, user_id, role, joined_at')
      .eq('company_id', membership.company_id)
      .order('joined_at', { ascending: true })

    if (error) {
      console.error('[company/members GET]', error)
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
    }

    // Fetch user emails + metadata from auth.users via admin API
    const userIds = (members || []).map((m) => m.user_id)
    const { data: usersData } = await supabase.auth.admin.listUsers()
    const usersMap: Record<string, { email: string; full_name?: string }> = {}
    for (const u of usersData?.users ?? []) {
      if (userIds.includes(u.id)) {
        usersMap[u.id] = {
          email: u.email ?? '',
          full_name: u.user_metadata?.full_name as string | undefined,
        }
      }
    }

    const enriched = (members || []).map((m) => ({
      ...m,
      email: usersMap[m.user_id]?.email ?? '',
      full_name: usersMap[m.user_id]?.full_name ?? '',
      is_current_user: m.user_id === user.id,
    }))

    return NextResponse.json({ members: enriched, current_role: membership.role })
  } catch (err: any) {
    console.error('[company/members GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/company/members?userId=...
 * Remove a member. Admin only (except users can remove themselves).
 */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')
    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Allow: admin can remove anyone, or user can remove themselves
    const isSelf = targetUserId === user.id
    if (!isSelf && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { error } = await supabase
      .from('company_members')
      .delete()
      .eq('company_id', membership.company_id)
      .eq('user_id', targetUserId)

    if (error) {
      console.error('[company/members DELETE]', error)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[company/members DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
