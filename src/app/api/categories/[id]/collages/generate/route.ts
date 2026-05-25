export const maxDuration = 300

import { checkRateLimit } from '@/lib/rate-limit'
import { checkPlanLimit } from '@/lib/plan-limits'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/session'
import { uploadFile } from '@/lib/storage'
import { spawn } from 'child_process'
import { unlink, readFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { sanitizeCompanyName } from '@/lib/sanitize-company-name'

const ALLOWED_LAYER_URL_DOMAINS = [
  'lh3.googleusercontent.com',
  'drive.google.com',
  'drive.usercontent.google.com',
  'storage.googleapis.com',
]

function isAllowedUrl(url: string): boolean {
  if (!url) return false
  if (url.startsWith('data:')) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    return ALLOWED_LAYER_URL_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))
  } catch {
    return false
  }
}

// POST - Generate (render) a collage into a final image
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

    const rateLimit = await checkRateLimit(`collage-gen:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const planCheck = await checkPlanLimit(companyId, 'collage', 1)
    if (!planCheck.allowed) {
      return NextResponse.json(
        { error: `Daily limit reached for your plan (${planCheck.used}/${planCheck.limit} collages today). Upgrade to generate more.` },
        { status: 402 }
      )
    }

    const body = await request.json()
    const { collageId } = body

    if (!collageId) {
      return NextResponse.json({ error: 'collageId is required' }, { status: 400 })
    }

    const collage = await prisma.collage.findFirst({
      where: { id: collageId, categoryId, companyId },
    })

    if (!collage) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const meta = collage.metadata as any
    const collageData = typeof meta?.collageData === 'string'
      ? JSON.parse(meta.collageData)
      : meta?.collageData || {}

    const layers = collageData?.layers || []
    if (layers.length === 0) {
      return NextResponse.json({ error: 'Collage has no layers to render' }, { status: 400 })
    }

    const collageWidth = meta?.width || 1080
    const collageHeight = meta?.height || 1080
    console.log(`Generating collage "${collage.name}" (${collage.format} ${collageWidth}x${collageHeight}) with ${layers.length} layers`)

    const hasBackgroundLayer = layers.some((l: any) => l.type === 'background')
    const effectiveLayers = hasBackgroundLayer
      ? layers
      : [
          {
            id: '_collage_bg',
            type: 'background_color',
            background_color: collageData.background_color || '#FFFFFF',
            x: 0, y: 0, width: 100, height: 100, z_index: -1,
          },
          ...layers,
        ]

    const MAX_LAYER_TEXT = 500
    for (const layer of (effectiveLayers || [])) {
      if (typeof layer.text_content === 'string' && layer.text_content.length > MAX_LAYER_TEXT) {
        return NextResponse.json({ error: `Layer text_content exceeds ${MAX_LAYER_TEXT} characters` }, { status: 400 })
      }
      if (typeof layer.name === 'string' && layer.name.length > 100) {
        return NextResponse.json({ error: 'Layer name must be 100 characters or fewer' }, { status: 400 })
      }
    }

    const VALID_COLLAGE_LAYER_TYPES = ['image', 'text', 'overlay', 'background', 'background_color']
    const validatedLayers = effectiveLayers.filter((layer: any) => {
      if (!VALID_COLLAGE_LAYER_TYPES.includes(layer?.type)) {
        console.warn(`Skipping layer with invalid type: ${layer?.type}`)
        return false
      }
      if (typeof layer.source_url === 'string' && !isAllowedUrl(layer.source_url)) {
        console.warn(`Skipping layer with disallowed source_url: ${layer.source_url}`)
        return false
      }
      return true
    })

    const copyText: Record<string, string> = {}
    for (const layer of layers) {
      if (layer.type === 'text' && layer.name) {
        copyText[layer.name] = layer.text_content || ''
      }
    }

    const outputPath = `/tmp/collage_${crypto.randomUUID()}.png`

    const inputData = {
      template_data: { layers: validatedLayers },
      composite_url: '',
      copy_text: copyText,
      logo_url: null,
      width: collageWidth,
      height: collageHeight,
      output_path: outputPath,
    }

    const pythonScript = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')
    const PYTHON_TIMEOUT_MS = 120_000

    let python: ReturnType<typeof spawn>
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
            const lines = stdout.trim().split('\n')
            const resultLine = lines[lines.length - 1]
            try {
              const parsed = JSON.parse(resultLine)
              resolve(parsed.output_path)
            } catch {
              resolve(outputPath)
            }
          }
        })
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          python.kill('SIGKILL')
          reject(new Error('Collage generation timed out'))
        }, PYTHON_TIMEOUT_MS)
      ),
    ])

    // Upload to GCS
    const category = await prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { slug: true },
    })

    const sanitizedCompanyName = sanitizeCompanyName(company.name)
    const categorySlug = category?.slug || 'unknown'
    const timestamp = Date.now()
    const formatFolder = collage.format.replace(':', 'x')
    const storagePath = `${sanitizedCompanyName}/${company.slug}/${categorySlug}/collages/${formatFolder}/collage_${timestamp}.png`

    const fileBuffer = await readFile(result)

    const { publicUrl } = await uploadFile(fileBuffer, storagePath, { provider: 'gcs' })

    let updated: any
    try {
      updated = await prisma.collage.update({
        where: { id: collageId },
        data: {
          storageProvider: 'gcs',
          storagePath,
          storageUrl: publicUrl,
          gdriveFileId: null,
        },
      })
    } finally {
      await unlink(result).catch(() => {})
    }

    console.log('Collage generated successfully!')

    return NextResponse.json({
      collage: updated,
      message: 'Collage generated successfully',
    })
  } catch (error: any) {
    console.error('Error generating collage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
