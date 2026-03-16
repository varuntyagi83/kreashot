import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { deleteFile } from '@/lib/storage'
import { getCompanyId } from '@/lib/get-company'

/**
 * DELETE /api/categories/[id]/final-assets/[assetId]
 * Deletes a final asset from DB and from Google Drive.
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`delete:${user.id}`, 50, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    // Fetch asset with storage fields so we can delete from GDrive
    const { data: asset, error: fetchError } = await supabase
      .from('final_assets')
      .select('id, gdrive_file_id, storage_path, storage_provider')
      .eq('id', assetId)
      .eq('category_id', categoryId)
      .eq('company_id', companyId)
      .single()

    if (fetchError || !asset) {
      return NextResponse.json({ error: 'Final asset not found' }, { status: 404 })
    }

    // Delete from Google Drive (final assets are uploaded with provider: 'gdrive')
    const provider = asset.storage_provider || 'gdrive'
    if (provider === 'gdrive' && (asset.gdrive_file_id || asset.storage_path)) {
      try {
        await deleteFile(asset.gdrive_file_id || asset.storage_path!, { provider: 'gdrive' })
      } catch (e) {
        console.error('Failed to delete final asset from GDrive:', e)
        // Continue to delete DB row so UI stays in sync
      }
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
