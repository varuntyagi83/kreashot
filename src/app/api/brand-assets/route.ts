import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'
import { getCompanyInfo } from '@/lib/get-company'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

function detectMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg'
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png'
  // WebP: RIFF????WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp'
  // PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'application/pdf'
  // WOFF
  if (buffer[0] === 0x77 && buffer[1] === 0x4F && buffer[2] === 0x46 && buffer[3] === 0x46) return 'font/woff'
  // WOFF2
  if (buffer[0] === 0x77 && buffer[1] === 0x4F && buffer[2] === 0x46 && buffer[3] === 0x32) return 'font/woff2'
  // OTF
  if (buffer[0] === 0x4F && buffer[1] === 0x54 && buffer[2] === 0x54 && buffer[3] === 0x4F) return 'font/otf'
  // TTF
  if (buffer[0] === 0x00 && buffer[1] === 0x01 && buffer[2] === 0x00 && buffer[3] === 0x00) return 'font/ttf'
  // SVG (XML text)
  const head = buffer.slice(0, 64).toString('utf-8').trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) return 'image/svg+xml'
  return null
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId } = companyInfo

    const { data: assets, error } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[brand-assets GET] error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Migrate legacy font URLs: old records stored drive.google.com/uc?export=download
    // which triggers the virus-scan HTML page. Rewrite on read to the direct download URL.
    const migratedAssets = (assets || []).map((a: any) => {
      if (a.asset_type === 'font' && a.storage_url?.includes('drive.google.com/uc')) {
        const match = a.storage_url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
        if (match) {
          return {
            ...a,
            storage_url: `https://drive.usercontent.google.com/download?id=${match[1]}&export=download&confirm=t`,
          }
        }
      }
      return a
    })

    return NextResponse.json({ assets: migratedAssets }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error: any) {
    console.error('[brand-assets GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyInfo = await getCompanyInfo(supabase, user.id)
    if (!companyInfo) return NextResponse.json({ error: 'No company found' }, { status: 403 })
    const { company_id: companyId, company_slug: companySlug, company_name: companyName } = companyInfo

    const formData = await request.formData()
    const file = formData.get('file') as File
    const name = formData.get('name') as string
    const assetType = formData.get('asset_type') as string

    if (!file || !name || !assetType) {
      return NextResponse.json(
        { error: 'File, name, and asset type are required' },
        { status: 400 }
      )
    }

    const ALLOWED_ASSET_TYPES = ['logo', 'font', 'image', 'overlay', 'watermark', 'pattern']
    if (!assetType || !ALLOWED_ASSET_TYPES.includes(assetType)) {
      return NextResponse.json({ error: `asset_type must be one of: ${ALLOWED_ASSET_TYPES.join(', ')}` }, { status: 400 })
    }

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'Name must be 100 characters or fewer' }, { status: 400 })
    }

    // Validate file type
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
      'application/x-font-ttf', 'application/x-font-opentype',
      'application/font-woff', 'application/font-woff2',
    ]
    // Browsers sometimes send empty MIME for font files — allow by extension
    const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2']
    const isFontByExt = fontExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!ALLOWED_TYPES.includes(file.type) && !isFontByExt) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, PDF, TTF, OTF, WOFF, WOFF2` },
        { status: 400 }
      )
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large (max 50MB)' },
        { status: 400 }
      )
    }

    // Convert file to buffer for GDrive upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Validate file content via magic bytes
    const detectedMime = detectMimeFromBytes(buffer)
    const ALLOWED_MIME_BYTES = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'font/woff', 'font/woff2', 'font/otf', 'font/ttf',
    ]

    // Reject SVG uploads explicitly — SVG can contain <script> tags and execute
    // JavaScript when served with Content-Type: image/svg+xml. No sanitiser is
    // present, so rejection is the correct defence (L-NEW-02).
    if (
      detectedMime === 'image/svg+xml' ||
      file.type === 'image/svg+xml' ||
      file.name.toLowerCase().endsWith('.svg')
    ) {
      return NextResponse.json(
        { error: 'SVG files are not allowed. Please upload PNG, JPEG, or WebP.' },
        { status: 400 }
      )
    }

    if (!detectedMime || !ALLOWED_MIME_BYTES.includes(detectedMime)) {
      return NextResponse.json({ error: 'File content does not match an allowed type' }, { status: 400 })
    }

    const slug = generateSlug(name)
    const fileExt = file.name.split('.').pop() || 'png'
    const isFont = assetType === 'font'

    // Determine content type (browsers may send empty MIME for font files)
    const FONT_EXT_MIME: Record<string, string> = {
      ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    }
    const contentType = file.type || FONT_EXT_MIME[fileExt.toLowerCase()] || 'application/octet-stream'
    const sanitizedCompanyName = sanitizeCompanyName(companyName)

    // Fonts: store in Supabase so the browser can load them via @font-face (no CORS issues).
    // Other assets: Google Drive.
    let storageFile: { path: string; publicUrl: string; fileId?: string }
    let storageProvider: 'supabase' | 'gdrive'
    if (isFont) {
      const filePath = `${sanitizedCompanyName}/${companySlug}/${user.id}/font/${slug}_${Date.now()}.${fileExt}`
      storageFile = await uploadFile(buffer, filePath, {
        contentType,
        provider: 'supabase',
        bucket: 'brand-assets',
      })
      storageProvider = 'supabase'
    } else {
      const filePath = `${sanitizedCompanyName}/${companySlug}/brand-assets/${assetType}/${slug}_${Date.now()}.${fileExt}`
      storageFile = await uploadFile(buffer, filePath, {
        contentType,
        provider: 'gdrive',
      })
      storageProvider = 'gdrive'
    }

    const storageUrl = storageFile.publicUrl

    // Insert into brand_assets table
    const { data: asset, error: dbError } = await supabase
      .from('brand_assets')
      .insert({
        user_id: user.id,
        company_id: companyId,
        name,
        asset_type: assetType,
        storage_provider: storageProvider,
        storage_path: storageFile.path,
        storage_url: storageUrl,
        gdrive_file_id: storageProvider === 'gdrive' ? storageFile.fileId ?? null : null,
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_type: contentType,
        },
      })
      .select()
      .single()

    if (dbError) {
      // Cleanup uploaded file if database insert fails
      try {
        if (storageProvider === 'gdrive') {
          const { deleteFile } = await import('@/lib/storage')
          const fileIdOrPath = storageFile.fileId || storageFile.path
          await deleteFile(fileIdOrPath, { provider: 'gdrive' })
        } else {
          await supabase.storage.from('brand-assets').remove([storageFile.path])
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up orphaned storage file:', cleanupErr)
      }
      console.error('[brand-assets POST] dbError:', dbError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const publicUrl = storageUrl

    // Create asset_references entry
    const referenceId = `@global/${assetType}/${slug}`

    const { error: refError } = await supabase
      .from('asset_references')
      .insert({
        user_id: user.id,
        company_id: companyId,
        category_id: null, // Global asset
        reference_id: referenceId,
        asset_type: 'brand_asset',
        asset_table_id: asset.id,
        storage_url: publicUrl,
        display_name: name,
        searchable_text: `${name} ${assetType} ${slug}`,
      })

    if (refError) {
      console.error('Failed to create asset reference:', refError)
      // Don't fail the whole operation, just log it
    }

    return NextResponse.json({ asset }, { status: 201 })
  } catch (error: any) {
    console.error('[brand-assets POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
