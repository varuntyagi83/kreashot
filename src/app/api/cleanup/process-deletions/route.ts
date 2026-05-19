import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/db'
import { deleteFile } from '@/lib/storage'

// Mark route as dynamic to prevent build-time execution
export const dynamic = 'force-dynamic'

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET
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
    console.log('Processing deletion queue...')

    // Initialize Google Drive
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL!,
        private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')!,
      },
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })

    // Get all queued deletions (pending only, to avoid re-processing completed/failed entries)
    const queuedFiles = await prisma.deletionQueue.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    if (queuedFiles.length === 0) {
      return NextResponse.json({
        message: 'No files to delete',
        processed: 0,
      })
    }

    console.log(`Found ${queuedFiles.length} files to delete`)

    const results = []

    for (const file of queuedFiles) {
      try {
        if (file.storageProvider === 'gcs' && file.storagePath) {
          console.log(`Deleting from GCS: ${file.storagePath}`)
          await deleteFile(file.storagePath, { provider: 'gcs' })
        } else if (file.storageProvider === 'gdrive' && file.gdriveFileId) {
          console.log(`Deleting from Drive: ${file.storagePath} (${file.gdriveFileId})`)
          await drive.files.delete({ fileId: file.gdriveFileId, supportsAllDrives: true })
        } else if (file.storagePath) {
          console.log(`Deleting via path fallback: ${file.storagePath}`)
          await deleteFile(file.storagePath, { provider: file.storageProvider as any })
        } else {
          throw new Error('No file ID or path available for deletion')
        }

        // Remove from deletion queue
        await prisma.deletionQueue.delete({ where: { id: file.id } })

        results.push({ path: file.storagePath, success: true })
      } catch (error: any) {
        console.error(`Error deleting ${file.storagePath}:`, error.message)

        // If file not found (already deleted), remove from queue anyway
        if (error.code === 404 || error.message?.includes('not found')) {
          await prisma.deletionQueue.delete({ where: { id: file.id } })
          results.push({ path: file.storagePath, success: true, note: 'File already deleted' })
        } else {
          results.push({ path: file.storagePath, success: false, error: 'Deletion failed' })
        }
      }
    }

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    return NextResponse.json({
      message: 'Deletion processing complete',
      processed: results.length,
      successful: successful.length,
      failed: failed.length,
      results,
    })
  } catch (error: any) {
    console.error('Error processing deletions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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
    const queuedFiles = await prisma.deletionQueue.findMany({
      where: { status: 'pending' },
      select: { id: true, resourceType: true, storagePath: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({
      count: queuedFiles.length,
      files: queuedFiles,
    })
  } catch (error: any) {
    console.error('[process-deletions GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
