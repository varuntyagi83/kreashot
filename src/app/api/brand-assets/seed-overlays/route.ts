import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { Resvg } from '@resvg/resvg-js'
import { checkRateLimit } from '@/lib/rate-limit'

function svgToPngDataUrl(svg: string): string {
  const resvg = new Resvg(svg)
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  return `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`
}

const OVERLAYS: { name: string; svg: string }[] = [
  {
    name: 'Dashed Circle Arrow',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <circle cx="540" cy="540" r="360" fill="none" stroke="white" stroke-width="2.5"
    stroke-dasharray="14 9" opacity="0.95"/>
  <polyline points="900,528 912,540 900,552" fill="none" stroke="white" stroke-width="2.5"
    stroke-linejoin="round" stroke-linecap="round"/>
  <polyline points="180,552 168,540 180,528" fill="none" stroke="white" stroke-width="2.5"
    stroke-linejoin="round" stroke-linecap="round"/>
</svg>`,
  },
  {
    name: 'Thin Circle Ring',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <circle cx="540" cy="540" r="380" fill="none" stroke="white" stroke-width="1.5" opacity="0.8"/>
</svg>`,
  },
  {
    name: 'Double Concentric Rings',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <circle cx="540" cy="540" r="420" fill="none" stroke="white" stroke-width="1.5" opacity="0.5"/>
  <circle cx="540" cy="540" r="340" fill="none" stroke="white" stroke-width="1" opacity="0.35"/>
</svg>`,
  },
  {
    name: 'Corner Brackets',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <path d="M 80 200 L 80 80 L 200 80" fill="none" stroke="white" stroke-width="3" stroke-linecap="square"/>
  <path d="M 880 80 L 1000 80 L 1000 200" fill="none" stroke="white" stroke-width="3" stroke-linecap="square"/>
  <path d="M 80 880 L 80 1000 L 200 1000" fill="none" stroke="white" stroke-width="3" stroke-linecap="square"/>
  <path d="M 1000 880 L 1000 1000 L 880 1000" fill="none" stroke="white" stroke-width="3" stroke-linecap="square"/>
</svg>`,
  },
  {
    name: 'Dot Grid',
    svg: (() => {
      const dots: string[] = []
      const spacing = 90
      const r = 2.5
      for (let col = 1; col <= 11; col++) {
        for (let row = 1; row <= 11; row++) {
          dots.push(`<circle cx="${col * spacing}" cy="${row * spacing}" r="${r}" fill="white" opacity="0.45"/>`)
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">${dots.join('')}</svg>`
    })(),
  },
  {
    name: 'Diagonal Lines',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <pattern id="diag" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <line x1="0" y1="40" x2="40" y2="0" stroke="white" stroke-width="1" opacity="0.25"/>
    </pattern>
  </defs>
  <rect width="1080" height="1080" fill="url(#diag)"/>
</svg>`,
  },
  {
    name: 'Minimal Frame',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect x="40" y="40" width="1000" height="1000" fill="none" stroke="white" stroke-width="1.5" opacity="0.5"/>
  <rect x="70" y="70" width="940" height="940" fill="none" stroke="white" stroke-width="0.75" opacity="0.25"/>
</svg>`,
  },
  {
    name: 'Vertical Line',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <line x1="540" y1="0" x2="540" y2="1920" stroke="white" stroke-width="3" opacity="0.85"/>
</svg>`,
  },
  {
    name: 'Horizontal Line',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <line x1="0" y1="540" x2="1080" y2="540" stroke="white" stroke-width="3" opacity="0.85"/>
</svg>`,
  },
  {
    name: 'Cross Lines',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <line x1="0" y1="540" x2="1080" y2="540" stroke="white" stroke-width="1" opacity="0.3"/>
  <line x1="540" y1="0" x2="540" y2="1080" stroke="white" stroke-width="1" opacity="0.3"/>
  <line x1="520" y1="540" x2="560" y2="540" stroke="white" stroke-width="2.5" opacity="0.8"/>
  <line x1="540" y1="520" x2="540" y2="560" stroke="white" stroke-width="2.5" opacity="0.8"/>
</svg>`,
  },
]

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function POST() {
  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`seed-overlays:${user.id}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before seeding more overlays.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const results: { name: string; status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }[] = []

    for (const overlay of OVERLAYS) {
      let pngDataUrl: string
      try {
        pngDataUrl = svgToPngDataUrl(overlay.svg)
      } catch (err: any) {
        results.push({ name: overlay.name, status: 'error', error: `SVG to PNG conversion failed: ${err.message}` })
        continue
      }

      const existing = await prisma.brandAsset.findFirst({
        where: { companyId, name: overlay.name, assetType: 'overlay' },
        select: { id: true, storageUrl: true },
      })

      if (existing) {
        if (existing.storageUrl?.includes('image/svg')) {
          try {
            await prisma.brandAsset.update({
              where: { id: existing.id },
              data: { storageUrl: pngDataUrl, metadata: { file_type: 'image/png', seeded: true } },
            })
            await prisma.assetReference.updateMany({
              where: { assetTableId: existing.id },
              data: { storageUrl: pngDataUrl },
            })
            results.push({ name: overlay.name, status: 'updated' })
          } catch (err: any) {
            results.push({ name: overlay.name, status: 'error', error: `Update failed: ${err.message}` })
          }
        } else {
          results.push({ name: overlay.name, status: 'skipped' })
        }
        continue
      }

      try {
        const slug = generateSlug(overlay.name)
        const brandAsset = await prisma.brandAsset.create({
          data: {
            userId: user.id,
            companyId,
            name: overlay.name,
            assetType: 'overlay',
            storagePath: `data/overlay/${slug}`,
            storageUrl: pngDataUrl,
            storageProvider: 'gcs',
            metadata: { file_type: 'image/png', seeded: true },
          },
          select: { id: true },
        })

        await prisma.assetReference.create({
          data: {
            userId: user.id,
            companyId,
            categoryId: null,
            referenceId: `@global/overlay/${slug}`,
            assetType: 'brand_asset',
            assetTableId: brandAsset.id,
            storageUrl: pngDataUrl,
            displayName: overlay.name,
            searchableText: `${overlay.name} overlay ${slug}`,
          },
        })

        results.push({ name: overlay.name, status: 'created' })
      } catch (err: any) {
        results.push({ name: overlay.name, status: 'error', error: err.message })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const updated = results.filter((r) => r.status === 'updated').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Seeded ${created} overlays, upgraded ${updated} SVG to PNG (${skipped} already up-to-date, ${errors} errors)`,
      results,
    })
  } catch (error: any) {
    console.error('[seed-overlays POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
