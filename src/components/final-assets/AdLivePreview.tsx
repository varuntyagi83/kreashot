'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getFormatDimensions } from '@/lib/formats'
import type { AdLayoutPreset, OverlaySpec } from '@/lib/ad-layouts'

interface FreeformTextLayer {
  id: string
  text: string
  x: number
  y: number
  width: number
  fontSize: number
  fontFamily: string
  fontUrl?: string
  color: string
  align: 'left' | 'center' | 'right'
}

interface AdLivePreviewProps {
  baseImageUrl: string | null
  logoUrl?: string | null
  // Preset mode
  preset?: AdLayoutPreset
  headline?: string
  subline?: string
  // Freeform mode
  freeformLayers?: FreeformTextLayer[]
  freeformLogoX?: number
  freeformLogoY?: number
  freeformLogoSize?: number
  freeformLogoPosition?: string
  darkenImage?: boolean
  format?: string
  fontFamily?: string
  fontUrl?: string        // storage URL for the selected brand font (preset mode)
  presetLogoSize?: number // override preset's default logo size (% of canvas width)
}

/** Compute absolute CSS style for an overlay spec given container size. */
function getOverlayStyle(
  overlay: OverlaySpec,
  containerW: number,
  containerH: number,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: `rgba(0,0,0,${overlay.opacity})`,
    pointerEvents: 'none',
  }
  const h = overlay.height ?? 30
  const w = overlay.width ?? 100

  switch (overlay.type) {
    case 'strip-bottom':
      return { ...base, left: 0, bottom: 0, width: '100%', height: `${h}%` }
    case 'strip-top':
      return { ...base, left: 0, top: 0, width: '100%', height: `${h}%` }
    case 'strip-center': {
      const topPct = (100 - h) / 2
      return { ...base, left: 0, top: `${topPct}%`, width: `${w}%`, height: `${h}%` }
    }
    case 'badge-center': {
      const topPct = (100 - h) / 2
      const leftPct = (100 - w) / 2
      return { ...base, left: `${leftPct}%`, top: `${topPct}%`, width: `${w}%`, height: `${h}%`, borderRadius: '8px' }
    }
    case 'full-darken':
      return { ...base, left: 0, top: 0, width: '100%', height: '100%' }
    default:
      return { ...base, display: 'none' }
  }
}

const REF_CANVAS_WIDTH = 1080

