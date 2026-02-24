import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// Mark route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic'

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET
  if (!expectedToken) return false
  return authHeader === `Bearer ${expectedToken}`
}

/**
 * Process deletion queue and delete files from Google Drive
 * Can be called manually or via cron job
 */
export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('🗑️  Processing deletion queue...')

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize Google Drive
    const GOOGLE_DRIVE_CLIENT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL!
    const GOOGLE_DRIVE_PRIVATE_KEY = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')!

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_DRIVE_CLIENT_EMAIL,
        private_key: GOOGLE_DRIVE_PRIVATE_KEY
      },
      scopes: ['https://www.googleapis.com/auth/drive']
    })

    const drive = google.drive({ version: 'v3', auth })

    // Get all queued deletions
    const { data: queuedFiles, error: fetchError } = await supabase
      .from('deletion_queue')
      .select('*')
      .eq('storage_provider', 'gdrive')
      .not('gdrive_file_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50) // Process 50 at a time

    if (fetchError) {
      console.error('Error fetching deletion queue:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!queuedFiles || queuedFiles.length === 0) {
      return NextResponse.json({
        message: 'No files to delete',
        processed: 0
      })
    }

    console.log(`Found ${queuedFiles.length} files to delete`)

    const results = []

    // Delete each file from Google Drive
    for (const file of queuedFiles) {
      try {
        console.log(`Deleting ${file.storage_path} (${file.gdrive_file_id})`)

        // Delete from Google Drive
        await drive.files.delete({
          fileId: file.gdrive_file_id,
          supportsAllDrives: true
        })

        // Remove from deletion queue
        const { error: deleteError } = await supabase
          .from('deletion_queue')
          .delete()
          .eq('id', file.id)

        if (deleteError) {
          console.error(`Error removing from queue: ${deleteError.message}`)
        }

        results.push({
          path: file.storage_path,
          success: true
        })

      } catch (error: any) {
        console.error(`Error deleting ${file.storage_path}:`, error.message)

        // If file not found (already deleted), remove from queue anyway
        if (error.code === 404 || error.message?.includes('not found')) {
          await supabase
            .from('deletion_queue')
            .delete()
            .eq('id', file.id)

          results.push({
            path: file.storage_path,
            success: true,
            note: 'File already deleted'
          })
        } else {
          results.push({
            path: file.storage_path,
            success: false,
            error: error.message
          })
        }
      }
    }

    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    return NextResponse.json({
      message: 'Deletion processing complete',
      processed: results.length,
      successful: successful.length,
      failed: failed.length,
      results
    })

  } catch (error: any) {
    console.error('Error processing deletions:', error)
    return NextResponse.json({
      error: error.message
    }, { status: 500 })
  }
}

/**
 * GET endpoint to check deletion queue status
 */
export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: queuedFiles, error } = await supabase
      .from('deletion_queue')
      .select('id, resource_type, storage_path, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      count: queuedFiles?.length || 0,
      files: queuedFiles || []
    })

  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 })
  }
}
