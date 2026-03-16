import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'

/**
 * DELETE /api/categories/[id]/guidelines/[guidelineId]
 * Deletes a guideline document (trigger will queue Google Drive deletion)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; guidelineId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, guidelineId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Verify ownership via category
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    // Delete (trigger will queue Google Drive deletion)
    const { error: deleteError } = await supabase
      .from('guidelines')
      .delete()
      .eq('id', guidelineId)
      .eq('category_id', categoryId)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Guideline deleted successfully' })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
