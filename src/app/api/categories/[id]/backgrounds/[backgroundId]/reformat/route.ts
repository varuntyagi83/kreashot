import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { regenerateBackgroundInFormat } from '@/lib/ai/gemini'
import { downloadFile, uploadFile } from '@/lib/storage'
import { formatToFolderName, getFormatDimensions, FORMATS } from '@/lib/formats'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

/**
 * POST /api/categories/[id]/backgrounds/[backgroundId]/reformat
 * Reformats a background image to different aspect ratios
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId, backgroundId } = await params

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = await checkRateLimit(`reformat-bg:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before reformatting more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const background = await prisma.background.findFirst({
      where: { id: backgroundId, categoryId, companyId },
      include: { category: { select: { slug: true } } },
    })

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    const body = await request.json()
    const { formats } = body

    const validFormatKeys = Object.keys(FORMATS)
    const targetFormats: string[] = (formats && Array.isArray(formats))
      ? formats.filter((f: string) => validFormatKeys.includes(f) && f !== background.format)
      : []

    if (targetFormats.length === 0) {
      return NextResponse.json({ error: 'No valid target formats provided' }, { status: 400 })
    }
    if (targetFormats.length > 4) {
      return NextResponse.json({ error: 'Max 4 formats at a time' }, { status: 400 })
    }

    // Download the source image
    console.log(`Downloading source background: ${background.name}`)
    let sourceBuffer: Buffer

    if (background.gdriveFileId) {
      sourceBuffer = await downloadFile(background.gdriveFileId, { provider: 'gdrive' })
    } else if (background.storagePath) {
      const provider = (background.storageProvider as any) || 'gcs'
      sourceBuffer = await downloadFile(background.storagePath, { provider })
    } else {
      return NextResponse.json({ error: 'Background has no downloadable file' }, { status: 400 })
    }

    const sourceMimeType = 'image/jpeg'
    const sourceBase64 = `data:${sourceMimeType};base64,${sourceBuffer.toString('base64')}`

    const categorySlug = background.category.slug
    const sanitizedCompanyName = sanitizeCompanyName(company.name)

    const results: Array<{
      format: string
      backgroundId: string
      name: string
      success: boolean
      error?: string
    }> = []

    for (const fmt of targetFormats) {
      console.log(`  Reformatting to ${fmt}...`)
      try {
        const generated = await regenerateBackgroundInFormat(
          sourceBase64,
          sourceMimeType,
          fmt,
          '4K'
        )

        const folderName = formatToFolderName(fmt)
        const slug = background.slug || background.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const fileName = `${sanitizedCompanyName}/${company.slug}/${categorySlug}/backgrounds/${folderName}/${slug}-${fmt.replace(':', 'x')}_${Date.now()}.jpg`

        const base64Data = generated.imageData.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        const storageFile = await uploadFile(buffer, fileName, {
          contentType: generated.mimeType || 'image/jpeg',
          provider: 'gdrive',
        })

        const fmtDims = getFormatDimensions(fmt)
        const newName = `${background.name} (${fmt})`

        const newBg = await prisma.background.create({
          data: {
            categoryId,
            companyId,
            userId: user.id,
            name: newName,
            slug: `${slug}-${fmt.replace(':', 'x')}-${Date.now()}`,
            description: background.description || `Reformatted from ${background.name}`,
            promptUsed: generated.promptUsed,
            format: fmt,
            storageProvider: 'gdrive',
            storagePath: storageFile.path,
            storageUrl: storageFile.publicUrl,
            gdriveFileId: storageFile.fileId || null,
            metadata: { width: fmtDims.width, height: fmtDims.height },
          },
          select: { id: true },
        })

        console.log(`  Saved ${fmt} background: ${newBg.id}`)
        results.push({ format: fmt, backgroundId: newBg.id, name: newName, success: true })
      } catch (error: any) {
        console.error(`  Error reformatting to ${fmt}:`, error)
        results.push({ format: fmt, backgroundId: '', name: '', success: false, error: 'Reformat failed' })
      }
    }

    const successCount = results.filter((r) => r.success).length

    return NextResponse.json({
      message: `Reformatted ${successCount}/${targetFormats.length} format(s)`,
      results,
    })
  } catch (error) {
    console.error('Error in reformat:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
