import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || ''
if (!SUPER_ADMIN_EMAIL) { /* empty env var — all requests will be rejected as Forbidden */ }

/**
 * GET /api/super-admin/users
 * Returns all auth users with their current company memberships.
 * Restricted to the super-admin account only.
 */
export async function GET() {
  try {
    if (!SUPER_ADMIN_EMAIL) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.email !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = getSupabaseAdmin()

    // Fetch all auth users
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (authError) throw authError

    // Fetch all company memberships
    const { data: memberships, error: membError } = await admin
      .from('company_members')
      .select('user_id, company_id, role')
    if (membError) throw membError

    // Fetch all companies for name lookup
    const { data: companies, error: compError } = await admin
      .from('companies')
      .select('id, name, slug')
    if (compError) throw compError

    const companyMap: Record<string, { name: string; slug: string }> = {}
    for (const c of companies || []) companyMap[c.id] = { name: c.name, slug: c.slug }

    const membershipMap: Record<string, { company_id: string; company_name: string; company_slug: string; role: string }[]> = {}
    for (const m of memberships || []) {
      if (!membershipMap[m.user_id]) membershipMap[m.user_id] = []
      membershipMap[m.user_id].push({
        company_id: m.company_id,
        company_name: companyMap[m.company_id]?.name ?? 'Unknown',
        company_slug: companyMap[m.company_id]?.slug ?? '',
        role: m.role,
      })
    }

    const users = (authData?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? '',
      full_name: u.user_metadata?.full_name ?? '',
      created_at: u.created_at,
      memberships: membershipMap[u.id] ?? [],
    }))

    return NextResponse.json({ users, companies: Object.entries(companyMap).map(([id, c]) => ({ id, ...c })) })
  } catch (err: any) {
    console.error('[super-admin/users]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
