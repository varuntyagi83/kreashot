import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * DELETE /api/categories/[id]/copy-docs/[docId]
 * Deletes a copy doc (triggers Google Drive cleanup via database trigger)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, docId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership via category
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Verify the copy doc exists and belongs to this category
    const { data: copyDoc } = await supabase
      .from('copy_docs')
      .select('id')
      .eq('id', docId)
      .eq('category_id', categoryId)
      .single()

    if (!copyDoc) {
      return NextResponse.json({ error: 'Copy doc not found' }, { status: 404 })
    }

    // Delete (trigger will automatically queue Google Drive deletion)
    const { error: deleteError } = await supabase
      .from('copy_docs')
      .delete()
      .eq('id', docId)
      .eq('category_id', categoryId)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Copy doc deleted successfully' })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
