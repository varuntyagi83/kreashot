import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export type SessionUser = {
  id: string
  email: string
  name?: string | null
}

export type SessionContext = {
  user: SessionUser
  companyId: string
}

/**
 * Returns the authenticated user + their active company, or a 401 NextResponse.
 * Use in every API route handler:
 *
 *   const ctx = await requireSession()
 *   if (ctx instanceof NextResponse) return ctx
 */
export async function requireSession(): Promise<SessionContext | NextResponse> {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const member = await prisma.companyMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { joinedAt: 'asc' },
    select: { companyId: true },
  })

  if (!member) {
    return NextResponse.json({ error: 'No company found' }, { status: 403 })
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    companyId: member.companyId,
  }
}
