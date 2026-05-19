import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as 'email' | 'recovery' | 'invite' | null
  const next = requestUrl.searchParams.get('next') ?? '/categories'
  const isRelativePath = next.startsWith('/') && !next.startsWith('//')
  const safeNext = isRelativePath ? next : '/categories'

  const rawInviteCompanyId = requestUrl.searchParams.get('company_id')
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const inviteCompanyId = rawInviteCompanyId && UUID_RE.test(rawInviteCompanyId)
    ? rawInviteCompanyId
    : null

  const supabase = await createServerSupabaseClient()
  let sessionError: unknown = null

  if (tokenHash && type) {
    // Email confirmation / magic link / password recovery flow
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    sessionError = error
  } else if (code) {
    // OAuth PKCE flow
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    sessionError = error
  } else {
    // No recognisable auth params — redirect to error
    const appOrigin = (getBaseUrl() || requestUrl.origin).replace(/\/$/, '')
    return NextResponse.redirect(new URL('/auth/login?error=Could not verify email', appOrigin))
  }

  if (sessionError) {
    console.error('[auth/callback] session error:', sessionError)
    const appOrigin = (getBaseUrl() || requestUrl.origin).replace(/\/$/, '')
    return NextResponse.redirect(new URL('/auth/login?error=Could not verify email', appOrigin))
  }

  // Session established — ensure the user has a company record
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: existingMember } = await supabase
      .from('company_members')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!existingMember) {
      let joinedViaInvite = false

      if (inviteCompanyId) {
        const { data: invitedCompany } = await getSupabaseAdmin()
          .from('companies')
          .select('id')
          .eq('id', inviteCompanyId)
          .single()

        if (invitedCompany) {
          await getSupabaseAdmin().from('company_members').insert({
            company_id: inviteCompanyId,
            user_id: user.id,
            role: 'member',
          })
          joinedViaInvite = true
        } else {
          console.warn(`[auth/callback] invite company_id ${inviteCompanyId} not found — creating new company instead`)
        }
      }

      if (!joinedViaInvite) {
        const displayName = (
          (user.user_metadata?.company_name as string | undefined)?.trim() ||
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          user.email?.split('@')[0] ||
          'My Company'
        ).substring(0, 100)
        const baseSlug = displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
        const slug = `${baseSlug}-${user.id.slice(0, 8)}`

        const { data: company, error: companyErr } = await getSupabaseAdmin()
          .from('companies')
          .insert({ name: displayName, slug })
          .select('id')
          .single()

        if (companyErr || !company) {
          console.error('[auth/callback] company insert failed:', companyErr)
          const appOrigin2 = (getBaseUrl() || requestUrl.origin).replace(/\/$/, '')
          return NextResponse.redirect(new URL('/onboarding', appOrigin2))
        }

        const { error: memberErr } = await getSupabaseAdmin().from('company_members').insert({
          company_id: company.id,
          user_id: user.id,
          role: 'admin',
        })
        if (memberErr) {
          console.error('[auth/callback] member insert failed:', memberErr)
        }
      }
    }
  }

  const appOrigin = (getBaseUrl() || requestUrl.origin).replace(/\/$/, '')
  return NextResponse.redirect(new URL(safeNext, appOrigin))
}
