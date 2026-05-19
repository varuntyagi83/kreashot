// PIL preview endpoint — same compositor as final asset, half resolution, no GDrive upload.
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/rate-limit'
import { spawn, ChildProcess } from 'child_process'
import { unlink, readFile, writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

function sanitizeTextLayer(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 2000)
}

const ALLOWED_FONT_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
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

const PREVIEW_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 540,  height: 540  },
  '16:9': { width: 960,  height: 540  },
  '9:16': { width: 540,  height: 960  },
  '4:5':  { width: 540,  height: 675  },
}

const REFERENCE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1':  { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:5':  { width: 1080, height: 1350 },
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`preview:${user.id}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before refreshing preview.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const ownedCategory = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })

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
        templateRow = await prisma.template.findFirst({
          where: { id: templateId, categoryId },
        })
      }
      if (!templateRow) {
        templateRow = await prisma.template.findFirst({
          where: { categoryId },
          orderBy: { createdAt: 'desc' },
        })
      }
      let parsedTemplateData = templateRow?.templateData
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
      const composite = await prisma.composite.findFirst({
        where: { id: compositeId, categoryId },
        select: { storageUrl: true },
      })
      if (!composite) {
        return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
      }
      compositeUrl = composite.storageUrl || ''
    } else {
      const latest = await prisma.composite.findFirst({
        where: { categoryId },
        orderBy: { createdAt: 'desc' },
        select: { storageUrl: true },
      })
      compositeUrl = latest?.storageUrl || ''
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
      const sanitized: Record<string, string> = {}
      for (const [k, v] of Object.entries(layerTexts)) {
        sanitized[k] = typeof v === 'string' ? sanitizeTextLayer(v) : String(v)
      }
      copyText = sanitized
    } else if (copyDocId) {
      const copyDoc = await prisma.copyDoc.findFirst({
        where: { id: copyDocId, categoryId },
        select: { generatedText: true, copyType: true },
      })
      if (copyDoc) copyText = { generated_text: copyDoc.generatedText, copy_type: copyDoc.copyType }
    }

    const MAX_TEXT_LEN = 1000
    if (copyText && typeof copyText === 'object') {
      for (const [key, val] of Object.entries(copyText)) {
        if (typeof val === 'string' && val.length > MAX_TEXT_LEN) {
          return NextResponse.json({ error: `Text field '${key}' exceeds ${MAX_TEXT_LEN} characters` }, { status: 400 })
        }
      }
    }

    // Pre-download brand fonts
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

    // Scale font sizes from full-resolution to preview resolution
    const refDims = REFERENCE_DIMENSIONS[format] ?? REFERENCE_DIMENSIONS['1:1']
    const fontScale = height / refDims.height
    const scaledLayers = (template.template_data.layers || []).map((layer: any) => {
      if (layer.type === 'text' && typeof layer.font_size === 'number') {
        return { ...layer, font_size: Math.max(1, Math.round(layer.font_size * fontScale)) }
      }
      return layer
    })
    const scaledTemplateData = { ...template.template_data, layers: scaledLayers }

    const outputPath = `/tmp/preview_${crypto.randomUUID()}.png`
    const inputData = {
      template_data: scaledTemplateData,
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

    const fileBuffer = await readFile(result)
    const previewData = `data:image/png;base64,${fileBuffer.toString('base64')}`

    await unlink(result).catch(() => {})
    for (const fp of fontCleanup) { await unlink(fp).catch(() => {}) }

    return NextResponse.json({ previewData })

  } catch (error: any) {
    console.error('[preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
