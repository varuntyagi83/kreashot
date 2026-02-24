import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { deleteFile } from '@/lib/storage'

/**
 * DELETE /api/categories/[id]/angled-shots/[angleId]
 * Deletes an angled shot from Google Drive storage and Supabase database
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; angleId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId, angleId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get angled shot and verify ownership
    const { data: angledShot } = await supabase
      .from('angled_shots')
      .select('id, storage_path, storage_provider, gdrive_file_id, category_id, user_id')
      .eq('id', angleId)
      .eq('category_id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!angledShot) {
      return NextResponse.json(
        { error: 'Angled shot not found' },
        { status: 404 }
      )
    }

    // Delete from storage (Google Drive or Supabase depending on provider)
    try {
      if (angledShot.storage_provider === 'gdrive' && angledShot.gdrive_file_id) {
        // Use file ID for faster deletion
        await deleteFile(angledShot.gdrive_file_id, {
          provider: 'gdrive',
        })
        console.log(`Deleted from Google Drive: ${angledShot.gdrive_file_id}`)
      } else if (angledShot.storage_provider === 'supabase') {
        // Legacy Supabase storage
        await supabase.storage
          .from('angled-shots')
          .remove([angledShot.storage_path])
        console.log(`Deleted from Supabase Storage: ${angledShot.storage_path}`)
      } else {
        // Fallback: try path-based deletion
        await deleteFile(angledShot.storage_path, {
          provider: angledShot.storage_provider as any,
        })
        console.log(`Deleted using path: ${angledShot.storage_path}`)
      }
    } catch (storageError) {
      console.error('Storage deletion error:', storageError)
      // Continue anyway - database cleanup is more critical
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('angled_shots')
      .delete()
      .eq('id', angleId)
      .eq('user_id', user.id)

    if (dbError) {
      console.error('Database deletion error:', dbError)
      return NextResponse.json(
        { error: 'Failed to delete angled shot' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Angled shot deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting angled shot:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
