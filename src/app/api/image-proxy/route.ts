/**
 * Image proxy: fetches a Google Drive file via service account and streams it
 * to the browser. Avoids public-sharing issues with lh3 / Drive CDN URLs.
 *
 * GET /api/image-proxy?fileId={driveFileId}
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/get-company'
import { google } from 'googleapis'

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth })
}

function contentTypeFromBuffer(buf: Buffer): string {
  if (buf.length < 4) return 'image/jpeg'
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // WebP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp'
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  return 'image/jpeg'
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fileId = request.nextUrl.searchParams.get('fileId')
  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
  }

  // Verify ownership — fileId must belong to the user's active company.
  // Ownership is company-scoped, not user-scoped: any member of a company
  // can view assets created by other members of the same company.
  const companyId = await getCompanyId(supabase, user.id)
  if (!companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let owned = false

  // angled_shots, backgrounds, composites: scoped via category → company
  for (const table of ['angled_shots', 'backgrounds', 'composites'] as const) {
    const { data: asset } = await supabase
      .from(table)
      .select('category_id')
      .eq('gdrive_file_id', fileId)
      .limit(1)
      .maybeSingle()

    if (asset?.category_id) {
      const { data: category } = await supabase
        .from('categories')
        .select('id')
        .eq('id', asset.category_id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (category) { owned = true; break }
    }
  }

  // brand_assets: scoped directly by company_id
  if (!owned) {
    const { data } = await supabase
      .from('brand_assets')
      .select('id')
      .eq('gdrive_file_id', fileId)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle()
    if (data) owned = true
  }

  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const drive = getDriveClient()
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    )

    const buffer = Buffer.from(response.data as ArrayBuffer)
    const contentType = contentTypeFromBuffer(buffer)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (e: any) {
    console.warn('[image-proxy] Drive fetch error:', e?.message)
    return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 })
  }
}
