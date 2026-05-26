import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/auth')
  const isAdminApiRoute = pathname.startsWith('/api/admin')
  const isCleanupApiRoute = pathname.startsWith('/api/cleanup')
  const isLandingPage = pathname === '/'

  // Admin and cleanup routes are protected by CRON_SECRET bearer token
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
    return NextResponse.next()
  }

  // Auth.js API routes must pass through unmodified
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const session = await auth()
  const user = session?.user
  const appOrigin = (getBaseUrl() || request.nextUrl.origin).replace(/\/$/, '')

  // Authenticated users hitting the landing page go straight to the dashboard
  if (user && isLandingPage) {
    return NextResponse.redirect(new URL('/dashboard', appOrigin))
  }

  // Redirect to login if unauthenticated and trying to access protected routes.
  // API routes get a 401 JSON response instead of an HTML redirect.
  if (!user && !isAuthRoute && !isLandingPage) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/auth/login', appOrigin))
  }

  // Redirect to dashboard if authenticated and hitting an auth page
  if (user && isAuthRoute && pathname !== '/auth/verify' && pathname !== '/auth/verify-email') {
    return NextResponse.redirect(new URL('/dashboard', appOrigin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
