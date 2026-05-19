import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile, deleteFile } from '@/lib/storage'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

function detectMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp'
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'application/pdf'
  if (buffer[0] === 0x77 && buffer[1] === 0x4F && buffer[2] === 0x46 && buffer[3] === 0x46) return 'font/woff'
  if (buffer[0] === 0x77 && buffer[1] === 0x4F && buffer[2] === 0x46 && buffer[3] === 0x32) return 'font/woff2'
  if (buffer[0] === 0x4F && buffer[1] === 0x54 && buffer[2] === 0x54 && buffer[3] === 0x4F) return 'font/otf'
  if (buffer[0] === 0x00 && buffer[1] === 0x01 && buffer[2] === 0x00 && buffer[3] === 0x00) return 'font/ttf'
  const head = buffer.slice(0, 64).toString('utf-8').trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) return 'image/svg+xml'
  return null
}

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

    const assets = await prisma.brandAsset.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    // Migrate legacy font URLs on read
    const migratedAssets = assets.map((a: any) => {
      if (a.assetType === 'font' && a.storageUrl?.includes('drive.google.com/uc')) {
        const match = a.storageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
        if (match) {
          return {
            ...a,
            storageUrl: `https://drive.usercontent.google.com/download?id=${match[1]}&export=download&confirm=t`,
          }
        }
      }
      return a
    })

    return NextResponse.json({ assets: migratedAssets }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    console.error('[brand-assets GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const name = formData.get('name') as string
    const assetType = formData.get('asset_type') as string

    if (!file || !name || !assetType) {
      return NextResponse.json({ error: 'File, name, and asset type are required' }, { status: 400 })
    }

    const ALLOWED_ASSET_TYPES = ['logo', 'font', 'image', 'overlay', 'watermark', 'pattern']
    if (!ALLOWED_ASSET_TYPES.includes(assetType)) {
      return NextResponse.json({ error: `asset_type must be one of: ${ALLOWED_ASSET_TYPES.join(', ')}` }, { status: 400 })
    }
    if (!name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'Name must be 100 characters or fewer' }, { status: 400 })
    }

    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
      'application/x-font-ttf', 'application/x-font-opentype',
      'application/font-woff', 'application/font-woff2',
    ]
    const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2']
    const isFontByExt = fontExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!ALLOWED_TYPES.includes(file.type) && !isFontByExt) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, PDF, TTF, OTF, WOFF, WOFF2` },
        { status: 400 }
      )
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const detectedMime = detectMimeFromBytes(buffer)
    const ALLOWED_MIME_BYTES = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'font/woff', 'font/woff2', 'font/otf', 'font/ttf',
    ]

    if (
      detectedMime === 'image/svg+xml' ||
      file.type === 'image/svg+xml' ||
      file.name.toLowerCase().endsWith('.svg')
    ) {
      return NextResponse.json(
        { error: 'SVG files are not allowed. Please upload PNG, JPEG, or WebP.' },
        { status: 400 }
      )
    }

    if (!detectedMime || !ALLOWED_MIME_BYTES.includes(detectedMime)) {
      return NextResponse.json({ error: 'File content does not match an allowed type' }, { status: 400 })
    }

    const slug = generateSlug(name)
    const fileExt = file.name.split('.').pop() || 'png'
    const isFont = assetType === 'font'

    const FONT_EXT_MIME: Record<string, string> = {
      ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    }
    const contentType = file.type || FONT_EXT_MIME[fileExt.toLowerCase()] || 'application/octet-stream'
    const sanitizedCompanyName = sanitizeCompanyName(company.name)

    // Fonts use GCS (Supabase removed); other assets also use GCS
    const filePath = isFont
      ? `${sanitizedCompanyName}/${company.slug}/${user.id}/font/${slug}_${Date.now()}.${fileExt}`
      : `${sanitizedCompanyName}/${company.slug}/brand-assets/${assetType}/${slug}_${Date.now()}.${fileExt}`

    const storageFile = await uploadFile(buffer, filePath, { contentType, provider: 'gcs' })

    let asset: any
    try {
      asset = await prisma.brandAsset.create({
        data: {
          userId: user.id,
          companyId,
          name,
          assetType,
          storageProvider: 'gcs',
          storagePath: storageFile.path,
          storageUrl: storageFile.publicUrl,
          gdriveFileId: null,
          metadata: {
            file_name: file.name,
            file_size: file.size,
            file_type: contentType,
          },
        },
      })
    } catch (dbError) {
      try {
        await deleteFile(storageFile.path, { provider: 'gcs' })
      } catch (cleanupErr) {
        console.error('Failed to clean up orphaned storage file:', cleanupErr)
      }
      console.error('[brand-assets POST] dbError:', dbError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const referenceId = `@global/${assetType}/${slug}`
    prisma.assetReference.create({
      data: {
        userId: user.id,
        companyId,
        categoryId: null,
        referenceId,
        assetType: 'brand_asset',
        assetTableId: asset.id,
        storageUrl: storageFile.publicUrl,
        displayName: name,
        searchableText: `${name} ${assetType} ${slug}`,
      },
    }).catch((err: any) => console.error('Failed to create asset reference:', err))

    return NextResponse.json({ asset }, { status: 201 })
  } catch (error: any) {
    console.error('[brand-assets POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
