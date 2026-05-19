import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile } from '@/lib/storage'

/**
 * POST /api/admin/process-deletion-queue
 * Processes pending deletions from the deletion queue
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Processing deletion queue...')

    const pendingDeletions = await prisma.deletionQueue.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    if (pendingDeletions.length === 0) {
      return NextResponse.json({ message: 'No pending deletions', processed: 0, failed: 0 })
    }

    console.log(`Found ${pendingDeletions.length} pending deletions`)

    let successCount = 0
    let failCount = 0

    for (const deletion of pendingDeletions) {
      try {
        await prisma.deletionQueue.update({
          where: { id: deletion.id },
          data: { status: 'processing' },
        })

        if (deletion.storageProvider === 'gdrive' && deletion.gdriveFileId) {
          await deleteFile(deletion.gdriveFileId, { provider: 'gdrive' })
          console.log(`Deleted from Google Drive: ${deletion.gdriveFileId} (${deletion.resourceType})`)
        } else if (deletion.storagePath) {
          await deleteFile(deletion.storagePath, { provider: deletion.storageProvider as any })
          console.log(`Deleted using path: ${deletion.storagePath} (${deletion.resourceType})`)
        } else {
          throw new Error('No file ID or path available for deletion')
        }

        await prisma.deletionQueue.update({
          where: { id: deletion.id },
          data: { status: 'completed', processedAt: new Date() },
        })

        successCount++
      } catch (error) {
        console.error(`Failed to delete ${deletion.id}:`, error)

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const newAttempts = deletion.attempts + 1
        const newStatus = newAttempts >= 3 ? 'failed' : 'pending'

        await prisma.deletionQueue.update({
          where: { id: deletion.id },
          data: {
            status: newStatus,
            errorMessage,
            attempts: newAttempts,
            processedAt: newStatus === 'failed' ? new Date() : null,
          },
        })

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/admin/process-deletion-queue
 * Get deletion queue status
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [pendingCount, processingCount, completedCount, failedCount] = await Promise.all([
      prisma.deletionQueue.count({ where: { status: 'pending' } }),
      prisma.deletionQueue.count({ where: { status: 'processing' } }),
      prisma.deletionQueue.count({ where: { status: 'completed' } }),
      prisma.deletionQueue.count({ where: { status: 'failed' } }),
    ])

    return NextResponse.json({
      queue: {
        pending: pendingCount,
        processing: processingCount,
        completed: completedCount,
        failed: failedCount,
      },
    })
  } catch (error) {
    console.error('Error getting queue status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
