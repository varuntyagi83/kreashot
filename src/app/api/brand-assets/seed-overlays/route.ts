import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

// Each overlay is a transparent PNG (1080×1080) generated from an SVG.
// White strokes/fills so they work on any background colour.

const OVERLAYS: { name: string; svg: string }[] = [
  {
    name: 'Dashed Circle Arrow',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <!-- Dashed ring -->
  <circle cx="540" cy="540" r="360" fill="none" stroke="white" stroke-width="2.5"
    stroke-dasharray="14 9" opacity="0.95"/>
  <!-- Arrow tip right -->
  <polyline points="900,528 912,540 900,552" fill="none" stroke="white" stroke-width="2.5"
    stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Arrow tip left -->
  <polyline points="180,552 168,540 180,528" fill="none" stroke="white" stroke-width="2.5"
    stroke-linejoin="round" stroke-linecap="round"/>
</svg>`,
  },
  {
    name: 'Thin Circle Ring',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <circle cx="540" cy="540" r="380" fill="none" stroke="white" stroke-width="1.5" opacity="0.8"/>
</svg>`,
  },
  {
    name: 'Double Concentric Rings',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <circle cx="540" cy="540" r="420" fill="none" stroke="white" stroke-width="1.5" opacity="0.5"/>
  <circle cx="540" cy="540" r="340" fill="none" stroke="white" stroke-width="1" opacity="0.35"/>
</svg>`,
  },
  {
    name: 'Corner Brackets',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <!-- Top-left -->
  <path d="M 80 200 L 80 80 L 200 80" fill="none" stroke="white" stroke-width="3"
    stroke-linecap="square"/>
  <!-- Top-right -->
  <path d="M 880 80 L 1000 80 L 1000 200" fill="none" stroke="white" stroke-width="3"
    stroke-linecap="square"/>
  <!-- Bottom-left -->
  <path d="M 80 880 L 80 1000 L 200 1000" fill="none" stroke="white" stroke-width="3"
    stroke-linecap="square"/>
  <!-- Bottom-right -->
  <path d="M 1000 880 L 1000 1000 L 880 1000" fill="none" stroke="white" stroke-width="3"
    stroke-linecap="square"/>
</svg>`,
  },
  {
    name: 'Dot Grid',
    svg: (() => {
      const dots: string[] = []
      const spacing = 90
      const r = 2.5
      for (let col = 1; col <= 11; col++) {
        for (let row = 1; row <= 11; row++) {
          dots.push(
            `<circle cx="${col * spacing}" cy="${row * spacing}" r="${r}" fill="white" opacity="0.45"/>`
          )
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">${dots.join('')}</svg>`
    })(),
  },
  {
    name: 'Diagonal Lines',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <pattern id="diag" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <line x1="0" y1="40" x2="40" y2="0" stroke="white" stroke-width="1" opacity="0.25"/>
    </pattern>
  </defs>
  <rect width="1080" height="1080" fill="url(#diag)"/>
</svg>`,
  },
  {
    name: 'Minimal Frame',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect x="40" y="40" width="1000" height="1000" fill="none" stroke="white"
    stroke-width="1.5" opacity="0.5"/>
  <rect x="70" y="70" width="940" height="940" fill="none" stroke="white"
    stroke-width="0.75" opacity="0.25"/>
</svg>`,
  },
  {
    name: 'Cross Lines',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <!-- Horizontal centre line -->
  <line x1="0" y1="540" x2="1080" y2="540" stroke="white" stroke-width="1" opacity="0.3"/>
  <!-- Vertical centre line -->
  <line x1="540" y1="0" x2="540" y2="1080" stroke="white" stroke-width="1" opacity="0.3"/>
  <!-- Small centre cross markers -->
  <line x1="520" y1="540" x2="560" y2="540" stroke="white" stroke-width="2.5" opacity="0.8"/>
  <line x1="540" y1="520" x2="540" y2="560" stroke="white" stroke-width="2.5" opacity="0.8"/>
</svg>`,
  },
]

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: { name: string; status: 'created' | 'skipped' | 'error'; error?: string }[] = []

    for (const overlay of OVERLAYS) {
      // Skip if already seeded (check by name + user)
      const { data: existing } = await supabase
        .from('brand_assets')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', overlay.name)
        .eq('asset_type', 'overlay')
        .maybeSingle()

      if (existing) {
        results.push({ name: overlay.name, status: 'skipped' })
        continue
      }

      try {
        // Upload SVG directly — sharp SVG→PNG conversion requires librsvg which is not
        // available on all Railway/Docker environments. SVGs work in Fabric.js canvas
        // and the <img> preview. PIL overlay rendering falls back to skipping SVG layers.
        const svgBuffer = Buffer.from(overlay.svg, 'utf-8')
        const fileName = `${uuidv4()}.svg`
        const filePath = `${user.id}/${fileName}`

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('brand-assets')
          .upload(filePath, svgBuffer, {
            contentType: 'image/svg+xml',
            upsert: false,
          })

        if (uploadError) throw new Error(uploadError.message)

        const {
          data: { publicUrl },
        } = supabase.storage.from('brand-assets').getPublicUrl(filePath)

        // Insert DB record
        const { data: brandAsset, error: dbError } = await supabase
          .from('brand_assets')
          .insert({
            user_id: user.id,
            name: overlay.name,
            asset_type: 'overlay',
            storage_path: filePath,
            storage_url: publicUrl,
            metadata: {
              file_name: fileName,
              file_size: svgBuffer.length,
              file_type: 'image/svg+xml',
              seeded: true,
            },
          })
          .select('id')
          .single()

        if (dbError) {
          await supabase.storage.from('brand-assets').remove([filePath])
          throw new Error(dbError.message)
        }

        // asset_references entry
        const slug = generateSlug(overlay.name)
        await supabase.from('asset_references').insert({
          user_id: user.id,
          category_id: null,
          reference_id: `@global/overlay/${slug}`,
          asset_type: 'brand_asset',
          asset_table_id: brandAsset.id,
          storage_url: publicUrl,
          display_name: overlay.name,
          searchable_text: `${overlay.name} overlay ${slug}`,
        })

        results.push({ name: overlay.name, status: 'created' })
      } catch (err: any) {
        results.push({ name: overlay.name, status: 'error', error: err.message })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Seeded ${created} overlays (${skipped} already existed, ${errors} errors)`,
      results,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
