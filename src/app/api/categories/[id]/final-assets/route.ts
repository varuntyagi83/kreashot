// Extend route timeout for Python compositor + GDrive upload
// Supports composite or direct angled-shot base images
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'
import { spawn, ChildProcess } from 'child_process'
import { unlink, readFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const ALLOWED_FONT_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'supabase.co', // Fonts in brand-assets bucket (e.g. https://xxx.supabase.co/storage/...)
]

function isAllowedUrl(url: string): boolean {
  if (!url) return false
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

// GET - Fetch all final assets for category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const format = request.nextUrl.searchParams.get('format')
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify this category belongs to the authenticated user
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  let query = supabase
    .from('final_assets')
    .select('*')
    .eq('category_id', id)
    .order('created_at', { ascending: false })

  if (format) {
    query = query.eq('format', format)
  }

  const { data, error } = await query

  if (error) {
    console.error('[final-assets GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ finalAssets: data })
}

// POST - Generate new final asset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params
  const supabase = await createServerSupabaseClient()

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(`final-assets:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    // Verify category belongs to the authenticated user
    const { data: ownedCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (!ownedCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      name = 'Untitled Ad',
      format = '1:1',
      compositeId,
      baseImageUrl,
      copyDocId,
      templateId,
      logoUrl,
      layerTexts,
      customLayers,
    } = body

    if (logoUrl && !isAllowedUrl(logoUrl)) {
      return NextResponse.json({ error: 'Logo URL not allowed' }, { status: 400 })
    }

    const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
      '1:1':  { width: 1080, height: 1080 },
      '16:9': { width: 1920, height: 1080 },
      '9:16': { width: 1080, height: 1920 },
      '4:5':  { width: 1080, height: 1350 },
    }
    const { width, height } = FORMAT_DIMENSIONS[format] ?? FORMAT_DIMENSIONS['1:1']

    const DEFAULT_LAYERS = [
      { id: 'bg', type: 'background', x: 0, y: 0, width: 100, height: 100, z_index: 0 },
      { id: 'text', type: 'text', name: 'tagline', x: 10, y: 80, width: 80, height: 15, z_index: 2, font_size: 48, color: '#000000', text_align: 'center' },
    ]

    console.log('🎨 Generating final asset for category:', categoryId, `(${format} ${width}x${height})`)

    // 1. Resolve layers: customLayers (freeform) > templateId > category template > DEFAULT_LAYERS
    let template: { id: string | null; template_data: { layers: any[] } }

    const VALID_LAYER_TYPES = ['background', 'product', 'text', 'logo', 'overlay']
    const isValidLayer = (l: any): { ok: boolean; reason?: string } => {
      if (!l || !VALID_LAYER_TYPES.includes(l.type)) return { ok: false, reason: `layer type missing or invalid (got ${l?.type})` }
      if (typeof l.x !== 'number' || Number.isNaN(l.x) || l.x < 0 || l.x > 100) return { ok: false, reason: `layer.x must be number 0-100 (got ${l.x})` }
      if (typeof l.y !== 'number' || Number.isNaN(l.y) || l.y < 0 || l.y > 100) return { ok: false, reason: `layer.y must be number 0-100 (got ${l.y})` }
      if (typeof l.width !== 'number' || Number.isNaN(l.width) || l.width <= 0 || l.width > 100) return { ok: false, reason: `layer.width must be number 1-100 (got ${l.width})` }
      if (typeof l.height !== 'number' || Number.isNaN(l.height) || l.height <= 0 || l.height > 100) return { ok: false, reason: `layer.height must be number 1-100 (got ${l.height})` }
      return { ok: true }
    }

    if (customLayers && Array.isArray(customLayers) && customLayers.length > 0) {
      if (customLayers.length > 20) {
        return NextResponse.json({ error: 'Too many layers (max 20)' }, { status: 400 })
      }
      for (let i = 0; i < customLayers.length; i++) {
        const result = isValidLayer(customLayers[i])
        if (!result.ok) {
          return NextResponse.json({ error: `Invalid layer structure: layer[${i}] (type=${customLayers[i]?.type}): ${result.reason}` }, { status: 400 })
        }
      }
      // Freeform mode — use layers built by the frontend
      console.log('🎨 Using freeform custom layers')
      template = { id: null, template_data: { layers: customLayers } }
    } else {
      let templateRow: any = null
      if (templateId) {
        const { data } = await supabase
          .from('templates')
          .select('*')
          .eq('id', templateId)
          .eq('category_id', categoryId)
          .single()
        templateRow = data
        if (!templateRow) console.warn('⚠️  Specified templateId not found, falling back to category template')
      }

      if (!templateRow) {
        const { data } = await supabase
          .from('templates')
          .select('*')
          .eq('category_id', categoryId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        templateRow = data
      }

      // Parse template_data (may be stored as a JSON string in some rows)
      let parsedTemplateData = templateRow?.template_data
      if (typeof parsedTemplateData === 'string') {
        try { parsedTemplateData = JSON.parse(parsedTemplateData) } catch { parsedTemplateData = null }
      }

      // If template has no layers (e.g. safe_zones-only templates), inject default layers
      const layers = parsedTemplateData?.layers?.length > 0 ? parsedTemplateData.layers : DEFAULT_LAYERS

      template = {
        id: templateRow?.id ?? null,
        template_data: {
          ...parsedTemplateData,
          layers,
        },
      }

      if (!templateRow) {
        console.warn('⚠️  No template found, using default layout')
      } else if (!parsedTemplateData?.layers?.length) {
        console.warn('⚠️  Template has no layers, injecting default layout')
      }
    }

    // 2. Resolve base image: direct URL (angled shot) or composite lookup
    let compositeUrl: string
    if (baseImageUrl) {
      // Direct image URL (e.g. angled shot with baked-in background)
      if (!isAllowedUrl(baseImageUrl)) {
        return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
      }
      compositeUrl = baseImageUrl
    } else if (compositeId) {
      const { data: composite } = await supabase
        .from('composites')
        .select('storage_url')
        .eq('id', compositeId)
        .eq('category_id', categoryId)
        .single()
      if (!composite) {
        return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
      }
      compositeUrl = composite?.storage_url || ''
    } else {
      // Get latest composite
      const { data: composites } = await supabase
        .from('composites')
        .select('storage_url')
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
        .limit(1)

      compositeUrl = composites?.[0]?.storage_url || ''
    }

    if (!compositeUrl) {
      return NextResponse.json(
        { error: 'No base image found. Please select an angled shot or generate a composite first.' },
        { status: 400 }
      )
    }

    // 3. Build copy_text for Python script.
    // If per-layer texts were provided (layerTexts map), use those directly.
    // Each key is a layer name; Python resolves text via copy_text.get(layer_name).
    // Fall back to a single copyDoc text for backwards-compat templates.
    let copyText: any = { generated_text: '' }
    if (layerTexts && Object.keys(layerTexts).length > 0) {
      copyText = layerTexts
    } else if (copyDocId) {
      const { data: copyDoc } = await supabase
        .from('copy_docs')
        .select('generated_text, copy_type')
        .eq('id', copyDocId)
        .eq('category_id', categoryId)
        .single()
      if (copyDoc) copyText = copyDoc
    }

    // Validate copy_text field lengths
    const MAX_TEXT_LEN = 1000
    if (copyText && typeof copyText === 'object') {
      for (const [key, val] of Object.entries(copyText)) {
        if (typeof val === 'string' && val.length > MAX_TEXT_LEN) {
          return NextResponse.json(
            { error: `Text field '${key}' exceeds ${MAX_TEXT_LEN} characters` },
            { status: 400 }
          )
        }
      }
    }

    // 4. Get category slug for storage path
    const { data: category } = await supabase
      .from('categories')
      .select('slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .single()

    const categorySlug = category?.slug || 'unknown'

    // 5. Pre-download any brand fonts so Python gets local file paths (not URLs)
    const fontCleanup: string[] = []
    for (const layer of template.template_data.layers || []) {
      if (layer.type === 'text' && layer.font_url) {
        if (!isAllowedUrl(layer.font_url)) {
          console.warn(`Skipping font_url not in allowlist: ${layer.font_url}`)
          continue
        }
        try {
          console.log(`🔤 Pre-downloading font: ${layer.font_url.substring(0, 80)}...`)

          const fetchFont = async (url: string): Promise<Buffer | null> => {
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), 15_000)
            try {
              const res = await fetch(url, {
                signal: ctrl.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                redirect: 'follow',
              })
              clearTimeout(timer)
              if (!res.ok) {
                console.warn(`⚠️ Font download HTTP ${res.status} for: ${url.substring(0, 80)}`)
                return null
              }
              return Buffer.from(await res.arrayBuffer())
            } catch {
              clearTimeout(timer)
              return null
            }
          }

          const isHtml = (buf: Buffer) =>
            buf.slice(0, 200).includes(Buffer.from('<!DOCTYPE')) ||
            buf.slice(0, 200).includes(Buffer.from('<html'))

          // Detect font format from magic bytes; fall back to .ttf
          const detectFontExt = (buf: Buffer): string => {
            if (buf[0] === 0x4F && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4F) return '.otf'
            if (buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x46) return '.woff'
            if (buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x32) return '.woff2'
            return '.ttf'
          }

          let fontBuffer = await fetchFont(layer.font_url)

          // Google Drive may return an HTML confirmation page for font files.
          // Retry with confirm=t and via drive.usercontent.google.com.
          if (fontBuffer && isHtml(fontBuffer)) {
            console.warn(`🔤 Got HTML response, retrying with confirm=t...`)
            const fileIdMatch = layer.font_url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
            if (fileIdMatch) {
              const altUrl = `https://drive.usercontent.google.com/download?id=${fileIdMatch[1]}&export=download&confirm=t`
              fontBuffer = await fetchFont(altUrl)
              if (fontBuffer && isHtml(fontBuffer)) {
                console.warn(`⚠️ Still got HTML from alt URL, font download failed`)
                fontBuffer = null
              }
            } else {
              fontBuffer = null
            }
          }

          if (fontBuffer && fontBuffer.length > 100) {
            const ext = detectFontExt(fontBuffer)
            const fontPath = `/tmp/font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
            const { writeFile } = await import('fs/promises')
            await writeFile(fontPath, fontBuffer)
            console.log(`🔤 Font saved to ${fontPath} (${fontBuffer.length} bytes, format=${ext}) for layer ${layer.name ?? layer.id}`)
            layer.font_path = fontPath  // Python will use this local path
            fontCleanup.push(fontPath)
          } else {
            console.warn(`⚠️ Font download produced no usable bytes for layer ${layer.name ?? layer.id}; font_url will be passed to Python as fallback`)
          }
        } catch (e: any) {
          console.warn(`⚠️ Font download error for layer ${layer.name ?? layer.id}: ${e.message}; font_url will be passed to Python as fallback`)
        }
      }
    }

    // 6. Call Python compositing script
    console.log('🐍 Calling Python compositing script...')

    const inputData = {
      template_data: template.template_data,
      composite_url: compositeUrl,
      copy_text: copyText,
      logo_url: logoUrl,
      format,
      width,
      height,
      output_path: `/tmp/final_asset_${crypto.randomUUID()}.png`
    }

    console.log(`📊 Final asset: template=${inputData.template_data?.layers?.length ?? 0} layers, ${inputData.width}x${inputData.height}`)

    const pythonScript = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')

    const PYTHON_TIMEOUT_MS = 120_000 // 2 minutes

    let python: ChildProcess
    const result = await Promise.race([
      new Promise<string>((resolve, reject) => {
        python = spawn('python3', [pythonScript])
        let stdout = ''
        let stderr = ''

        if (!python.stdin || !python.stdout || !python.stderr) {
          reject(new Error('Failed to open Python stdio streams'))
          return
        }
        python.stdin.write(JSON.stringify(inputData))
        python.stdin.end()

        python.stdout.on('data', (data) => {
          stdout += data.toString()
        })

        python.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        python.on('close', (code) => {
          if (code !== 0) {
            console.error('❌ Python script failed:', stderr)
            console.error('Python script failed. stderr:', stderr)
            reject(new Error('Image processing failed'))
          } else {
            if (stderr) console.log('🐍 Python debug:', stderr)
            console.log('✅ Python script output:', stdout)
            // Parse last line as JSON result
            const lines = stdout.trim().split('\n')
            const resultLine = lines[lines.length - 1]
            try {
              const result = JSON.parse(resultLine)
              resolve(result.output_path)
            } catch (e) {
              resolve(inputData.output_path)
            }
          }
        })
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          python.kill('SIGKILL')
          reject(new Error('Image processing timed out'))
        }, PYTHON_TIMEOUT_MS)
      ),
    ])

    // 6. Upload to Google Drive
    console.log('📤 Uploading final asset to Google Drive...')

    const timestamp = Date.now()
    const formatFolder = format.replace(':', 'x') // '1:1' → '1x1', '16:9' → '16x9'
    const storagePath = `${categorySlug}/final-assets/${formatFolder}/asset_${timestamp}.png`

    // Read the file as a Buffer
    const fileBuffer = await readFile(result)

    const { fileId, publicUrl } = await uploadFile(
      fileBuffer,
      storagePath,
      { provider: 'gdrive' }
    )

    // 7. Save to database
    console.log('💾 Saving to database...')

    const { data: finalAsset, error: insertError } = await supabase
      .from('final_assets')
      .insert({
        category_id: categoryId,
        user_id: user.id,
        template_id: template?.id,
        composite_id: compositeId,
        copy_doc_id: copyDocId,
        name,
        format,
        width,
        height,
        composition_data: {
          layers: template.template_data.layers,
          source_composite: compositeUrl,
          source_copy: copyText.generated_text,
          safe_zones_validated: true,
        },
        storage_provider: 'gdrive',
        storage_path: storagePath,
        storage_url: publicUrl,
        gdrive_file_id: fileId,
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ Database insert failed:', insertError)
      throw insertError
    }

    // 8. Cleanup temp files (output + pre-downloaded fonts)
    await unlink(result).catch(() => {})
    for (const fp of fontCleanup) {
      await unlink(fp).catch(() => {})
    }

    console.log('✅ Final asset generated successfully!')

    return NextResponse.json({
      finalAsset,
      message: 'Final asset generated successfully'
    })

  } catch (error: any) {
    console.error('❌ Error generating final asset:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
