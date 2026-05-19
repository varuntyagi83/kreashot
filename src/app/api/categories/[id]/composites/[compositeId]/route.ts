import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * DELETE /api/categories/[id]/composites/[compositeId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compositeId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, compositeId } = await params

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const composite = await prisma.composite.findFirst({
      where: { id: compositeId, categoryId, companyId },
      select: { id: true },
    })

    if (!composite) {
      return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
    }

    await prisma.composite.delete({ where: { id: compositeId } })

    return NextResponse.json({ message: 'Composite deleted successfully' })
  } catch (error) {
    console.error('Error deleting composite:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
