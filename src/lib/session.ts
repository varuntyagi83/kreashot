import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const ACTIVE_COMPANY_COOKIE = 'kreashot_active_company'

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
 * Respects the kreashot_active_company cookie set by /api/company/switch.
 */
export async function requireSession(): Promise<SessionContext | NextResponse> {
  const session = await auth()

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value

  let companyId: string | null = null

  if (activeCompanyId) {
    const member = await prisma.companyMember.findFirst({
      where: { userId, companyId: activeCompanyId },
      select: { companyId: true },
    })
    if (member) companyId = member.companyId
  }

  if (!companyId) {
    const member = await prisma.companyMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      select: { companyId: true },
    })
    if (member) companyId = member.companyId
  }

  if (!companyId) {
    return NextResponse.json({ error: 'No company found' }, { status: 403 })
  }

  return {
    user: {
      id: userId,
      email: session.user.email,
      name: session.user.name,
    },
    companyId,
  }
}
