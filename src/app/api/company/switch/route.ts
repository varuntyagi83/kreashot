import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

const ACTIVE_COMPANY_COOKIE = 'adforge_active_company'

/**
 * POST /api/company/switch
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user } = ctx

    const { companyId } = await request.json()
    if (!companyId || typeof companyId !== 'string') {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId: user.id, companyId },
      select: { companyId: true, role: true },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  } catch (err: any) {
    console.error('[company/switch POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
