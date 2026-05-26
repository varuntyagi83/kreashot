import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid-token', request.url))
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  // Atomically claim the token — only one concurrent request gets count === 1.
  // This closes the TOCTOU window where two requests both see usedAt: null.
  const claimed = await prisma.emailVerificationToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  })

  if (claimed.count === 0) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid-token', request.url))
  }

  // Fetch the record to get the email — safe because we already own the token
  const record = await prisma.emailVerificationToken.findFirst({ where: { tokenHash } })
  if (!record) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid-token', request.url))
  }

  await prisma.user.update({
    where: { email: record.email },
    data: { emailVerified: new Date() },
  })

  return NextResponse.redirect(new URL('/auth/login?verified=1', request.url))
}
