import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'

// POST /api/auth/magic — store company name for pending signup only.
// The client calls signIn('resend', ...) directly via next-auth/react after this returns.
export async function POST(request: NextRequest) {
  try {
    const { email, companyName } = await request.json()
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const limit = await checkRateLimit(`magic-signup:${email.toLowerCase()}`, 5, 15 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a few minutes.' }, { status: 429 })
    }

    if (companyName && typeof companyName === 'string' && companyName.trim()) {
      await prisma.pendingSignup.upsert({
        where: { email },
        update: { companyName: companyName.trim() },
        create: { email, companyName: companyName.trim() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[auth/magic]', error)
    return NextResponse.json({ error: 'Failed to store signup data' }, { status: 500 })
  }
}
