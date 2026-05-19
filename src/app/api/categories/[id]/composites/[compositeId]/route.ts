import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * DELETE /api/categories/[id]/composites/[compositeId]
 * Deletes a composite (deletion queue will handle storage cleanup)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; compositeId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, compositeId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const rateLimit = await checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    // Verify composite belongs to company's category
    const { data: composite } = await supabase
      .from('composites')
      .select('*, category:categories!inner(company_id)')
      .eq('id', compositeId)
      .eq('category_id', categoryId)
      .eq('category.company_id', companyId)
      .single()

    if (!composite) {
      return NextResponse.json(
        { error: 'Composite not found' },
        { status: 404 }
      )
    }

    // Delete from database (trigger will queue storage deletion)
    const { error: deleteError } = await supabase
      .from('composites')
      .delete()
      .eq('id', compositeId)

    if (deleteError) {
      console.error('Error deleting composite:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete composite' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Composite deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting composite:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
