import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

/**
 * DELETE /api/categories/[id]/copy-docs/[docId]
 * Deletes a copy doc
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx
    const { id: categoryId, docId } = await params

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const copyDoc = await prisma.copyDoc.findFirst({
      where: { id: docId, categoryId },
      select: { id: true },
    })

    if (!copyDoc) {
      return NextResponse.json({ error: 'Copy doc not found' }, { status: 404 })
    }

    await prisma.copyDoc.delete({ where: { id: docId } })

    return NextResponse.json({ message: 'Copy doc deleted successfully' })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
