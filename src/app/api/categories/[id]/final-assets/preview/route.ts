// PIL preview endpoint — same compositor as final asset, half resolution, no GDrive upload.
// Returns base64 PNG directly so the frontend can show a pixel-accurate preview.
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { spawn, ChildProcess } from 'child_process'
import { unlink, readFile, writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const ALLOWED_FONT_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'supabase.co',
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

// Half-resolution dimensions — same aspect ratio as final asset, 2x smaller
const PREVIEW_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 540,  height: 540  },
  '16:9': { width: 960,  height: 540  },
  '9:16': { width: 540,  height: 960  },
  '4:5':  { width: 540,  height: 675  },
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params
  const supabase = await createServerSupabaseClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkRateLimit(`preview:${user.id}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before refreshing preview.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

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

    const { width, height } = PREVIEW_DIMENSIONS[format] ?? PREVIEW_DIMENSIONS['1:1']

    const DEFAULT_LAYERS = [
      { id: 'bg', type: 'background', x: 0, y: 0, width: 100, height: 100, z_index: 0 },
      { id: 'text', type: 'text', name: 'tagline', x: 10, y: 80, width: 80, height: 15, z_index: 2, font_size: 48, color: '#000000', text_align: 'center' },
    ]

    const VALID_LAYER_TYPES = ['background', 'product', 'text', 'logo', 'overlay']
    const isValidLayer = (l: any): { ok: boolean; reason?: string } => {
      if (!l || !VALID_LAYER_TYPES.includes(l.type)) return { ok: false, reason: `layer type missing or invalid (got ${l?.type})` }
      if (typeof l.x !== 'number' || Number.isNaN(l.x) || l.x < 0 || l.x > 100) return { ok: false, reason: `layer.x out of range (got ${l.x})` }
      if (typeof l.y !== 'number' || Number.isNaN(l.y) || l.y < 0 || l.y > 100) return { ok: false, reason: `layer.y out of range (got ${l.y})` }
      if (typeof l.width !== 'number' || Number.isNaN(l.width) || l.width <= 0 || l.width > 100) return { ok: false, reason: `layer.width out of range (got ${l.width})` }
      if (typeof l.height !== 'number' || Number.isNaN(l.height) || l.height <= 0 || l.height > 100) return { ok: false, reason: `layer.height out of range (got ${l.height})` }
      return { ok: true }
    }

    let template: { id: string | null; template_data: { layers: any[] } }

    if (customLayers && Array.isArray(customLayers) && customLayers.length > 0) {
      if (customLayers.length > 20) {
        return NextResponse.json({ error: 'Too many layers (max 20)' }, { status: 400 })
      }
      for (let i = 0; i < customLayers.length; i++) {
        const result = isValidLayer(customLayers[i])
        if (!result.ok) {
          return NextResponse.json({ error: `Invalid layer: layer[${i}]: ${result.reason}` }, { status: 400 })
        }
      }
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
      let parsedTemplateData = templateRow?.template_data
      if (typeof parsedTemplateData === 'string') {
        try { parsedTemplateData = JSON.parse(parsedTemplateData) } catch { parsedTemplateData = null }
      }
      const layers = parsedTemplateData?.layers?.length > 0 ? parsedTemplateData.layers : DEFAULT_LAYERS
      template = { id: templateRow?.id ?? null, template_data: { ...parsedTemplateData, layers } }
    }

    // Resolve base image
    let compositeUrl: string
    if (baseImageUrl) {
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
        { error: 'No base image found. Please select a composite or angled shot first.' },
        { status: 400 }
      )
    }

    // Build copy_text
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

    const MAX_TEXT_LEN = 1000
    if (copyText && typeof copyText === 'object') {
      for (const [key, val] of Object.entries(copyText)) {
        if (typeof val === 'string' && val.length > MAX_TEXT_LEN) {
          return NextResponse.json({ error: `Text field '${key}' exceeds ${MAX_TEXT_LEN} characters` }, { status: 400 })
        }
      }
    }

    // Pre-download brand fonts to /tmp/ (same logic as main route)
    const fontCleanup: string[] = []
    for (const layer of template.template_data.layers || []) {
      if (layer.type === 'text' && layer.font_url) {
        if (!isAllowedUrl(layer.font_url)) {
          console.warn(`[preview] Skipping font not in allowlist: ${layer.font_url}`)
          continue
        }
        try {
          const fetchFont = async (url: string): Promise<Buffer | null> => {
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), 15_000)
            try {
              const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
              clearTimeout(timer)
              if (!res.ok) return null
              return Buffer.from(await res.arrayBuffer())
            } catch {
              clearTimeout(timer)
              return null
            }
          }
          const isHtml = (buf: Buffer) =>
            buf.slice(0, 200).includes(Buffer.from('<!DOCTYPE')) || buf.slice(0, 200).includes(Buffer.from('<html'))
          const detectFontExt = (buf: Buffer): string => {
            if (buf[0] === 0x4F && buf[1] === 0x54 && buf[2] === 0x54 && buf[3] === 0x4F) return '.otf'
            if (buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x46) return '.woff'
            if (buf[0] === 0x77 && buf[1] === 0x4F && buf[2] === 0x46 && buf[3] === 0x32) return '.woff2'
            return '.ttf'
          }
          let fontBuffer = await fetchFont(layer.font_url)
          if (fontBuffer && isHtml(fontBuffer)) {
            const fileIdMatch = layer.font_url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
            if (fileIdMatch) {
              const altUrl = `https://drive.usercontent.google.com/download?id=${fileIdMatch[1]}&export=download&confirm=t`
              fontBuffer = await fetchFont(altUrl)
              if (fontBuffer && isHtml(fontBuffer)) fontBuffer = null
            } else {
              fontBuffer = null
            }
          }
          if (fontBuffer && fontBuffer.length > 100) {
            const ext = detectFontExt(fontBuffer)
            const fontPath = `/tmp/font_prev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
            await writeFile(fontPath, fontBuffer)
            layer.font_path = fontPath
            fontCleanup.push(fontPath)
          }
        } catch (e: any) {
          console.warn(`[preview] Font download error: ${e.message}`)
        }
      }
    }

    // Call Python compositor at half resolution
    const outputPath = `/tmp/preview_${crypto.randomUUID()}.png`
    const inputData = {
      template_data: template.template_data,
      composite_url: compositeUrl,
      copy_text: copyText,
      logo_url: logoUrl,
      format,
      width,
      height,
      output_path: outputPath,
    }

    const pythonScript = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')
    const PYTHON_TIMEOUT_MS = 30_000

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
        python.stdout.on('data', (data) => { stdout += data.toString() })
        python.stderr.on('data', (data) => { stderr += data.toString() })
        python.on('close', (code) => {
          if (code !== 0) {
            console.error('[preview] Python failed:', stderr)
            reject(new Error('Preview rendering failed'))
          } else {
            if (stderr) console.log('[preview] Python debug:', stderr)
            const lines = stdout.trim().split('\n')
            const resultLine = lines[lines.length - 1]
            try {
              const r = JSON.parse(resultLine)
              resolve(r.output_path)
            } catch {
              resolve(outputPath)
            }
          }
        })
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          python.kill('SIGKILL')
          reject(new Error('Preview rendering timed out'))
        }, PYTHON_TIMEOUT_MS)
      ),
    ])

    // Read output PNG and return as base64
    const fileBuffer = await readFile(result)
    const previewData = `data:image/png;base64,${fileBuffer.toString('base64')}`

    // Cleanup
    await unlink(result).catch(() => {})
    for (const fp of fontCleanup) {
      await unlink(fp).catch(() => {})
    }

    return NextResponse.json({ previewData })

  } catch (error: any) {
    console.error('[preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
