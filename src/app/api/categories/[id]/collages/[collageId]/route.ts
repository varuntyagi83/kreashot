import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { FORMATS } from '@/lib/formats'

const ALLOWED_URL_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'storage.googleapis.com',
]

function isAllowedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('data:')) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    return ALLOWED_URL_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

// GET - Fetch a single collage
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collageId: string }> }
) {
  const { id: categoryId, collageId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`collages:${user.id}`, 30, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const collage = await prisma.collage.findFirst({
      where: { id: collageId, categoryId, companyId },
    })

    if (!collage) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    return NextResponse.json({ collage })
  } catch (error: any) {
    console.error('Error fetching collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update a collage design
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collageId: string }> }
) {
  const { id: categoryId, collageId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`collages:${user.id}`, 30, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const existing = await prisma.collage.findFirst({
      where: { id: collageId, categoryId, companyId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const body = await request.json()
    const updateData: Record<string, any> = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return NextResponse.json({ error: 'name must be a string' }, { status: 400 })
      }
      const name = body.name.trim()
      if (name.length > 100) {
        return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 })
      }
      updateData.name = name
    }

    if (body.collage_data !== undefined) {
      if (body.collage_data?.background_color !== undefined) {
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
        if (!hexRegex.test(body.collage_data.background_color)) {
          return NextResponse.json(
            { error: 'background_color must be a valid hex color (e.g. #RRGGBB or #RGB)' },
            { status: 400 }
          )
        }
      }

      if (Array.isArray(body.collage_data?.layers)) {
        for (let i = 0; i < body.collage_data.layers.length; i++) {
          const layer = body.collage_data.layers[i]

          if (layer.name !== undefined) {
            if (typeof layer.name !== 'string' || layer.name.length > 100) {
              return NextResponse.json(
                { error: `Layer ${i}: name must be a string of 100 characters or fewer` },
                { status: 400 }
              )
            }
          }
          if (layer.text_content !== undefined) {
            if (typeof layer.text_content !== 'string' || layer.text_content.length > 500) {
              return NextResponse.json(
                { error: `Layer ${i}: text_content must be a string of 500 characters or fewer` },
                { status: 400 }
              )
            }
          }
          if (layer.source_url !== undefined && layer.source_url !== '') {
            if (!isAllowedUrl(layer.source_url)) {
              return NextResponse.json(
                { error: `Layer ${i}: source_url is not an allowed URL` },
                { status: 400 }
              )
            }
          }

          const numericBounds: Record<string, [number, number]> = {
            x: [0, 100], y: [0, 100], width: [0, 100], height: [0, 100],
            opacity: [0, 1], fontSize: [1, 1000],
          }
          for (const [field, [min, max]] of Object.entries(numericBounds)) {
            if (layer[field] !== undefined) {
              const val = Number(layer[field])
              if (isNaN(val) || val < min || val > max) {
                return NextResponse.json(
                  { error: `Layer ${i}: ${field} must be a number between ${min} and ${max}` },
                  { status: 400 }
                )
              }
            }
          }
        }
      }

      updateData.collageData = body.collage_data
    }

    if (body.format !== undefined) {
      if (!Object.keys(FORMATS).includes(body.format)) {
        return NextResponse.json({ error: `Invalid format. Must be one of: ${Object.keys(FORMATS).join(', ')}` }, { status: 400 })
      }
      const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
        '1:1':  { width: 1080, height: 1080 },
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '4:5':  { width: 1080, height: 1350 },
      }
      const dims = FORMAT_DIMENSIONS[body.format] ?? FORMAT_DIMENSIONS['1:1']
      updateData.format = body.format
      updateData.width = dims.width
      updateData.height = dims.height
    }

    const collage = await prisma.collage.update({
      where: { id: collageId },
      data: updateData,
    })

    return NextResponse.json({ collage })
  } catch (error: any) {
    console.error('Error updating collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a collage
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collageId: string }> }
) {
  const { id: categoryId, collageId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const existing = await prisma.collage.findFirst({
      where: { id: collageId, categoryId, companyId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    await prisma.collage.delete({ where: { id: collageId } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
