import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * DELETE /api/categories/[id]/final-assets/[assetId]
 * Deletes a final asset (DB row + queues storage cleanup)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, assetId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const rateLimit = checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    // Verify asset belongs to user
    const { data: asset } = await supabase
      .from('final_assets')
      .select('id')
      .eq('id', assetId)
      .eq('category_id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!asset) {
      return NextResponse.json({ error: 'Final asset not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('final_assets')
      .delete()
      .eq('id', assetId)

    if (deleteError) {
      console.error('Error deleting final asset:', deleteError)
      return NextResponse.json({ error: 'Failed to delete final asset' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Final asset deleted successfully' })
  } catch (error) {
    console.error('Error deleting final asset:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
