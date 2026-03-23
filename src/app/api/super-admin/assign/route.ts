import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN_EMAIL = 'varun.tyagi83@gmail.com'

async function getSuperAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (user.email !== SUPER_ADMIN_EMAIL) return null
  return user
}

/**
 * POST /api/super-admin/assign
 * Assigns (or moves) a user to a company with a given role.
 * Removes them from any other company first, then upserts the new membership.
 */
export async function POST(request: NextRequest) {
  try {
    const requester = await getSuperAdmin()
    if (!requester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, companyId, role } = await request.json()

    if (!userId || !companyId || !role) {
      return NextResponse.json({ error: 'userId, companyId, and role are required' }, { status: 400 })
    }
    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'role must be admin or member' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Verify the target user exists
    const { data: targetUser, error: userError } = await admin.auth.admin.getUserById(userId)
    if (userError || !targetUser?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify the company exists
    const { data: company } = await admin.from('companies').select('id, name').eq('id', companyId).single()
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // Remove user from all other companies first
    await admin.from('company_members').delete().eq('user_id', userId).neq('company_id', companyId)

    // Upsert membership in the target company
    const { error: upsertError } = await admin
      .from('company_members')
      .upsert(
        { user_id: userId, company_id: companyId, role, joined_at: new Date().toISOString() },
        { onConflict: 'user_id,company_id' }
      )

    if (upsertError) {
      console.error('[super-admin/assign POST]', upsertError)
      return NextResponse.json({ error: 'Failed to assign user' }, { status: 500 })
    }

    console.log(`[super-admin] ${requester.email} assigned ${targetUser.user.email} to "${company.name}" as ${role}`)

    return NextResponse.json({
      message: `${targetUser.user.email} assigned to "${company.name}" as ${role}`,
    })
  } catch (err: any) {
    console.error('[super-admin/assign POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/assign
 * Removes a user from a specific company entirely.
 */
export async function DELETE(request: NextRequest) {
  try {
    const requester = await getSuperAdmin()
    if (!requester) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, companyId } = await request.json()
    if (!userId || !companyId) {
      return NextResponse.json({ error: 'userId and companyId are required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    const { error } = await admin
      .from('company_members')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId)

    if (error) {
      console.error('[super-admin/assign DELETE]', error)
      return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
    }

    console.log(`[super-admin] ${requester.email} removed user ${userId} from company ${companyId}`)
    return NextResponse.json({ message: 'User removed from company' })
  } catch (err: any) {
    console.error('[super-admin/assign DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
