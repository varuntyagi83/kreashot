export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { regenerateBackgroundInFormat } from '@/lib/ai/gemini'
import { downloadFile, uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions, FORMATS } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

/**
 * POST /api/categories/[id]/composites/[compositeId]/reformat
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compositeId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, compositeId } = await params

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = await checkRateLimit(`reformat-composite:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before reformatting more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const composite = await prisma.composite.findFirst({
      where: { id: compositeId, categoryId, companyId },
      include: { category: { select: { slug: true } } },
    })

    if (!composite) {
      return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
    }

    const body = await request.json()
    const { formats } = body

    const validFormatKeys = Object.keys(FORMATS)
    const targetFormats: string[] = (formats && Array.isArray(formats))
      ? formats.filter((f: string) => validFormatKeys.includes(f) && f !== composite.format)
      : []

    if (targetFormats.length === 0) {
      return NextResponse.json({ error: 'No valid target formats provided' }, { status: 400 })
    }
    if (targetFormats.length > 4) {
      return NextResponse.json({ error: 'Max 4 formats at a time' }, { status: 400 })
    }

    let sourceBuffer: Buffer
    if (composite.gdriveFileId) {
      sourceBuffer = await downloadFile(composite.gdriveFileId, { provider: 'gdrive' })
    } else if (composite.storagePath) {
      const provider = (composite.storageProvider as any) || 'gcs'
      sourceBuffer = await downloadFile(composite.storagePath, { provider })
    } else {
      return NextResponse.json({ error: 'Composite has no downloadable file' }, { status: 400 })
    }

    const sourceMimeType = 'image/jpeg'
    const sourceBase64 = `data:${sourceMimeType};base64,${sourceBuffer.toString('base64')}`
    const categorySlug = composite.category.slug
    const sanitizedCompanyName = sanitizeCompanyName(company.name)

    const results: Array<{
      format: string
      compositeId: string
      name: string
      success: boolean
      error?: string
    }> = []

    for (const fmt of targetFormats) {
      console.log(`  Reformatting composite to ${fmt}...`)
      try {
        const reformatStartTime = Date.now()
        const generated = await regenerateBackgroundInFormat(
          sourceBase64,
          sourceMimeType,
          fmt,
          '4K'
        )
        const reformatTimeMs = Date.now() - reformatStartTime

        const folderName = formatToFolderName(fmt)
        const baseSlug = composite.slug || composite.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const newSlug = `${baseSlug}-${fmt.replace(':', 'x')}-${Date.now()}`
        const fileName = `${sanitizedCompanyName}/${company.slug}/${categorySlug}/composites/${folderName}/${newSlug}.jpg`

        const base64Data = generated.imageData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        const storageFile = await uploadFile(buffer, fileName, {
          contentType: generated.mimeType || 'image/jpeg',
          provider: 'gdrive',
        })

        const fmtDims = getFormatDimensions(fmt)
        const newName = `${composite.name} (${fmt})`

        const newComposite = await prisma.composite.create({
          data: {
            categoryId,
            companyId,
            userId: user.id,
            productId: composite.productId,
            angledShotId: composite.angledShotId,
            backgroundId: composite.backgroundId,
            name: newName,
            slug: newSlug,
            description: composite.description || `Reformatted from ${composite.name}`,
            promptUsed: generated.promptUsed,
            format: fmt,
            storageProvider: 'gdrive',
            storagePath: storageFile.path,
            storageUrl: storageFile.publicUrl,
            gdriveFileId: storageFile.fileId || null,
            metadata: { width: fmtDims.width, height: fmtDims.height, generationTimeMs: reformatTimeMs },
          },
          select: { id: true },
        })

        results.push({ format: fmt, compositeId: newComposite.id, name: newName, success: true })
      } catch (error: any) {
        console.error(`  Error reformatting to ${fmt}:`, error)
        results.push({ format: fmt, compositeId: '', name: '', success: false, error: 'Reformat failed' })
      }
    }

    const successCount = results.filter((r) => r.success).length
    return NextResponse.json({
      message: `Reformatted ${successCount}/${targetFormats.length} format(s)`,
      results,
    })
  } catch (error) {
    console.error('Error in composite reformat:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
