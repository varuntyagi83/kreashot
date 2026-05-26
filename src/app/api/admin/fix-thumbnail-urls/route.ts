import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Fix background thumbnail URLs: migrate from deprecated
 * drive.google.com/thumbnail to lh3.googleusercontent.com/d/
 * POST /api/admin/fix-thumbnail-urls
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find all backgrounds using the old thumbnail URL format
    const backgrounds = await prisma.background.findMany({
      where: { storageUrl: { contains: 'drive.google.com/thumbnail' } },
      select: { id: true, storageUrl: true, gdriveFileId: true },
      take: 500,
    })

    if (backgrounds.length === 0) {
      return NextResponse.json({ message: 'No URLs to fix', updated: 0 })
    }

    let updated = 0
    let skipped = 0

    for (const bg of backgrounds) {
      // Extract file ID from either gdriveFileId column or from the URL
      let fileId = bg.gdriveFileId
      if (!fileId && bg.storageUrl) {
        const match = bg.storageUrl.match(/[?&]id=([^&]+)/)
        if (match) fileId = match[1]
      }

      if (!fileId) {
        skipped++
        continue
      }

      const newUrl = `https://lh3.googleusercontent.com/d/${fileId}=w2000`

      try {
        await prisma.background.update({
          where: { id: bg.id },
          data: { storageUrl: newUrl },
        })
        updated++
      } catch (updateError) {
        console.error(`Failed to update background ${bg.id}:`, updateError)
        skipped++
      }
    }

    // Also fix angled shot URLs in the same pattern
    const shots = await prisma.angledShot.findMany({
      where: { storageUrl: { contains: 'drive.google.com/thumbnail' } },
      select: { id: true, storageUrl: true, gdriveFileId: true },
      take: 500,
    })

    let shotsUpdated = 0
    if (shots.length > 0) {
      for (const shot of shots) {
        let fileId = shot.gdriveFileId
        if (!fileId && shot.storageUrl) {
          const match = shot.storageUrl.match(/[?&]id=([^&]+)/)
          if (match) fileId = match[1]
        }
        if (!fileId) continue

        const newUrl = `https://lh3.googleusercontent.com/d/${fileId}=w2000`
        try {
          await prisma.angledShot.update({
            where: { id: shot.id },
            data: { storageUrl: newUrl },
          })
          shotsUpdated++
        } catch {
          // Non-fatal
        }
      }
    }

    return NextResponse.json({
      message: 'URL migration complete',
      backgrounds: { found: backgrounds.length, updated, skipped },
      shots: { found: shots.length, updated: shotsUpdated },
    })
  } catch (error) {
    console.error('Fix thumbnail URLs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
