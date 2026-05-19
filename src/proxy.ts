import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/auth')
  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isCleanupApiRoute = pathname.startsWith('/api/cleanup')
  const isLandingPage = pathname === '/'

  // Admin and cleanup routes bypass session auth because Railway cron jobs have no cookies.
  // They are protected by a CRON_SECRET bearer token checked inside each route handler.
  // Guard here: if CRON_SECRET is missing or shorter than 32 chars, reject all admin calls
  // so a misconfigured deployment never exposes destructive operations.
  if (isAdminApiRoute || isCleanupApiRoute) {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || cronSecret.length < 32) {
      return NextResponse.json(
        { error: 'Admin routes disabled: CRON_SECRET not configured' },
        { status: 503 }
      )
    }
    const authHeader = request.headers.get('authorization')
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // Use NEXT_PUBLIC_APP_URL as base to avoid Railway's internal 0.0.0.0:PORT address
  // leaking into redirect Location headers sent to the browser.
  const appOrigin = (getBaseUrl() || request.nextUrl.origin).replace(/\/$/, '')

  // Authenticated users hitting the landing page go straight to the dashboard
  if (user && isLandingPage) {
    return NextResponse.redirect(new URL('/dashboard', appOrigin))
  }

  // Redirect to login if user is not authenticated and trying to access protected routes.
  if (!user && !isAuthRoute && !isLandingPage) {
    return NextResponse.redirect(new URL('/auth/login', appOrigin))
  }

  // Redirect to dashboard if user is authenticated and trying to access auth routes
  if (user && isAuthRoute && !pathname.includes('/callback')) {
    return NextResponse.redirect(new URL('/dashboard', appOrigin))
  }

  return response
}

export const config = {
  matcher: [
    // Exclude static assets, images, and the health check endpoint (used by Railway)
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
