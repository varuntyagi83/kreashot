import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ email: null }, { status: 401 })
  return NextResponse.json({ email: session.user.email ?? null })
}
