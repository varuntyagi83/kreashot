import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
