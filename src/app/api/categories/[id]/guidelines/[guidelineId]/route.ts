import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

/**
 * DELETE /api/categories/[id]/guidelines/[guidelineId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; guidelineId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, guidelineId } = await params

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const guideline = await prisma.guideline.findFirst({
      where: { id: guidelineId, categoryId },
      select: { id: true },
    })

    if (!guideline) {
      return NextResponse.json({ error: 'Guideline not found' }, { status: 404 })
    }

    await prisma.guideline.delete({ where: { id: guidelineId } })

    return NextResponse.json({ message: 'Guideline deleted successfully' })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
