import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ email: null }, { status: 401 })

  // Super-admin status is computed server-side so the super admin's identity is
  // never shipped to the client (no NEXT_PUBLIC_ exposure).
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim()
  const isSuperAdmin = Boolean(superAdminEmail && session.user.email === superAdminEmail)

  return NextResponse.json({ email: session.user.email ?? null, isSuperAdmin })
}