export function AdLivePreview({
  baseImageUrl,
  logoUrl,
  preset,
  headline,
  subline,
  freeformLayers,
  freeformLogoX,
  freeformLogoY,
  freeformLogoSize = 12,
  freeformLogoPosition = 'top-left',
  darkenImage,
  format = '1:1',
  fontFamily = 'Arial',
  fontUrl,
  presetLogoSize,
}: AdLivePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(400)
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w && w > 0) setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reset natural size when base image changes
  useEffect(() => {
    setImageNaturalSize(null)
  }, [baseImageUrl])

  // Collect all custom font URLs (preset + freeform layers) and map each to a CSS family name
  const fontUrlsToLoad = useMemo(() => {
    const urls: string[] = []
    if (fontUrl) urls.push(fontUrl)
    freeformLayers?.forEach(l => { if (l.fontUrl?.startsWith('http')) urls.push(l.fontUrl) })
    return [...new Set(urls)]
  }, [fontUrl, freeformLayers])

  const urlToFamily = useMemo(
    () => Object.fromEntries(fontUrlsToLoad.map((url, i) => [url, `KreashotFont-${i}`])),
    [fontUrlsToLoad]
  )

  // Inject @font-face declarations into document head via font proxy (avoids CORS issues with Drive/Supabase URLs)
  useEffect(() => {
    if (fontUrlsToLoad.length === 0) return
    const styleId = 'kreashot-preview-font-faces'
    let el = document.getElementById(styleId) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      document.head.appendChild(el)
    }
    el.textContent = fontUrlsToLoad
      .map(url => {
        const proxied = `/api/font-proxy?url=${encodeURIComponent(url)}`
        return `@font-face { font-family: '${urlToFamily[url]}'; src: url('${proxied}'); }`
      })
      .join('\n')
  }, [fontUrlsToLoad, urlToFamily])

  // Resolve the CSS font-family to use for preset text
  const resolvedFontFamily = (fontUrl && urlToFamily[fontUrl]) ? urlToFamily[fontUrl] : fontFamily

  const { width: canvasW, height: canvasH } = getFormatDimensions(format)
  const scaleFactor = containerWidth / REF_CANVAS_WIDTH

  // Use the image's natural aspect ratio so the full image is always visible — no cropping, no letterbox bars.
  // Fall back to the ad format ratio until the image loads.
  const aspectRatio = imageNaturalSize
    ? `${imageNaturalSize.w} / ${imageNaturalSize.h}`
    : `${canvasW} / ${canvasH}`

  // Freeform logo position helpers
  function getFreeformLogoStyle(): React.CSSProperties {
    if (!logoUrl) return { display: 'none' }
    const sz = freeformLogoSize
    const margin = 3
    let lx = margin, ly = margin
    if (freeformLogoX != null) {
      lx = (freeformLogoX / canvasW) * 100
    } else {
      if (freeformLogoPosition === 'top-center')    { lx = (100 - sz) / 2; ly = margin }
      if (freeformLogoPosition === 'top-right')     { lx = 100 - sz - margin; ly = margin }
      if (freeformLogoPosition === 'bottom-left')   { lx = margin; ly = 100 - sz - margin }
      if (freeformLogoPosition === 'bottom-center') { lx = (100 - sz) / 2; ly = 100 - sz - margin }
      if (freeformLogoPosition === 'bottom-right')  { lx = 100 - sz - margin; ly = 100 - sz - margin }
    }
    if (freeformLogoY != null) ly = (freeformLogoY / canvasH) * 100
    return {
      position: 'absolute',
      left: `${lx}%`,
      top: `${ly}%`,
      width: `${sz}%`,
      objectFit: 'contain' as const,
      pointerEvents: 'none',
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', aspectRatio, overflow: 'hidden', backgroundColor: '#111', borderRadius: '8px' }}
    >
      {/* Base image — container matches image's natural ratio so cover = no cropping */}
      {baseImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={baseImageUrl}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth && img.naturalHeight) {
              setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
            }
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
      )}

      {/* Darken overlay (freeform mode) */}
      {darkenImage && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.15)', pointerEvents: 'none' }} />
      )}

      {/* === PRESET MODE === */}
      {preset && (
        <>
          {/* Preset overlay */}
          {preset.overlay && (
            <div style={getOverlayStyle(preset.overlay, containerWidth, containerWidth * (canvasH / canvasW))} />
          )}

          {/* Logo */}
          {preset.logo && logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              style={{
                position: 'absolute',
                left: `${preset.logo.x}%`,
                top: `${preset.logo.y}%`,
                width: `${presetLogoSize ?? preset.logo.size}%`,
                objectFit: 'contain',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Headline */}
          {headline && (
            <div
              style={{
                position: 'absolute',
                left: `${preset.headline.x}%`,
                top: `${preset.headline.y}%`,
                width: `${preset.headline.width}%`,
                fontSize: `${preset.headline.fontSize * scaleFactor}px`,
                fontWeight: preset.headline.fontWeight || 'normal',
                color: preset.headline.color,
                textAlign: preset.headline.align,
                fontFamily: resolvedFontFamily,
                lineHeight: 1.15,
                textShadow: '0 1px 6px rgba(0,0,0,0.7)',
                pointerEvents: 'none',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {headline}
            </div>
          )}

          {/* Subline */}
          {subline && preset.subline && (
            <div
              style={{
                position: 'absolute',
                left: `${preset.subline.x}%`,
                top: `${preset.subline.y}%`,
                width: `${preset.subline.width}%`,
                fontSize: `${preset.subline.fontSize * scaleFactor}px`,
                fontWeight: preset.subline.fontWeight || 'normal',
                color: preset.subline.color,
                textAlign: preset.subline.align,
                fontFamily: resolvedFontFamily,
                lineHeight: 1.2,
                textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {subline}
            </div>
          )}
        </>
      )}

      {/* === FREEFORM MODE === */}
      {!preset && (
        <>
          {/* Freeform logo */}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={getFreeformLogoStyle()} />
          )}

          {/* Freeform text layers */}
          {freeformLayers?.map((layer) => (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                width: `${layer.width}%`,
                fontSize: `${layer.fontSize * scaleFactor}px`,
                color: layer.color,
                textAlign: layer.align,
                fontFamily: (layer.fontUrl && urlToFamily[layer.fontUrl]) ? urlToFamily[layer.fontUrl] : (layer.fontFamily || 'Arial'),
                lineHeight: 1.2,
                pointerEvents: 'none',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {layer.text}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
