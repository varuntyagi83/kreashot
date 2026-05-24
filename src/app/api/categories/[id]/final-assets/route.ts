// Extend route timeout for Python compositor + GCS upload
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile } from '@/lib/storage'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { spawn, ChildProcess } from 'child_process'
import { unlink, readFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

function sanitizeTextLayer(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, 2000)
}

const ALLOWED_FONT_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'storage.googleapis.com',
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
  const { id: categoryId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const rateLimit = await checkRateLimit(`list-final-assets:${user.id}`, 100, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a minute.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const format = request.nextUrl.searchParams.get('format') || undefined

    const finalAssets = await prisma.finalAsset.findMany({
      where: { categoryId, ...(format ? { format } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000, // defensive bound against unbounded growth per category
    })

    return NextResponse.json({ finalAssets })
  } catch (error: any) {
    console.error('[final-assets GET] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Generate new final asset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: categoryId } = await params

  try {
    const ctx = await requireSession()
    if (ctx instanceof NextResponse) return ctx
    const { user, companyId } = ctx

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    })
    if (!company) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = await checkRateLimit(`final-assets:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const planCheck = await checkPlanLimit(companyId, 'final_asset', 1)
    if (!planCheck.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached for your plan (${planCheck.used}/${planCheck.limit} final assets today). Upgrade to generate more.` },
        { status: 402 }
      )
    }

    const ownedCategory = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true, slug: true },
    })

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

    if (!name || name.length > 200) {
      return NextResponse.json(
        { error: 'name is required and must be 200 characters or fewer' },
        { status: 400 }
      )
    }

    // Fast path: save a previously generated preview to the gallery
    if (body.savePreview) {
      const sp = body.savePreview as {
        storageUrl: string; storagePath: string; gdriveFileId: string
        name: string; format: string; width: number; height: number
        compositeId?: string; copyDocId?: string; templateId?: string
        compositionData: object
      }
      if (!sp.storageUrl || !sp.storagePath || !sp.gdriveFileId) {
        return NextResponse.json({ error: 'Invalid save data' }, { status: 400 })
      }

      const sanitizedName = sanitizeCompanyName(company.name)
      if (!sp.storagePath.startsWith(`${sanitizedName}/${company.slug}/`) && !sp.storagePath.startsWith(`${company.slug}/`)) {
        return NextResponse.json({ error: 'Storage path does not belong to this company' }, { status: 403 })
      }

      const savedAsset = await prisma.finalAsset.create({
        data: {
          categoryId,
          userId: user.id,
          companyId,
          compositeId: sp.compositeId ?? null,
          copyDocId: sp.copyDocId ?? null,
          name: sp.name,
          format: sp.format,
          storageProvider: 'gcs',
          storagePath: sp.storagePath,
          storageUrl: sp.storageUrl,
          gdriveFileId: sp.gdriveFileId,
          metadata: { width: sp.width, height: sp.height, compositionData: sp.compositionData, templateId: sp.templateId ?? null },
        },
      })

      return NextResponse.json({ finalAsset: savedAsset, message: 'Final asset saved to gallery' })
    }

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

    console.log('Generating final asset for category:', categoryId, `(${format} ${width}x${height})`)

    const VALID_LAYER_TYPES = ['background', 'product', 'text', 'logo', 'overlay']
    const isValidLayer = (l: any): { ok: boolean; reason?: string } => {
      if (!l || !VALID_LAYER_TYPES.includes(l.type)) return { ok: false, reason: `layer type missing or invalid (got ${l?.type})` }
      if (typeof l.x !== 'number' || Number.isNaN(l.x) || l.x < 0 || l.x > 100) return { ok: false, reason: `layer.x must be number 0-100 (got ${l.x})` }
      if (typeof l.y !== 'number' || Number.isNaN(l.y) || l.y < 0 || l.y > 100) return { ok: false, reason: `layer.y must be number 0-100 (got ${l.y})` }
      if (typeof l.width !== 'number' || Number.isNaN(l.width) || l.width <= 0 || l.width > 100) return { ok: false, reason: `layer.width must be number 1-100 (got ${l.width})` }
      if (typeof l.height !== 'number' || Number.isNaN(l.height) || l.height <= 0 || l.height > 100) return { ok: false, reason: `layer.height must be number 1-100 (got ${l.height})` }
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
          return NextResponse.json({ error: `Invalid layer structure: layer[${i}] (type=${customLayers[i]?.type}): ${result.reason}` }, { status: 400 })
        }
      }
      template = { id: null, template_data: { layers: customLayers } }
    } else {
      let templateRow: any = null
      if (templateId) {
        templateRow = await prisma.template.findFirst({
          where: { id: templateId, categoryId },
        })
        if (!templateRow) console.warn('Specified templateId not found, falling back to category template')
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

      template = {
        id: templateRow?.id ?? null,
        template_data: { ...parsedTemplateData, layers },
      }

      if (!templateRow) {
        console.warn('No template found, using default layout')
      } else if (!parsedTemplateData?.layers?.length) {
        console.warn('Template has no layers, injecting default layout')
      }
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
        select: { storageUrl: true, gdriveFileId: true },
      })
      if (!composite) {
        return NextResponse.json({ error: 'Composite not found' }, { status: 404 })
      }
      compositeUrl = composite.gdriveFileId
        ? `https://drive.usercontent.google.com/download?id=${composite.gdriveFileId}&export=download`
        : composite.storageUrl || ''
    } else {
      const latest = await prisma.composite.findFirst({
        where: { categoryId },
        orderBy: { createdAt: 'desc' },
        select: { storageUrl: true, gdriveFileId: true },
      })
      compositeUrl = latest?.gdriveFileId
        ? `https://drive.usercontent.google.com/download?id=${latest.gdriveFileId}&export=download`
        : latest?.storageUrl || ''
    }

    if (!compositeUrl) {
      return NextResponse.json(
        { error: 'No base image found. Please select an angled shot or generate a composite first.' },
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
          return NextResponse.json(
            { error: `Text field '${key}' exceeds ${MAX_TEXT_LEN} characters` },
            { status: 400 }
          )
        }
      }
    }

    const categorySlug = ownedCategory.slug

    // Pre-download brand fonts
    const fontCleanup: string[] = []
    for (const layer of template.template_data.layers || []) {
      if (layer.type === 'text' && layer.font_url) {
        if (!isAllowedUrl(layer.font_url)) {
          console.warn(`Skipping font_url not in allowlist: ${layer.font_url}`)
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
            if (ext === '.woff2') {
              console.warn(`WOFF2 font detected for layer ${layer.name ?? layer.id} — PIL does not support WOFF2. Skipping.`)
              continue
            }
            const fontPath = `/tmp/font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
            const { writeFile } = await import('fs/promises')
            await writeFile(fontPath, fontBuffer)
            layer.font_path = fontPath
            fontCleanup.push(fontPath)
          }
        } catch (e: any) {
          console.warn(`Font download error for layer ${layer.name ?? layer.id}: ${e.message}`)
        }
      }
    }

    // Call Python compositing script
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

    console.log(`Final asset: ${inputData.template_data?.layers?.length ?? 0} layers, ${inputData.width}x${inputData.height}`)

    const pythonScript = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')
    const PYTHON_TIMEOUT_MS = 120_000

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
            console.error('Python script failed:', stderr)
            reject(new Error('Image processing failed'))
          } else {
            if (stderr) console.log('Python debug:', stderr)
            const lines = stdout.trim().split('\n')
            const resultLine = lines[lines.length - 1]
            try {
              const r = JSON.parse(resultLine)
              resolve(r.output_path)
            } catch {
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

    // Upload to GCS
    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const timestamp = Date.now()
    const formatFolder = format.replace(':', 'x')
    const storagePath = `${sanitizedCompanyName}/${company.slug}/${categorySlug}/final-assets/${formatFolder}/asset_${timestamp}.png`

    const fileBuffer = await readFile(result)

    const { fileId, publicUrl } = await uploadFile(
      fileBuffer,
      storagePath,
      { provider: 'gcs' }
    )

    // Preview mode: return without saving to gallery
    if (body.preview === true) {
      await unlink(result).catch(() => {})
      for (const fp of fontCleanup) { await unlink(fp).catch(() => {}) }
      return NextResponse.json({
        isPreview: true,
        preview: {
          storageUrl: publicUrl,
          storagePath,
          gdriveFileId: fileId,
          name,
          format,
          width,
          height,
          compositeId: compositeId ?? null,
          copyDocId: copyDocId ?? null,
          templateId: template.id ?? null,
          compositionData: {
            layers: template.template_data.layers,
            source_composite: compositeUrl,
            source_copy: typeof copyText === 'object' && 'generated_text' in copyText
              ? (copyText as any).generated_text
              : null,
            safe_zones_validated: true,
          },
        },
      })
    }

    // Save to database
    const finalAsset = await prisma.finalAsset.create({
      data: {
        categoryId,
        userId: user.id,
        companyId,
        compositeId: compositeId ?? null,
        copyDocId: copyDocId ?? null,
        name,
        format,
        storageProvider: 'gcs',
        storagePath,
        storageUrl: publicUrl,
        gdriveFileId: fileId ?? null,
        metadata: {
          templateId: template?.id ?? null,
          width,
          height,
          compositionData: {
            layers: template.template_data.layers,
            source_composite: compositeUrl,
            source_copy: typeof copyText === 'object' ? (copyText as any).generated_text ?? null : null,
            safe_zones_validated: true,
          },
        },
      },
    })

    await unlink(result).catch(() => {})
    for (const fp of fontCleanup) { await unlink(fp).catch(() => {}) }

    console.log('Final asset generated successfully!')

    return NextResponse.json({ finalAsset, message: 'Final asset generated successfully' })

  } catch (error: any) {
    console.error('Error generating final asset:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
