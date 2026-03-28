import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getCompanyMembership } from '@/lib/get-company'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

/**
 * POST /api/company/invite
 * Body: { email: string }
 * Sends a magic-link invite to the given email.
 * The invite link includes ?company_id= so the auth callback
 * joins this company instead of creating a new one.
 * Admin only.
 */
export async function POST(request: NextRequest) {
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

    const { email } = await request.json()
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    // Build the redirect URL that includes company_id as a param
    // The auth/callback route reads this and joins the company
    const baseUrl = (getBaseUrl() || new URL(request.url).origin).replace(/\/$/, '')
    const redirectTo = `${baseUrl}/auth/callback?company_id=${membership.company_id}&next=/categories`

    // Send magic-link invite via Supabase Auth admin API.
    // Uses service-role client (supabaseAdmin) — auth.admin requires service role key, not anon key.
    const { error: inviteError } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (inviteError) {
      // Log full error server-side; return a generic message to the client (Security Invariant #10:
      // do not leak internal error messages or stack traces in API responses).
      console.error('[company/invite POST]', inviteError)
      return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 })
    }

    return NextResponse.json({ success: true, email })
  } catch (err: any) {
    console.error('[company/invite POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
