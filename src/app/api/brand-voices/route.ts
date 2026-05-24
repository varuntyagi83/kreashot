import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// ── GET — list company's saved brand voices ───────────────────────────────────

export async function GET() {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const voices = await prisma.brandVoice.findMany({
      where: { companyId },
      select: { id: true, name: true, isDefault: true, profile: true, createdAt: true, updatedAt: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })

    return NextResponse.json({
      voices: voices.map((v) => ({
        id: v.id,
        name: v.name,
        is_default: v.isDefault,
        tone_words: (v.profile as any)?.tone_words || [],
        personality: (v.profile as any)?.personality || '',
        created_at: v.createdAt,
        updated_at: v.updatedAt,
      })),
    })
  } catch (error: any) {
    console.error('[brand-voices GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST — save a new brand voice ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const { name, profile, is_default } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 })
    }
    if (!profile || typeof profile !== 'object') {
      return NextResponse.json({ error: 'profile is required' }, { status: 400 })
    }
    if (JSON.stringify(profile).length > 65536) {
      return NextResponse.json({ error: 'profile must be 64KB or smaller' }, { status: 400 })
    }

    // If setting as default, clear any existing default first
    if (is_default) {
      await prisma.brandVoice.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      })
    }

    // Check for duplicate name within this company
    const duplicate = await prisma.brandVoice.findFirst({
      where: { companyId, name: name.trim() },
      select: { id: true },
    })

    if (duplicate) {
      return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
    }

    const voice = await prisma.brandVoice.create({
      data: {
        userId: user.id,
        companyId,
        name: name.trim(),
        profile,
        isDefault: is_default || false,
      },
      select: { id: true, name: true, isDefault: true, createdAt: true },
    })

    return NextResponse.json({
      voice: {
        id: voice.id,
        name: voice.name,
        is_default: voice.isDefault,
        created_at: voice.createdAt,
      },
    }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A brand voice with this name already exists' }, { status: 409 })
    }
    console.error('[brand-voices POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
