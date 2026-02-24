import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getStorageAdapter } from '@/lib/storage'

/**
 * POST /api/categories/[id]/angled-shots/sync
 * Reconciles angled shots between Google Drive and Supabase
 * - Deletes orphaned Supabase records (where Google Drive file doesn't exist)
 * - Optionally deletes orphaned Google Drive files (where Supabase record doesn't exist)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { id: categoryId } = await params

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify category belongs to user
    const { data: category } = await supabase
      .from('categories')
      .select('id, name')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const { dryRun = true } = body // Default to dry run for safety

    console.log(`🔄 Starting sync for category: ${category.name} (dry run: ${dryRun})`)

    // Get all angled shots for this category from Supabase
    const { data: angledShots, error: fetchError } = await supabase
      .from('angled_shots')
      .select('id, storage_path, storage_provider, gdrive_file_id, angle_name, product_id')
      .eq('category_id', categoryId)
      .eq('user_id', user.id)

    if (fetchError) {
      console.error('Error fetching angled shots:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch angled shots' },
        { status: 500 }
      )
    }

    if (!angledShots || angledShots.length === 0) {
      return NextResponse.json({
        message: 'No angled shots found for this category',
        stats: {
          total: 0,
          orphanedRecords: 0,
          deleted: 0,
        },
      })
    }

    // Check each record to see if the file exists in Google Drive
    const storage = getStorageAdapter('gdrive')
    const orphanedRecords = []
    const validRecords = []

    for (const shot of angledShots) {
      try {
        // Check if file exists using file ID (faster) or path (fallback)
        const fileIdentifier =
          shot.storage_provider === 'gdrive' && shot.gdrive_file_id
            ? shot.gdrive_file_id
            : shot.storage_path

        const exists = await storage.exists(fileIdentifier)

        if (!exists) {
          console.log(`   ⚠️  Orphaned record: ${shot.angle_name} (ID: ${shot.id})`)
          orphanedRecords.push(shot)
        } else {
          validRecords.push(shot)
        }
      } catch (error) {
        console.error(`Error checking file ${shot.id}:`, error)
        // Assume orphaned if we can't verify
        orphanedRecords.push(shot)
      }
    }

    // Delete orphaned records from Supabase (if not dry run)
    let deletedCount = 0
    if (!dryRun && orphanedRecords.length > 0) {
      const idsToDelete = orphanedRecords.map((r) => r.id)

      const { error: deleteError } = await supabase
        .from('angled_shots')
        .delete()
        .in('id', idsToDelete)
        .eq('user_id', user.id) // Safety: only delete user's own records

      if (deleteError) {
        console.error('Error deleting orphaned records:', deleteError)
      } else {
        deletedCount = idsToDelete.length
        console.log(`   🗑️  Deleted ${deletedCount} orphaned records from Supabase`)
      }
    }

    return NextResponse.json({
      message: dryRun
        ? 'Sync analysis complete (dry run - no changes made)'
        : `Sync complete - deleted ${deletedCount} orphaned records`,
      category: {
        id: category.id,
        name: category.name,
      },
      stats: {
        total: angledShots.length,
        valid: validRecords.length,
        orphanedRecords: orphanedRecords.length,
        deleted: deletedCount,
      },
      orphanedRecords: orphanedRecords.map((r) => ({
        id: r.id,
        angle_name: r.angle_name,
        product_id: r.product_id,
        storage_path: r.storage_path,
        gdrive_file_id: r.gdrive_file_id,
      })),
      nextSteps: dryRun
        ? [
            'Review the orphaned records above',
            'Run again with { "dryRun": false } to delete them',
          ]
        : [
            'Orphaned Supabase records have been deleted',
            'Google Drive files (if any) are preserved',
          ],
    })
  } catch (error) {
    console.error('Error during sync:', error)
    return NextResponse.json(
      {
        error: 'Internal server error during sync',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
