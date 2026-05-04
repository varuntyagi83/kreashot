import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function middleware(request: NextRequest) {
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

  // Use NEXT_PUBLIC_APP_URL as base to avoid Railway's internal 0.0.0.0:PORT address
  // leaking into redirect Location headers sent to the browser.
  const appOrigin = (getBaseUrl() || request.nextUrl.origin).replace(/\/$/, '')

  // Authenticated users hitting the landing page go straight to the dashboard
  if (user && isLandingPage) {
    return NextResponse.redirect(new URL('/dashboard', appOrigin))
  }

  // Redirect to login if user is not authenticated and trying to access protected routes.
  // Landing page, auth routes, and API admin/cleanup routes are public.
  if (!user && !isAuthRoute && !isAdminApiRoute && !isCleanupApiRoute && !isLandingPage) {
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
