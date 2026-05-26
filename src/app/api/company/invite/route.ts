import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { Resend } from 'resend'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * POST /api/company/invite
 * Body: { email: string }
 * Sends a login link to the given email so they can join this company.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const membership = await prisma.companyMember.findFirst({
      where: { userId: user.id, companyId },
      select: { role: true },
    })
    if (!membership) {
      return NextResponse.json({ error: 'No company found' }, { status: 403 })
    }
    if (membership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const inviteLimit = await checkRateLimit(`invite:${companyId}`, 20, 60 * 60 * 1000)
    if (!inviteLimit.allowed) {
      return NextResponse.json({ error: 'Too many invites sent. Please wait before sending more.' }, { status: 429 })
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    })

    const { email } = await request.json()
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    // Upsert a pending invite so the user is auto-added to this company on sign-in
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    await prisma.companyInvite.upsert({
      where: { email_companyId: { email, companyId } },
      update: { acceptedAt: null, expiresAt, role: 'member' },
      create: { email, companyId, role: 'member', expiresAt },
    })

    const baseUrl = (getBaseUrl() || new URL(request.url).origin).replace(/\/$/, '')
    const loginUrl = `${baseUrl}/auth/login?company_id=${companyId}`

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: emailError } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@kreashot.com',
      to: email,
      subject: `You've been invited to join ${company?.name || 'Kreashot'}`,
      html: `
        <p>You've been invited to join <strong>${company?.name || 'Kreashot'}</strong> on Kreashot.</p>
        <p>Click the link below to sign in and access the workspace:</p>
        <p><a href="${loginUrl}">${loginUrl}</a></p>
        <p>If you don't have an account yet, you'll be prompted to create one.</p>
      `,
    })

    if (emailError) {
      console.error('[company/invite POST]', emailError)
      return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 })
    }

    return NextResponse.json({ success: true, email })
  } catch (err: any) {
    console.error('[company/invite POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
