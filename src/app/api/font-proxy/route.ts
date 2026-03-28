/**
 * Font proxy: fetch font from storage URL and return it same-origin.
 * Used by Final Ad preview so @font-face works without CORS (browser loads from our origin).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

const ALLOWED_FONT_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'supabase.co',
]

function isAllowedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('data:')) return true
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) return false
    const hostname = parsed.hostname.toLowerCase()
    return ALLOWED_FONT_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

function contentTypeFromBuffer(buf: Buffer): string {
  if (buf.length < 4) return 'application/octet-stream'
  if (buf[0] === 0x4F && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4F) return 'font/otf'
  if (buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x46) return 'font/woff'
  if (buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x32) return 'font/woff2'
  if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return 'font/ttf'
  return 'font/ttf'
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = request.nextUrl.searchParams.get('url')
  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json({ error: 'Invalid or disallowed font URL' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Font fetch failed: ${res.status}` }, { status: 502 })
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 100) {
      return NextResponse.json({ error: 'Font response too small' }, { status: 502 })
    }
    const contentType = contentTypeFromBuffer(buffer)
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': getBaseUrl(),
      },
    })
  } catch (e: any) {
    console.warn('[font-proxy] fetch error:', e?.message)
    return NextResponse.json({ error: 'Font fetch failed' }, { status: 502 })
  }
}
