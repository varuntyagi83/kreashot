import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/categories'
  // Prevent open redirect: only allow relative paths, not absolute URLs to other domains
  const isRelativePath = next.startsWith('/') && !next.startsWith('//')
  const safeNext = isRelativePath ? next : '/categories'

  if (code) {
    const supabase = await createServerSupabaseClient()

    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Successful confirmation - redirect to dashboard
      return NextResponse.redirect(new URL(safeNext, request.url))
    }
  }

  // If there's an error, redirect to login with error message
  return NextResponse.redirect(
    new URL('/auth/login?error=Could not verify email', request.url)
  )
}
