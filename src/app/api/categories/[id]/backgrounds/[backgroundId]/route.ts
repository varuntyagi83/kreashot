import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * GET /api/categories/[id]/backgrounds/[backgroundId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, backgroundId } = await params

    const background = await prisma.background.findFirst({
      where: { id: backgroundId, categoryId, companyId },
    })

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    return NextResponse.json({ background })
  } catch (error) {
    console.error('Error fetching background:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/categories/[id]/backgrounds/[backgroundId]
 * Updates a background's name/description
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, backgroundId } = await params

    const existing = await prisma.background.findFirst({
      where: { id: backgroundId, categoryId, companyId },
      select: { id: true, description: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }

    const background = await prisma.background.update({
      where: { id: backgroundId },
      data: { name: name.trim(), description: description ?? existing.description },
    })

    return NextResponse.json({ message: 'Background updated', background })
  } catch (error) {
    console.error('Error updating background:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/categories/[id]/backgrounds/[backgroundId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, backgroundId } = await params

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const background = await prisma.background.findFirst({
      where: { id: backgroundId, categoryId, companyId },
      select: { id: true },
    })

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    await prisma.background.delete({ where: { id: backgroundId } })

    return NextResponse.json({ message: 'Background deleted successfully' })
  } catch (error) {
    console.error('Error deleting background:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
