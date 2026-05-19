import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'

// GET /api/references/search?q=query - Search brand assets, guidelines, and products
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { companyId } = ctx

    const searchParams = request.nextUrl.searchParams
    const rawQuery = (searchParams.get('q') || '').slice(0, 200)

    // Search brand assets
    const brandAssets = await prisma.brandAsset.findMany({
      where: {
        companyId,
        name: { contains: rawQuery, mode: 'insensitive' },
      },
      select: { id: true, name: true, assetType: true, metadata: true, storageUrl: true, storagePath: true },
      take: 5,
    })

    // Search brand guidelines library
    const guidelines = await prisma.brandGuideline.findMany({
      where: {
        companyId,
        name: { contains: rawQuery, mode: 'insensitive' },
      },
      select: { id: true, name: true, sourceFileName: true, isDefault: true },
      take: 5,
    })

    // Search products across all categories in company
    const products = await prisma.product.findMany({
      where: {
        companyId,
        name: { contains: rawQuery, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        category: { select: { id: true, name: true } },
      },
      take: 5,
    })

    // Format results
    const brandAssetResults = brandAssets.map((asset) => ({
      id: asset.id,
      type: 'brand-asset' as const,
      name: asset.name,
      preview: asset.storageUrl || asset.storagePath || '',
      isImage: (asset.metadata as any)?.mimeType?.startsWith('image/') ?? asset.assetType === 'image',
    }))

    const guidelineResults = guidelines.map((g) => ({
      id: g.id,
      type: 'guideline' as const,
      name: g.name,
      isImage: false,
    }))

    const productResults = products.map((product) => ({
      id: product.id,
      type: 'product' as const,
      name: product.name,
      categoryName: product.category.name,
      categoryId: product.category.id,
    }))

    const results = [...guidelineResults, ...brandAssetResults, ...productResults]

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
