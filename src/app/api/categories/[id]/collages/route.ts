import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET - List all collages for a category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params
  const format = request.nextUrl.searchParams.get('format')
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = supabase
    .from('collages')
    .select('*')
    .eq('category_id', categoryId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (format) {
    query = query.eq('format', format)
  }

  const { data, error } = await query

  if (error) {
    console.error('[collages GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ collages: data })
}

// POST - Create a new collage design
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params
  const supabase = await createServerSupabaseClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, format = '1:1', collage_data } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
      '1:1':  { width: 1080, height: 1080 },
      '16:9': { width: 1920, height: 1080 },
      '9:16': { width: 1080, height: 1920 },
      '4:5':  { width: 1080, height: 1350 },
    }
    const { width, height } = FORMAT_DIMENSIONS[format] ?? FORMAT_DIMENSIONS['1:1']

    const { data: collage, error } = await supabase
      .from('collages')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        name: name.trim(),
        format,
        width,
        height,
        collage_data: collage_data || { layers: [], background_color: '#FFFFFF' },
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create collage:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ collage, message: 'Collage created successfully' })
  } catch (error: any) {
    console.error('Error creating collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
