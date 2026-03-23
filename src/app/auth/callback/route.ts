import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/categories'
  // Prevent open redirect: only allow relative paths, not absolute URLs to other domains
  const isRelativePath = next.startsWith('/') && !next.startsWith('//')
  const safeNext = isRelativePath ? next : '/categories'

  // Optional: company invite param — if present, join this company instead of creating a new one.
  // SECURITY NOTE (C-02): This param is not cryptographically signed. The validation below
  // (UUID format + company existence check) is a defence-in-depth partial fix. The full
  // mitigation requires a `company_invites` table with a one-time signed token so the
  // callback can verify the invite has not been forged or reused.
  const rawInviteCompanyId = requestUrl.searchParams.get('company_id')
  // Validate strict UUID format to prevent path-traversal or injection via this param
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const inviteCompanyId = rawInviteCompanyId && UUID_RE.test(rawInviteCompanyId)
    ? rawInviteCompanyId
    : null

  if (code) {
    const supabase = await createServerSupabaseClient()

    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Auto-create or join a company for this user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Check if user already belongs to a company
        const { data: existingMember } = await supabase
          .from('company_members')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!existingMember) {
          let joinedViaInvite = false

          if (inviteCompanyId) {
            // Verify the company actually exists before inserting the membership.
            // This prevents joining a nonexistent or guessed company UUID.
            // TODO (C-02 full fix): replace with a lookup against a `company_invites` table
            // that holds a short-lived one-time signed token keyed to (company_id, email).
            // Use admin client to bypass RLS — the invited user has no membership yet,
            // so the user-session client cannot read the companies table.
            const { data: invitedCompany } = await getSupabaseAdmin()
              .from('companies')
              .select('id')
              .eq('id', inviteCompanyId)
              .single()

            if (invitedCompany) {
              // Join the invited company as a member.
              // Must use admin client — new user has no membership yet, so user-session
              // client is blocked by RLS on company_members.
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
            // Create a new solo company for this user.
            // Must use admin client — new user has no company_members row yet,
            // so the user-session client is blocked by RLS on the companies table.
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
              // Redirect to /onboarding so the user can retry with a valid name
              const appOrigin2 = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/$/, '')
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

      // Successful confirmation - redirect to dashboard.
      // Use NEXT_PUBLIC_APP_URL as base to avoid Railway's internal 0.0.0.0:PORT address.
      const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/$/, '')
      return NextResponse.redirect(new URL(safeNext, appOrigin))
    }
  }

  // If there's an error, redirect to login with error message
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/$/, '')
  return NextResponse.redirect(
    new URL('/auth/login?error=Could not verify email', appOrigin)
  )
}
