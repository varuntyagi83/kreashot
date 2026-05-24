import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { FORMATS } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'

// GET - List all collages for a category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`collages:${user.id}`, 30, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const format = request.nextUrl.searchParams.get('format') || undefined

    const collages = await prisma.collage.findMany({
      where: { categoryId, companyId, ...(format ? { format } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000, // defensive bound against unbounded growth per category
    })

    return NextResponse.json({ collages })
  } catch (error: any) {
    console.error('[collages GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new collage design
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`collages:${user.id}`, 30, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })

    if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    const body = await request.json()
    const { name, format = '1:1', collage_data } = body

    if (!Object.keys(FORMATS).includes(format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${Object.keys(FORMATS).join(', ')}` }, { status: 400 })
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }

    if (collage_data?.background_color !== undefined) {
      const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
      if (!hexRegex.test(collage_data.background_color)) {
        return NextResponse.json(
          { error: 'background_color must be a valid hex color (e.g. #RRGGBB or #RGB)' },
          { status: 400 }
        )
      }
    }

    const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
      '1:1':  { width: 1080, height: 1080 },
      '16:9': { width: 1920, height: 1080 },
      '9:16': { width: 1080, height: 1920 },
      '4:5':  { width: 1080, height: 1350 },
    }
    const { width, height } = FORMAT_DIMENSIONS[format] ?? FORMAT_DIMENSIONS['1:1']

    const collage = await prisma.collage.create({
      data: {
        categoryId,
        userId: user.id,
        companyId,
        name: name.trim(),
        format,
        storagePath: '',
        storageUrl: '',
        metadata: { width, height, collageData: collage_data || { layers: [], background_color: '#FFFFFF' } },
      },
    })

    return NextResponse.json({ collage, message: 'Collage created successfully' })
  } catch (error: any) {
    console.error('Error creating collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
