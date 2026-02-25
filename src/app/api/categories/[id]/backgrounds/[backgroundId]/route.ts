import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * GET /api/categories/[id]/backgrounds/[backgroundId]
 * Gets a single background with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, backgroundId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: background } = await supabase
      .from('backgrounds')
      .select('*, category:categories!inner(user_id, slug, name, look_and_feel)')
      .eq('id', backgroundId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (!background) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    return NextResponse.json({ background })
  } catch (error) {
    console.error('Error fetching background:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/categories/[id]/backgrounds/[backgroundId]
 * Updates a background's name/description
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, backgroundId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify background belongs to user's category
    const { data: existing } = await supabase
      .from('backgrounds')
      .select('*, category:categories!inner(user_id)')
      .eq('id', backgroundId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const { data: background, error } = await supabase
      .from('backgrounds')
      .update({ name: name.trim(), description: description ?? existing.description })
      .eq('id', backgroundId)
      .select()
      .single()

    if (error) {
      console.error('Error updating background:', error)
      return NextResponse.json({ error: 'Failed to update background' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Background updated', background })
  } catch (error) {
    console.error('Error updating background:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/categories/[id]/backgrounds/[backgroundId]
 * Deletes a background (deletion queue will handle storage cleanup)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; backgroundId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, backgroundId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify background belongs to user's category
    const { data: background } = await supabase
      .from('backgrounds')
      .select('*, category:categories!inner(user_id)')
      .eq('id', backgroundId)
      .eq('category_id', categoryId)
      .eq('category.user_id', user.id)
      .single()

    if (!background) {
      return NextResponse.json(
        { error: 'Background not found' },
        { status: 404 }
      )
    }

    // Delete from database (trigger will queue storage deletion)
    const { error: deleteError } = await supabase
      .from('backgrounds')
      .delete()
      .eq('id', backgroundId)

    if (deleteError) {
      console.error('Error deleting background:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete background' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Background deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting background:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
