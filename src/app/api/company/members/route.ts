import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

/**
 * GET /api/company/members
 */
export async function GET() {
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

    const members = await prisma.companyMember.findMany({
      where: { companyId },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, userId: true, role: true, joinedAt: true },
      take: 200,
    })

    const userIds = members.map((m) => m.userId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
      take: 200,
    })

    const usersMap = Object.fromEntries(users.map((u) => [u.id, u]))

    const enriched = members.map((m) => ({
      id: m.id,
      user_id: m.userId,
      role: m.role,
      joined_at: m.joinedAt,
      email: usersMap[m.userId]?.email ?? '',
      full_name: usersMap[m.userId]?.name ?? '',
      is_current_user: m.userId === user.id,
    }))

    return NextResponse.json({ members: enriched, current_role: membership.role })
  } catch (err: any) {
    console.error('[company/members GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/company/members?userId=...
 */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId')
    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const isSelf = targetUserId === user.id
    if (!isSelf && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    await prisma.companyMember.deleteMany({
      where: { companyId, userId: targetUserId },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[company/members DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
