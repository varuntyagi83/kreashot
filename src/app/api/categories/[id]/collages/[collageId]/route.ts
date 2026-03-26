import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { FORMATS } from '@/lib/formats'
import { getCompanyId } from '@/lib/get-company'

const ALLOWED_URL_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'supabase.co',
  'storage.googleapis.com',
]

function isAllowedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('data:')) return true
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) return false
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
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await getCompanyId(supabase, user.id)
  if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

  const rateLimit = checkRateLimit(`collages:${user.id}`, 30, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { data: collage, error } = await supabase
    .from('collages')
    .select('*')
    .eq('id', collageId)
    .eq('category_id', categoryId)
    .eq('company_id', companyId)
    .single()

  if (error || !collage) {
    return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
  }

  return NextResponse.json({ collage })
}

// PUT - Update a collage design
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; collageId: string }> }
) {
  const { id: categoryId, collageId } = await params
  const supabase = await createServerSupabaseClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`collages:${user.id}`, 30, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('collages')
      .select('id')
      .eq('id', collageId)
      .eq('category_id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const body = await request.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

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
      // Validate background_color if provided
      if (body.collage_data?.background_color !== undefined) {
        const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
        if (!hexRegex.test(body.collage_data.background_color)) {
          return NextResponse.json(
            { error: 'background_color must be a valid hex color (e.g. #RRGGBB or #RGB)' },
            { status: 400 }
          )
        }
      }

      // Per-layer validation (M-01)
      if (Array.isArray(body.collage_data?.layers)) {
        for (let i = 0; i < body.collage_data.layers.length; i++) {
          const layer = body.collage_data.layers[i]

          // Cap text_content at 500 chars
          if (layer.text_content !== undefined) {
            if (typeof layer.text_content !== 'string' || layer.text_content.length > 500) {
              return NextResponse.json(
                { error: `Layer ${i}: text_content must be a string of 500 characters or fewer` },
                { status: 400 }
              )
            }
          }

          // Validate source_url is empty or an allowed URL
          if (layer.source_url !== undefined && layer.source_url !== '') {
            if (!isAllowedUrl(layer.source_url)) {
              return NextResponse.json(
                { error: `Layer ${i}: source_url is not an allowed URL` },
                { status: 400 }
              )
            }
          }

          // Cap numeric fields within safe bounds
          const numericBounds: Record<string, [number, number]> = {
            x:        [0, 100],
            y:        [0, 100],
            width:    [0, 100],
            height:   [0, 100],
            opacity:  [0, 1],
            fontSize: [1, 1000],
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

      updateData.collage_data = body.collage_data
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

    const { data: collage, error } = await supabase
      .from('collages')
      .update(updateData)
      .eq('id', collageId)
      .select()
      .single()

    if (error) {
      console.error('Failed to update collage:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

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
  const supabase = await createServerSupabaseClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('collages')
      .select('id')
      .eq('id', collageId)
      .eq('category_id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('collages')
      .delete()
      .eq('id', collageId)
      .eq('category_id', categoryId)

    if (error) {
      console.error('Failed to delete collage:', error)
      return NextResponse.json({ error: 'Failed to delete collage' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
