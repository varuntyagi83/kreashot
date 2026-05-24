import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid-token', request.url))
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  })

  if (!record) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid-token', request.url))
  }

  await prisma.user.update({
    where: { email: record.email },
    data: { emailVerified: new Date() },
  })
  await prisma.emailVerificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  })

  return NextResponse.redirect(new URL('/auth/login?verified=1', request.url))
}
