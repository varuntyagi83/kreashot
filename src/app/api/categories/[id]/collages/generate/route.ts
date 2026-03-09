export const maxDuration = 300

import { checkRateLimit } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage'
import { spawn } from 'child_process'
import { unlink, readFile } from 'fs/promises'
import path from 'path'

// POST - Generate (render) a collage into a final image
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

    const rateLimit = checkRateLimit(`collage-gen:${user.id}`, 5, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before generating more.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = await request.json()
    const { collageId } = body

    if (!collageId) {
      return NextResponse.json({ error: 'collageId is required' }, { status: 400 })
    }

    // 1. Fetch the collage design
    const { data: collage, error: fetchError } = await supabase
      .from('collages')
      .select('*')
      .eq('id', collageId)
      .eq('category_id', categoryId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !collage) {
      return NextResponse.json({ error: 'Collage not found' }, { status: 404 })
    }

    const collageData = typeof collage.collage_data === 'string'
      ? JSON.parse(collage.collage_data)
      : collage.collage_data

    const layers = collageData?.layers || []
    if (layers.length === 0) {
      return NextResponse.json({ error: 'Collage has no layers to render' }, { status: 400 })
    }

    console.log(`🎨 Generating collage "${collage.name}" (${collage.format} ${collage.width}x${collage.height}) with ${layers.length} layers`)

    // 2. Build input for the PIL script.
    // The script expects template_data with layers. For collage, we pass
    // layers directly — the script handles background, text, overlay, and
    // the new 'image' layer type.
    // We inject a synthetic background layer if collage has a background_color
    // but no explicit background layer.
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
    const sanitizedLayers = effectiveLayers || []

    const VALID_COLLAGE_LAYER_TYPES = ['image', 'text', 'overlay', 'background', 'background_color']
    const validatedLayers = sanitizedLayers.filter((layer: any) => {
      if (!VALID_COLLAGE_LAYER_TYPES.includes(layer?.type)) {
        console.warn(`Skipping layer with invalid type: ${layer?.type}`)
        return false
      }
      return true
    })

    // Build copy_text from text layers (keyed by layer name)
    const copyText: Record<string, string> = {}
    for (const layer of layers) {
      if (layer.type === 'text' && layer.name) {
        copyText[layer.name] = layer.text_content || ''
      }
    }

    const outputPath = `/tmp/collage_${Date.now()}.png`

    const inputData = {
      template_data: { layers: validatedLayers },
      composite_url: '',  // no composite — images come from layer source_urls
      copy_text: copyText,
      logo_url: null,
      width: collage.width,
      height: collage.height,
      output_path: outputPath,
    }

    // 3. Call Python compositing script
    console.log('🐍 Calling Python compositing script for collage...')

    const pythonScript = path.join(process.cwd(), 'scripts', 'composite_final_asset.py')

    const PYTHON_TIMEOUT_MS = 120_000 // 2 minutes

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
            console.error('❌ Python script failed:', stderr)
            reject(new Error(`Python script failed: ${stderr}`))
          } else {
            console.log('✅ Python script output:', stdout)
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

    // 4. Upload to Google Drive
    console.log('📤 Uploading collage to Google Drive...')

    const { data: category } = await supabase
      .from('categories')
      .select('slug')
      .eq('id', categoryId)
      .single()

    const categorySlug = category?.slug || 'unknown'
    const timestamp = Date.now()
    const formatFolder = collage.format.replace(':', 'x')
    const storagePath = `${categorySlug}/collages/${formatFolder}/collage_${timestamp}.png`

    const fileBuffer = await readFile(result)

    const { fileId, publicUrl } = await uploadFile(
      fileBuffer,
      storagePath,
      { provider: 'gdrive' }
    )

    // 5. Update collage record with generated output
    const { data: updated, error: updateError } = await supabase
      .from('collages')
      .update({
        storage_provider: 'gdrive',
        storage_path: storagePath,
        storage_url: publicUrl,
        gdrive_file_id: fileId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', collageId)
      .select()
      .single()

    if (updateError) {
      console.error('❌ Database update failed:', updateError)
      throw updateError
    }

    // 6. Cleanup temp file
    await unlink(result).catch(() => {})

    console.log('✅ Collage generated successfully!')

    return NextResponse.json({
      collage: updated,
      message: 'Collage generated successfully',
    })
  } catch (error: any) {
    console.error('❌ Error generating collage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
