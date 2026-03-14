import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { downloadFile } from '@/lib/storage'
import sharp from 'sharp'

export const maxDuration = 60

const RESOLUTION_MAP: Record<string, number | null> = {
  Original: null,
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
}

const FORMAT_CONFIG: Record<string, { mime: string; ext: string }> = {
  JPEG: { mime: 'image/jpeg', ext: 'jpg' },
  WebP: { mime: 'image/webp', ext: 'webp' },
  PNG:  { mime: 'image/png',  ext: 'png'  },
}

/**
 * GET /api/download
 * Downloads an image from Google Drive, optionally resizes + converts format, and streams back.
 *
 * Query params:
 *   fileId     — Google Drive file ID (required)
 *   filename   — base filename without extension (default: "download")
 *   resolution — Original | 1K | 2K | 4K (default: Original)
 *   format     — JPEG | WebP | PNG (default: JPEG)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const fileId   = sp.get('fileId')
    const filename = sp.get('filename') || 'download'
    const resolution = sp.get('resolution') || 'Original'
    const format     = sp.get('format')     || 'JPEG'

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 })
    }

    const fmtConfig = FORMAT_CONFIG[format] ?? FORMAT_CONFIG['JPEG']
    const maxPx     = RESOLUTION_MAP[resolution] ?? null

    // Fetch from Google Drive via API (bypasses CDN rate limits)
    const buffer = await downloadFile(fileId, { provider: 'gdrive' })

    // Apply Sharp transformations
    let pipeline = sharp(buffer)

    if (maxPx !== null) {
      pipeline = pipeline.resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    }

    let outputBuffer: Buffer
    if (format === 'WebP') {
      outputBuffer = await pipeline.webp({ quality: 90 }).toBuffer()
    } else if (format === 'PNG') {
      outputBuffer = await pipeline.png().toBuffer()
    } else {
      outputBuffer = await pipeline.jpeg({ quality: 90 }).toBuffer()
    }

    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': fmtConfig.mime,
        'Content-Disposition': `attachment; filename="${filename}.${fmtConfig.ext}"`,
        'Content-Length': String(outputBuffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json({ error: error.message || 'Download failed' }, { status: 500 })
  }
}
