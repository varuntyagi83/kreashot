import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { signIn } from '@/auth'

// POST /api/auth/magic — store pending signup then trigger magic link
export async function POST(request: NextRequest) {
  try {
    const { email, companyName, callbackUrl = '/dashboard' } = await request.json()
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    // If company name provided, store it so the signIn event can create the company
    if (companyName && typeof companyName === 'string' && companyName.trim()) {
      await prisma.pendingSignup.upsert({
        where: { email },
        update: { companyName: companyName.trim() },
        create: { email, companyName: companyName.trim() },
      })
    }

    await signIn('resend', { email, redirect: false, redirectTo: callbackUrl })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[auth/magic]', error)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}
