import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding
 * Creates a company for a newly signed-up user who has no company yet.
 * Safe to call multiple times — exits early if the user already belongs to a company.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    // Idempotency: if already in a company, just return success
    const existing = await prisma.companyMember.findFirst({
      where: { userId },
      select: { companyId: true },
    })

    if (existing) {
      return NextResponse.json({ alreadyOnboarded: true })
    }

    const { companyName } = await request.json()
    if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json({ error: 'companyName is required' }, { status: 400 })
    }
    if (companyName.length > 100) {
      return NextResponse.json({ error: 'companyName must be 100 characters or fewer' }, { status: 400 })
    }

    const name = companyName.trim()
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const slug = `${baseSlug}-${userId.slice(0, 8)}`

    // Railway Postgres has no RLS — direct Prisma inserts work without admin override
    const company = await prisma.company.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true },
    })

    await prisma.companyMember.create({
      data: { companyId: company.id, userId, role: 'admin' },
    })

    console.log(`[onboarding] Created company "${name}" (${company.id}) for user ${session.user.email}`)
    return NextResponse.json({ company }, { status: 201 })
  } catch (err: any) {
    console.error('[onboarding POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
