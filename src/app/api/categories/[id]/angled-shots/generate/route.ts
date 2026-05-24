// Extend route timeout hint (effective on Vercel; Railway uses nginx timeout)
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'

async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency)
    results.push(...await Promise.all(batch.map(fn => fn())))
  }
  return results
}

import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { generateAngledShots } from '@/lib/ai/gemini'
import { ANGLE_VARIATIONS } from '@/lib/ai/angle-variations'
import { deleteFile, downloadFile, uploadFile } from '@/lib/storage'
import { createDisplayName } from '@/lib/ai/format-angle-name'
import sharp from 'sharp'
import { detectFormatFromDimensions, formatToFolderName } from '@/lib/formats'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

/**
 * POST /api/categories/[id]/angled-shots/generate
 *
 * Supports two modes:
 *   - Single-angle mode (recommended): pass `angleName` — generates 1 image and saves it.
 *   - Bulk mode (legacy): omit `angleName` — generates all angles in one request.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx
    const { id: categoryId } = await params

    const rateLimit = await checkRateLimit(`angled-shots:${user.id}`, 20, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    // Fetch company slug and name for storage path
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const companySlug = company.slug
    const companyName = company.name

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, name: true, slug: true, lookAndFeel: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const { productId, productImageId, selectedAngles, angleName, format = '1:1' } = body

    if (!productId || !productImageId) {
      return NextResponse.json(
        { error: 'productId and productImageId are required' },
        { status: 400 }
      )
    }

    const validFormats = ['1:1', '16:9', '9:16', '4:5']
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${validFormats.join(', ')}` },
        { status: 400 }
      )
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, categoryId },
      select: { id: true, name: true, slug: true },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const productImage = await prisma.productImage.findFirst({
      where: { id: productImageId, productId },
      select: {
        id: true, fileName: true, metadata: true,
        storageProvider: true, storageUrl: true, storagePath: true, gdriveFileId: true,
      },
    })

    if (!productImage) {
      return NextResponse.json({ error: 'Product image not found' }, { status: 404 })
    }

    // Download source image from GDrive or GCS
    let imageBuffer: Buffer | null = null

    if (productImage.storageProvider === 'gdrive') {
      const gdriveKey = productImage.gdriveFileId || productImage.storagePath
      if (!gdriveKey) {
        return NextResponse.json(
          { error: 'Product image has no Google Drive file ID or storage path' },
          { status: 500 }
        )
      }
      try {
        imageBuffer = await downloadFile(gdriveKey, { provider: 'gdrive' })
      } catch (error) {
        console.error('Error downloading from Google Drive:', error)
        return NextResponse.json(
          { error: 'Failed to download product image from Google Drive' },
          { status: 500 }
        )
      }
    } else if (productImage.storageProvider === 'gcs' && productImage.storagePath) {
      try {
        imageBuffer = await downloadFile(productImage.storagePath, { provider: 'gcs' })
      } catch (error) {
        console.error('Error downloading from GCS:', error)
        return NextResponse.json(
          { error: 'Failed to download product image from GCS' },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported storage provider for product image' },
        { status: 500 }
      )
    }

    if (!imageBuffer) {
      return NextResponse.json({ error: 'Failed to download product image' }, { status: 500 })
    }

    const base64Image = imageBuffer.toString('base64')

    // Determine which angles to generate
    let anglesToGenerate: typeof ANGLE_VARIATIONS
    if (angleName) {
      const found = ANGLE_VARIATIONS.find((a) => a.name === angleName)
      if (!found) {
        return NextResponse.json({ error: `Unknown angle: ${angleName}` }, { status: 400 })
      }
      anglesToGenerate = [found]
    } else if (selectedAngles) {
      anglesToGenerate = ANGLE_VARIATIONS.filter((a) => selectedAngles.includes(a.name))
    } else {
      anglesToGenerate = ANGLE_VARIATIONS
    }

    if (anglesToGenerate.length === 0) {
      return NextResponse.json({ error: 'No valid angles selected' }, { status: 400 })
    }

    const planCheck = await checkPlanLimit(companyId, 'angled_shot', anglesToGenerate.length)
    if (!planCheck.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached for your plan (${planCheck.used}/${planCheck.limit} angled shots today). Upgrade to generate more.` },
        { status: 402 }
      )
    }

    console.log(`Generating ${anglesToGenerate.map(a => a.name).join(', ')} for ${product.name} [${format}]...`)

    const angledShotStartMs = Date.now()
    const generatedShots = await generateAngledShots(
      base64Image,
      (productImage.metadata as any)?.mimeType || 'image/jpeg',
      anglesToGenerate,
      category.lookAndFeel || undefined,
      format
    )
    const perShotMs = Math.round((Date.now() - angledShotStartMs) / (generatedShots.length || 1))

    const imageNameWithoutExt = productImage.fileName.replace(/\.[^/.]+$/, '')
    const sanitizedCompanyName = sanitizeCompanyName(companyName)

    // Save each shot to GCS + DB
    const savedShots = await pLimit(
      generatedShots.map((shot) => async () => {
        try {
          const base64Data = shot.imageData.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')

          let detectedFormat = format
          let actualWidth = 1080
          let actualHeight = 1080
          try {
            const metadata = await sharp(buffer).metadata()
            if (metadata.width && metadata.height) {
              detectedFormat = detectFormatFromDimensions(metadata.width, metadata.height)
              actualWidth = metadata.width
              actualHeight = metadata.height
            }
          } catch {
            // use client-provided format as fallback
          }

          const shotMimeType = (productImage.metadata as any)?.mimeType || 'image/jpeg'
          const fileExt = shotMimeType.split('/')[1] || 'jpg'
          const formatFolder = formatToFolderName(detectedFormat)
          const fileName = `${sanitizedCompanyName}/${companySlug}/${category.slug}/${product.slug}/product-images/angled-shots/${formatFolder}/${imageNameWithoutExt}-${shot.angleName}_${Date.now()}.${fileExt}`

          const storageFile = await uploadFile(buffer, fileName, {
            contentType: shotMimeType,
            provider: 'gcs',
          })

          const displayName = createDisplayName(product.name, shot.angleName)

          try {
            const angledShot = await prisma.angledShot.create({
              data: {
                productId,
                productImageId,
                categoryId,
                userId: user.id,
                companyId,
                angleName: shot.angleName,
                angleDescription: shot.angleDescription,
                displayName,
                promptUsed: shot.promptUsed || null,
                format: detectedFormat,
                storageProvider: 'gcs',
                storagePath: storageFile.path,
                storageUrl: storageFile.publicUrl,
                gdriveFileId: null,
                metadata: { width: actualWidth, height: actualHeight },
              },
            })
            return { ...angledShot, public_url: storageFile.publicUrl }
          } catch (dbError) {
            console.error(`DB insert failed for ${shot.angleName}:`, dbError)
            try {
              await deleteFile(storageFile.path, { provider: 'gcs' })
            } catch (cleanupError) {
              console.error('Failed to clean up orphaned GCS file:', cleanupError)
            }
            return null
          }
        } catch (err) {
          console.error(`Failed to save ${shot.angleName}:`, err)
          return null
        }
      }),
      3
    )

    const saved = savedShots.filter(Boolean)
    const fallbackAngles = generatedShots
      .filter((s: { fallbackToOriginal?: boolean }) => s.fallbackToOriginal)
      .map((s: { angleName: string }) => s.angleName)
    if (fallbackAngles.length > 0) {
      console.warn(`Angled shots that fell back to original: ${fallbackAngles.join(', ')}`)
    }

    return NextResponse.json({
      message: `Generated and saved ${saved.length} shot(s) for ${format} format`,
      count: saved.length,
      format,
      angledShots: saved,
      fallbackToOriginalAngles: fallbackAngles,
    })
  } catch (error) {
    console.error('Error generating angled shots:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
