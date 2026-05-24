import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/super-admin/users
 * Returns all users with their current company memberships.
 * Restricted to the super-admin account only.
 */
export async function GET() {
  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim()
    if (!superAdminEmail) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.email !== superAdminEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch all users with their company memberships
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        companyMemberships: {
          select: {
            companyId: true,
            role: true,
            company: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    // Fetch all companies for the companion list
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, slug: true },
      take: 500,
    })

    const formattedUsers = users.map((u) => ({
      id: u.id,
      email: u.email ?? '',
      full_name: u.name ?? '',
      created_at: u.createdAt,
      memberships: u.companyMemberships.map((m) => ({
        company_id: m.companyId,
        company_name: m.company.name,
        company_slug: m.company.slug ?? '',
        role: m.role,
      })),
    }))

    return NextResponse.json({ users: formattedUsers, companies })
  } catch (err: any) {
    console.error('[super-admin/users]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
