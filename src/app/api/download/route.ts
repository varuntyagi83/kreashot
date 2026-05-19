import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'
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
 * Downloads an image from GCS or Google Drive, optionally resizes + converts format, and streams back.
 *
 * Query params:
 *   fileId     — GCS storage_path or Google Drive file ID (required)
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

    // Detect provider: GCS paths contain '/', Drive file IDs do not
    const isGcsPath = fileId.includes('/')

    // Verify ownership — fileId must belong to the authenticated user's company.
    // Scope by company_id (not user_id) to stay consistent with all other routes
    // and prevent cross-company file access by users who know a file path.
    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 403 })
    }

    const tables = ['backgrounds', 'composites', 'angled_shots', 'final_assets'] as const
    let owned = false
    for (const table of tables) {
      const column = isGcsPath ? 'storage_path' : 'gdrive_file_id'
      const { data } = await supabase
        .from(table)
        .select('id')
        .eq(column, fileId)
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle()
      if (data) { owned = true; break }
    }
    if (!owned) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const fmtConfig = FORMAT_CONFIG[format] ?? FORMAT_CONFIG['JPEG']
    const maxPx     = RESOLUTION_MAP[resolution] ?? null

    // Fetch from GCS or Google Drive
    const buffer = await downloadFile(fileId, { provider: isGcsPath ? 'gcs' : 'gdrive' })

    // M-02: Guard against oversized files before passing to Sharp
    if (buffer.length > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large to process' }, { status: 413 })
    }

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

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        'Content-Type': fmtConfig.mime,
        'Content-Disposition': `attachment; filename="${filename}.${fmtConfig.ext}"`,
        'Content-Length': String(outputBuffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
