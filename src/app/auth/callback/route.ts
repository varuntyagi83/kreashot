import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/categories'
  // Prevent open redirect: only allow relative paths, not absolute URLs to other domains
  const isRelativePath = next.startsWith('/') && !next.startsWith('//')
  const safeNext = isRelativePath ? next : '/categories'

  // Optional: company invite param — if present, join this company instead of creating a new one
  const inviteCompanyId = requestUrl.searchParams.get('company_id')

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
          if (inviteCompanyId) {
            // Join the invited company as a member
            await supabase.from('company_members').insert({
              company_id: inviteCompanyId,
              user_id: user.id,
              role: 'member',
            })
          } else {
            // Create a new solo company for this user
            const displayName =
              (user.user_metadata?.full_name as string | undefined)?.trim() ||
              user.email?.split('@')[0] ||
              'My Company'
            const baseSlug = displayName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
            const slug = `${baseSlug}-${user.id.slice(0, 8)}`

            const { data: company } = await supabase
              .from('companies')
              .insert({ name: displayName, slug })
              .select('id')
              .single()

            if (company) {
              await supabase.from('company_members').insert({
                company_id: company.id,
                user_id: user.id,
                role: 'admin',
              })
            }
          }
        }
      }

      // Successful confirmation - redirect to dashboard
      return NextResponse.redirect(new URL(safeNext, request.url))
    }
  }

  // If there's an error, redirect to login with error message
  return NextResponse.redirect(
    new URL('/auth/login?error=Could not verify email', request.url)
  )
}
