import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { deleteFile } from '@/lib/storage'

/**
 * POST /api/admin/process-deletion-queue
 * Processes pending deletions from the deletion queue
 * Should be called by a Vercel cron job or manually
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify authorization (can be enhanced with API key or admin check)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔄 Processing deletion queue...')

    // Get pending deletions (oldest first, limit to 50 per run)
    // Items that hit max_retries are set to 'failed' status, so status='pending' filter is sufficient
    const { data: pendingDeletions, error: fetchError } = await supabase
      .from('deletion_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50)

    if (fetchError) {
      console.error('Error fetching deletion queue:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch deletion queue' },
        { status: 500 }
      )
    }

    if (!pendingDeletions || pendingDeletions.length === 0) {
      return NextResponse.json({
        message: 'No pending deletions',
        processed: 0,
        failed: 0,
      })
    }

    console.log(`   📋 Found ${pendingDeletions.length} pending deletions`)

    let successCount = 0
    let failCount = 0

    for (const deletion of pendingDeletions) {
      try {
        // Mark as processing
        await supabase
          .from('deletion_queue')
          .update({ status: 'processing' })
          .eq('id', deletion.id)

        // Delete from storage
        if (deletion.storage_provider === 'gdrive' && deletion.gdrive_file_id) {
          // Use file ID for faster deletion
          await deleteFile(deletion.gdrive_file_id, {
            provider: 'gdrive',
          })
          console.log(
            `   ✅ Deleted from Google Drive: ${deletion.gdrive_file_id} (${deletion.resource_type})`
          )
        } else if (deletion.storage_path) {
          // Fallback to path-based deletion
          await deleteFile(deletion.storage_path, {
            provider: deletion.storage_provider as any,
          })
          console.log(
            `   ✅ Deleted using path: ${deletion.storage_path} (${deletion.resource_type})`
          )
        } else {
          throw new Error('No file ID or path available for deletion')
        }

        // Mark as completed
        await supabase
          .from('deletion_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', deletion.id)

        successCount++
      } catch (error) {
        console.error(`   ❌ Failed to delete ${deletion.id}:`, error)

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        const newRetryCount = deletion.retry_count + 1
        const newStatus =
          newRetryCount >= deletion.max_retries ? 'failed' : 'pending'

        // Update with error and increment retry count
        await supabase
          .from('deletion_queue')
          .update({
            status: newStatus,
            error_message: errorMessage,
            retry_count: newRetryCount,
            processed_at: newStatus === 'failed' ? new Date().toISOString() : null,
          })
          .eq('id', deletion.id)

        failCount++
      }
    }

    return NextResponse.json({
      message: 'Deletion queue processed',
      total: pendingDeletions.length,
      successful: successCount,
      failed: failCount,
    })
  } catch (error) {
    console.error('Error processing deletion queue:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/process-deletion-queue
 * Get deletion queue status
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify authorization
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get queue statistics
    const [
      { count: pendingCount },
      { count: processingCount },
      { count: completedCount },
      { count: failedCount },
    ] = await Promise.all([
      supabase
        .from('deletion_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('deletion_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'processing'),
      supabase
        .from('deletion_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      supabase
        .from('deletion_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed'),
    ])

    return NextResponse.json({
      queue: {
        pending: pendingCount || 0,
        processing: processingCount || 0,
        completed: completedCount || 0,
        failed: failedCount || 0,
      },
    })
  } catch (error) {
    console.error('Error getting queue status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
