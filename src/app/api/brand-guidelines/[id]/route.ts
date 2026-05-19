import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'

// ── GET — get single guideline with full text ────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id } = await params

    const guideline = await prisma.brandGuideline.findFirst({
      where: { id, companyId },
    })

    if (!guideline) {
      return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
    }

    return NextResponse.json({ guideline })
  } catch (error: any) {
    console.error('[brand-guidelines/[id] GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PUT — update name, toggle is_default ─────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id } = await params

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined && body.name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (body.name !== undefined) updateData.name = body.name.trim()

    const result = await prisma.brandGuideline.updateMany({
      where: { id, companyId },
      data: updateData,
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
    }

    const guideline = await prisma.brandGuideline.findUnique({
      where: { id },
      select: { id: true, name: true },
    })

    if (body.name !== undefined) {
      await prisma.assetReference.updateMany({
        where: { assetTableId: id, assetType: 'guideline' },
        data: { displayName: body.name.trim() },
      })
    }

    return NextResponse.json({
      guideline: { id: guideline!.id, name: guideline!.name },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A guideline with this name already exists' }, { status: 409 })
    }
    console.error('[brand-guidelines/[id] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE — remove guideline + asset_references row ─────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id } = await params

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    // Delete asset_references entry first
    await prisma.assetReference.deleteMany({
      where: { assetTableId: id, assetType: 'guideline' },
    })

    // Delete the guideline
    const result = await prisma.brandGuideline.deleteMany({
      where: { id, companyId },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Brand guideline not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Brand guideline deleted' })
  } catch (error: any) {
    console.error('[brand-guidelines/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
