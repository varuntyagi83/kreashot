import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

// ── GET — fetch full brand voice profile ─────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id } = await params

    const voice = await prisma.brandVoice.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, isDefault: true, profile: true, createdAt: true },
    })

    if (!voice) return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })

    return NextResponse.json({
      voice: {
        id: voice.id,
        name: voice.name,
        is_default: voice.isDefault,
        profile: voice.profile,
        created_at: voice.createdAt,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PUT — update a brand voice (rename / set default) ────────────────────────

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

    if (body.name !== undefined) {
      if (body.name.length > 200) {
        return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
      }
      // Check for duplicate name within this company
      const duplicate = await prisma.brandVoice.findFirst({
        where: { companyId, name: body.name.trim(), NOT: { id } },
        select: { id: true },
      })
      if (duplicate) {
        return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
      }
      updateData.name = body.name.trim()
    }

    if (body.is_default === true) {
      await prisma.brandVoice.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      })
      updateData.isDefault = true
    } else if (body.is_default === false) {
      updateData.isDefault = false
    }

    const voice = await prisma.brandVoice.updateMany({
      where: { id, companyId },
      data: updateData,
    })

    if (voice.count === 0) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })
    }

    const updated = await prisma.brandVoice.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, isDefault: true, updatedAt: true },
    })

    if (!updated) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })
    }

    return NextResponse.json({
      voice: {
        id: updated.id,
        name: updated.name,
        is_default: updated.isDefault,
        updated_at: updated.updatedAt,
      },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
    }
    console.error('[brand-voices/[id] PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE — remove a brand voice ────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id } = await params

    const result = await prisma.brandVoice.deleteMany({
      where: { id, companyId },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'Brand voice not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Brand voice deleted' })
  } catch (error: any) {
    console.error('[brand-voices/[id] DELETE] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
