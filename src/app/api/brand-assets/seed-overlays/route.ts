import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Resvg } from '@resvg/resvg-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { getCompanyId } from '@/lib/get-company'

// Each overlay is a transparent PNG generated from an SVG via Resvg (Rust/WASM renderer).
// Stored as data:image/png;base64,… so Python/PIL can composite them directly.
// White strokes/fills so they work on any background colour.

function svgToPngDataUrl(svg: string): string {
  const resvg = new Resvg(svg)
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  return `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`
}

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
    name: 'Vertical Line',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <!-- Thin vertical separator line — 3pt as per brand guidelines -->
  <line x1="540" y1="0" x2="540" y2="1920" stroke="white" stroke-width="3" opacity="0.85"/>
</svg>`,
  },
  {
    name: 'Horizontal Line',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <!-- Thin horizontal separator line — 3pt as per brand guidelines -->
  <line x1="0" y1="540" x2="1080" y2="540" stroke="white" stroke-width="3" opacity="0.85"/>
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

    const companyId = await getCompanyId(supabase, user.id)
    if (!companyId) return NextResponse.json({ error: 'No company found' }, { status: 403 })

    const rateLimit = checkRateLimit(`seed-overlays:${user.id}`, 10, 60_000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before seeding more overlays.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } }
      )
    }

    const results: { name: string; status: 'created' | 'updated' | 'skipped' | 'error'; error?: string }[] = []

    for (const overlay of OVERLAYS) {
      // Convert SVG → PNG so Python/PIL can composite it
      let pngDataUrl: string
      try {
        pngDataUrl = svgToPngDataUrl(overlay.svg)
      } catch (err: any) {
        results.push({ name: overlay.name, status: 'error', error: `SVG→PNG conversion failed: ${err.message}` })
        continue
      }

      // Check if already seeded
      const { data: existing } = await supabase
        .from('brand_assets')
        .select('id, storage_url')
        .eq('company_id', companyId)
        .eq('name', overlay.name)
        .eq('asset_type', 'overlay')
        .maybeSingle()

      if (existing) {
        // If stored as SVG, upgrade to PNG so the Python compositor can render it
        if (existing.storage_url?.includes('image/svg')) {
          try {
            await supabase
              .from('brand_assets')
              .update({ storage_url: pngDataUrl, metadata: { file_type: 'image/png', seeded: true } })
              .eq('id', existing.id)

            await supabase
              .from('asset_references')
              .update({ storage_url: pngDataUrl })
              .eq('asset_table_id', existing.id)

            results.push({ name: overlay.name, status: 'updated' })
          } catch (err: any) {
            results.push({ name: overlay.name, status: 'error', error: `Update failed: ${err.message}` })
          }
        } else {
          results.push({ name: overlay.name, status: 'skipped' })
        }
        continue
      }

      try {
        // Insert DB record with PNG data URL
        const { data: brandAsset, error: dbError } = await supabase
          .from('brand_assets')
          .insert({
            user_id: user.id,
            company_id: companyId,
            name: overlay.name,
            asset_type: 'overlay',
            storage_path: `data/overlay/${generateSlug(overlay.name)}`,
            storage_url: pngDataUrl,
            metadata: {
              file_type: 'image/png',
              seeded: true,
            },
          })
          .select('id')
          .single()

        if (dbError) throw new Error(dbError.message)

        // asset_references entry
        const slug = generateSlug(overlay.name)
        await supabase.from('asset_references').insert({
          user_id: user.id,
          company_id: companyId,
          category_id: null,
          reference_id: `@global/overlay/${slug}`,
          asset_type: 'brand_asset',
          asset_table_id: brandAsset.id,
          storage_url: pngDataUrl,
          display_name: overlay.name,
          searchable_text: `${overlay.name} overlay ${slug}`,
        })

        results.push({ name: overlay.name, status: 'created' })
      } catch (err: any) {
        results.push({ name: overlay.name, status: 'error', error: err.message })
      }
    }

    const created = results.filter((r) => r.status === 'created').length
    const updated = results.filter((r) => r.status === 'updated').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Seeded ${created} overlays, upgraded ${updated} SVG→PNG (${skipped} already up-to-date, ${errors} errors)`,
      results,
    })
  } catch (error: any) {
    console.error('[seed-overlays POST] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
