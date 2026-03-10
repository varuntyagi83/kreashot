import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

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

  const { data: collage, error } = await supabase
    .from('collages')
    .select('*')
    .eq('id', collageId)
    .eq('category_id', categoryId)
    .eq('user_id', user.id)
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

    // Verify ownership
    const { data: existing } = await supabase
      .from('collages')
      .select('id')
      .eq('id', collageId)
      .eq('category_id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const body = await request.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updateData.name = body.name
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
      updateData.collage_data = body.collage_data
    }
    if (body.format !== undefined) {
      const VALID_FORMATS = ['1:1', '16:9', '9:16', '4:5']
      if (!VALID_FORMATS.includes(body.format)) {
        return NextResponse.json({ error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}` }, { status: 400 })
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
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('collages')
      .delete()
      .eq('id', collageId)

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
