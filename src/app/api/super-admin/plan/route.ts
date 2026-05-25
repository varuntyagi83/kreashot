import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const VALID_PLANS = ['free', 'pro', 'scale']

async function requireSuperAdmin(): Promise<string | null> {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim()
  if (!superAdminEmail) {
    console.error('[super-admin] SUPER_ADMIN_EMAIL is not configured — all super-admin routes are inaccessible')
    return null
  }
  const session = await auth()
  if (!session?.user?.email) return null
  if (session.user.email !== superAdminEmail) return null
  return session.user.email
}

/**
 * PATCH /api/super-admin/plan
 * Updates the plan for a company.
 */
export async function PATCH(request: NextRequest) {
  try {
    const requesterEmail = await requireSuperAdmin()
    if (!requesterEmail) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { companyId, plan } = await request.json()
    if (!companyId || !plan) {
      return NextResponse.json({ error: 'companyId and plan are required' }, { status: 400 })
    }
    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: `plan must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 }
      )
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    await prisma.company.update({ where: { id: companyId }, data: { plan } })

    console.log(`[super-admin] ${requesterEmail} set "${company.name}" plan to ${plan}`)
    return NextResponse.json({ message: `"${company.name}" plan updated to ${plan}` })
  } catch (err: any) {
    console.error('[super-admin/plan PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
