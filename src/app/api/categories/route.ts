import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET() {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const categories = await prisma.category.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    const categoryIds = categories.map((c) => c.id)

    const [productCounts, angledShotCounts] = await Promise.all([
      categoryIds.length > 0
        ? prisma.product.groupBy({
            by: ['categoryId'],
            where: { categoryId: { in: categoryIds } },
            _count: { id: true },
          })
        : Promise.resolve([]),
      categoryIds.length > 0
        ? prisma.angledShot.groupBy({
            by: ['categoryId'],
            where: { categoryId: { in: categoryIds } },
            _count: { id: true },
          })
        : Promise.resolve([]),
    ])

    const productCountMap: Record<string, number> = {}
    for (const row of productCounts) {
      productCountMap[row.categoryId] = row._count.id
    }

    const angledShotCountMap: Record<string, number> = {}
    for (const row of angledShotCounts) {
      angledShotCountMap[row.categoryId] = row._count.id
    }

    const categoriesWithCounts = categories.map((category) => ({
      ...category,
      look_and_feel: category.lookAndFeel,
      brand_guidelines: category.brandGuidelines,
      brand_voice: category.brandVoice,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
      counts: {
        products: productCountMap[category.id] || 0,
        angled_shots: angledShotCountMap[category.id] || 0,
      },
    }))

    return NextResponse.json({ categories: categoriesWithCounts })
  } catch (error: any) {
    console.error('[categories GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const body = await request.json()
    const { name, description, look_and_feel } = body

    if (!name || !description) {
      return NextResponse.json(
        { error: 'Name and description are required' },
        { status: 400 }
      )
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
    }
    if (description.length > 500) {
      return NextResponse.json({ error: 'description must be 500 characters or fewer' }, { status: 400 })
    }
    if (look_and_feel && look_and_feel.length > 10000) {
      return NextResponse.json({ error: 'look_and_feel must be 10000 characters or fewer' }, { status: 400 })
    }

    const slug = generateSlug(name)

    const category = await prisma.category.create({
      data: {
        userId: user.id,
        companyId,
        name,
        slug,
        description,
        lookAndFeel: look_and_feel || null,
      },
    })

    return NextResponse.json({ category }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 409 }
      )
    }
    console.error('[categories POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
