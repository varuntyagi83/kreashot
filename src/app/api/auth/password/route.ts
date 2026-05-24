import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { checkRateLimit } from '@/lib/rate-limit'

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://kreashot.com'
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// POST /api/auth/password?action=register|forgot|reset
export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action')

  try {
    if (action === 'register') {
      const { email, password, companyName } = await request.json()
      if (!email || !password || !companyName) {
        return NextResponse.json({ error: 'Email, password, and company name are required' }, { status: 400 })
      }
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }

      // Throttle account creation per IP to prevent registration spam.
      const regLimit = await checkRateLimit(`register:${clientIp(request)}`, 10, 60 * 60 * 1000)
      if (!regLimit.allowed) {
        return NextResponse.json({ error: 'Too many sign-up attempts. Please try again later.' }, { status: 429 })
      }

      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing?.passwordHash) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }

      const passwordHash = await bcrypt.hash(password, 12)

      const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash },
        create: { email, passwordHash },
      })

      // Create company only if user has none
      const hasMembership = await prisma.companyMember.findFirst({ where: { userId: user.id } })
      if (!hasMembership) {
        const baseSlug = slugify(companyName) || 'company'
        const slug = `${baseSlug}-${Date.now()}`
        const company = await prisma.company.create({ data: { name: companyName, slug } })
        await prisma.companyMember.create({ data: { companyId: company.id, userId: user.id, role: 'admin' } })
      }

      // Generate verification token
      const verifyToken = crypto.randomBytes(32).toString('hex')
      const verifyTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex')
      const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      // Invalidate old verification tokens for this email
      await prisma.emailVerificationToken.updateMany({
        where: { email, usedAt: null },
        data: { usedAt: new Date() },
      })

      await prisma.emailVerificationToken.create({
        data: { email, tokenHash: verifyTokenHash, expiresAt: verifyExpiresAt },
      })

      const verifyUrl = `${getBaseUrl()}/auth/verify-email?token=${verifyToken}`
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Kreashot <hi@corevisionailabs.com>',
        to: email,
        subject: 'Verify your Kreashot email',
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8;">
            <img src="https://kreashot.com/kreashot-wordmark-dark.png" alt="Kreashot" height="28" style="margin-bottom: 32px;" />
            <h1 style="font-size: 28px; font-weight: 400; color: #1A1208; margin: 0 0 16px;">Verify your email</h1>
            <p style="color: #5C5245; font-size: 14px; margin: 0 0 32px;">Click the button below to verify your email and activate your account. This link expires in 24 hours.</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #B85C38; color: #F5F0E8; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">Verify email</a>
            <p style="color: #7A6E62; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
          </div>
        `,
      })

      return NextResponse.json({ success: true, requiresVerification: true })
    }

    if (action === 'forgot') {
      const { email } = await request.json()
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

      // Throttle reset emails per email + IP to prevent inbox bombing. Still
      // returns generic success below to avoid leaking which path was throttled.
      const fLimit = await checkRateLimit(`forgot:${String(email).toLowerCase()}`, 3, 15 * 60 * 1000)
      const fIpLimit = await checkRateLimit(`forgot-ip:${clientIp(request)}`, 15, 15 * 60 * 1000)
      if (!fLimit.allowed || !fIpLimit.allowed) {
        return NextResponse.json({ success: true })
      }

      const user = await prisma.user.findUnique({ where: { email } })
      // Always return success to prevent email enumeration
      if (!user?.passwordHash) {
        return NextResponse.json({ success: true })
      }

      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Invalidate existing tokens for this email
      await prisma.passwordResetToken.updateMany({
        where: { email, usedAt: null },
        data: { usedAt: new Date() },
      })

      await prisma.passwordResetToken.create({ data: { email, tokenHash, expiresAt } })

      const resetUrl = `${getBaseUrl()}/auth/reset-password?token=${token}`

      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Kreashot <hi@corevisionailabs.com>',
        to: email,
        subject: 'Reset your Kreashot password',
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8;">
            <img src="https://kreashot.com/kreashot-wordmark-dark.png" alt="Kreashot" height="28" style="margin-bottom: 32px;" />
            <h1 style="font-size: 28px; font-weight: 400; color: #1A1208; margin: 0 0 16px;">Reset your password</h1>
            <p style="color: #5C5245; font-size: 14px; margin: 0 0 32px;">Click the button below to set a new password. This link expires in 1 hour.</p>
            <a href="${resetUrl}" style="display: inline-block; background: #B85C38; color: #F5F0E8; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">Reset password</a>
            <p style="color: #7A6E62; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'reset') {
      const { token, password } = await request.json()
      if (!token || !password) {
        return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
      }
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const record = await prisma.passwordResetToken.findFirst({
        where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      })
      if (!record) {
        return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
      }

      const passwordHash = await bcrypt.hash(password, 12)
      await prisma.user.update({ where: { email: record.email }, data: { passwordHash } })
      await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })

      return NextResponse.json({ success: true })
    }

    if (action === 'resend-verification') {
      const { email } = await request.json()
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

      const rvLimit = await checkRateLimit(`resend-verify:${String(email).toLowerCase()}`, 3, 15 * 60 * 1000)
      if (!rvLimit.allowed) return NextResponse.json({ success: true }) // silent throttle

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user || user.emailVerified) return NextResponse.json({ success: true }) // silent

      const verifyToken = crypto.randomBytes(32).toString('hex')
      const verifyTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex')
      const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

      await prisma.emailVerificationToken.updateMany({
        where: { email, usedAt: null },
        data: { usedAt: new Date() },
      })
      await prisma.emailVerificationToken.create({
        data: { email, tokenHash: verifyTokenHash, expiresAt: verifyExpiresAt },
      })

      const verifyUrl = `${getBaseUrl()}/auth/verify-email?token=${verifyToken}`
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Kreashot <hi@corevisionailabs.com>',
        to: email,
        subject: 'Verify your Kreashot email',
        html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8;">
          <img src="https://kreashot.com/kreashot-wordmark-dark.png" alt="Kreashot" height="28" style="margin-bottom: 32px;" />
          <h1 style="font-size: 28px; font-weight: 400; color: #1A1208; margin: 0 0 16px;">Verify your email</h1>
          <p style="color: #5C5245; font-size: 14px; margin: 0 0 32px;">Click the button below to verify your email. This link expires in 24 hours.</p>
          <a href="${verifyUrl}" style="display: inline-block; background: #B85C38; color: #F5F0E8; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 32px;">Verify email</a>
        </div>`,
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: unknown) {
    console.error('[auth/password]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
