import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

/**
 * GET /api/company
 * Returns the current user's company info + their role.
 */
export async function GET() {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const membership = await prisma.companyMember.findFirst({
      where: { userId: user.id, companyId },
      select: { companyId: true, role: true, joinedAt: true },
    })
    if (!membership) {
      return NextResponse.json({ error: 'No company found' }, { status: 403 })
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Get all companies this user belongs to
    const allMemberships = await prisma.companyMember.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: { joinedAt: 'asc' },
      take: 200,
    })

    return NextResponse.json({
      company,
      role: membership.role,
      memberships: allMemberships.map((m) => ({
        company_id: m.companyId,
        company_name: m.company.name,
        company_slug: m.company.slug,
        role: m.role,
        joined_at: m.joinedAt,
      })),
    })
  } catch (err: any) {
    console.error('[company GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/company
 * Update company name. Admin only.
 */
export async function PATCH(request: NextRequest) {
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

    const { name } = await request.json()
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data: { name: name.trim() },
    })

    return NextResponse.json({ company })
  } catch (err: any) {
    console.error('[company PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
