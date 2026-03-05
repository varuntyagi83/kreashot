import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'

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

    const { data: assets, error } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ assets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Validate file type
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf',
      'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
      'application/x-font-ttf', 'application/x-font-opentype',
      'application/font-woff', 'application/font-woff2',
    ]
    // Browsers sometimes send empty MIME for font files — allow by extension
    const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2']
    const isFontByExt = fontExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!ALLOWED_TYPES.includes(file.type) && !isFontByExt) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, SVG, PDF, TTF, OTF, WOFF, WOFF2` },
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

    // Generate path for GDrive: brand-assets/{asset_type}/{slug}_{timestamp}.{ext}
    const slug = generateSlug(name)
    const fileExt = file.name.split('.').pop() || 'png'
    const filePath = `brand-assets/${assetType}/${slug}_${Date.now()}.${fileExt}`

    // Determine content type (browsers may send empty MIME for font files)
    const FONT_EXT_MIME: Record<string, string> = {
      ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    }
    const contentType = file.type || FONT_EXT_MIME[fileExt.toLowerCase()] || 'application/octet-stream'

    // Upload to Google Drive
    const storageFile = await uploadFile(buffer, filePath, {
      contentType,
      provider: 'gdrive',
    })

    // For non-image files (fonts), use GDrive direct download URL instead of lh3 CDN
    const isFont = assetType === 'font'
    const storageUrl = isFont && storageFile.fileId
      ? `https://drive.google.com/uc?export=download&id=${storageFile.fileId}`
      : storageFile.publicUrl

    // Insert into brand_assets table
    const { data: asset, error: dbError } = await supabase
      .from('brand_assets')
      .insert({
        user_id: user.id,
        name,
        asset_type: assetType,
        storage_provider: 'gdrive',
        storage_path: storageFile.path,
        storage_url: storageUrl,
        gdrive_file_id: storageFile.fileId || null,
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_type: contentType,
        },
      })
      .select()
      .single()

    if (dbError) {
      // Cleanup uploaded GDrive file if database insert fails
      try {
        const { deleteFile } = await import('@/lib/storage')
        const fileIdOrPath = storageFile.fileId || storageFile.path
        await deleteFile(fileIdOrPath, { provider: 'gdrive' })
      } catch (cleanupErr) {
        console.error('Failed to clean up orphaned GDrive file:', cleanupErr)
      }
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    const publicUrl = storageUrl

    // Create asset_references entry
    const referenceId = `@global/${assetType}/${slug}`

    const { error: refError } = await supabase
      .from('asset_references')
      .insert({
        user_id: user.id,
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
