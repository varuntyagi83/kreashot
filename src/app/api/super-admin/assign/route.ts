import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

async function getSuperAdminEmail(): Promise<string | null> {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim()
  if (!superAdminEmail) return null
  const session = await auth()
  if (!session?.user?.id) return null
  if (session.user.email !== superAdminEmail) return null
  return session.user.email
}

/**
 * POST /api/super-admin/assign
 * Assigns (or moves) a user to a company with a given role.
 * Preserves any other company memberships (upsert for the specific company only).
 */
export async function POST(request: NextRequest) {
  try {
    const requesterEmail = await getSuperAdminEmail()
    if (!requesterEmail) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, companyId, role } = await request.json()

    if (!userId || !companyId || !role) {
      return NextResponse.json({ error: 'userId, companyId, and role are required' }, { status: 400 })
    }
    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'role must be admin or member' }, { status: 400 })
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify the company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // Upsert the membership for this specific company only
    await prisma.companyMember.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { userId, companyId, role, joinedAt: new Date() },
      update: { role },
    })

    console.log(`[super-admin] ${requesterEmail} assigned ${targetUser.email} to "${company.name}" as ${role}`)

    return NextResponse.json({
      message: `${targetUser.email} assigned to "${company.name}" as ${role}`,
    })
  } catch (err: any) {
    console.error('[super-admin/assign POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/assign
 * Removes a user from a specific company entirely.
 */
export async function DELETE(request: NextRequest) {
  try {
    const requesterEmail = await getSuperAdminEmail()
    if (!requesterEmail) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, companyId } = await request.json()
    if (!userId || !companyId) {
      return NextResponse.json({ error: 'userId and companyId are required' }, { status: 400 })
    }

    await prisma.companyMember.deleteMany({
      where: { userId, companyId },
    })

    console.log(`[super-admin] ${requesterEmail} removed user ${userId} from company ${companyId}`)
    return NextResponse.json({ message: 'User removed from company' })
  } catch (err: any) {
    console.error('[super-admin/assign DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
