import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { checkRateLimit } from '@/lib/rate-limit'

function generateOtp(): string {
  // CSPRNG — Math.random() is predictable and must never mint auth credentials.
  return crypto.randomInt(100000, 1000000).toString()
}

// POST /api/auth/otp — send a 6-digit code
export async function POST(request: NextRequest) {
  try {
    const { email, companyName } = await request.json()
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    // Rate-limit: max 3 OTP sends per email per 10 minutes, Redis-backed so it
    // persists across deploys and is shared across all Railway instances.
    const sendLimit = await checkRateLimit(`otp-send:${email.toLowerCase()}`, 3, 10 * 60 * 1000)
    if (!sendLimit.allowed) {
      return NextResponse.json({ error: 'Too many codes requested. Please wait a few minutes.' }, { status: 429 })
    }

    const code = generateOtp()
    const codeHash = await bcrypt.hash(code, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await prisma.otpCode.create({
      data: { email, codeHash, companyName: companyName || null, expiresAt },
    })

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: 'Kreashot <hi@corevisionailabs.com>',
      to: email,
      subject: `${code} is your Kreashot code`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8;">
          <img src="https://kreashot.com/kreashot-wordmark-dark.png" alt="Kreashot" height="28" style="margin-bottom: 32px;" />
          <h1 style="font-size: 32px; font-weight: 400; color: #1A1208; margin: 0 0 16px;">Your sign-in code</h1>
          <p style="color: #5C5245; font-size: 14px; margin: 0 0 32px;">Enter this code to sign in to Kreashot. It expires in 10 minutes.</p>
          <div style="background: #1A1208; border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 32px;">
            <span style="font-size: 40px; font-weight: 700; color: #C9922A; letter-spacing: 0.2em;">${code}</span>
          </div>
          <p style="color: #7A6E62; font-size: 12px;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[otp/send]', error)
    return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
  }
}
