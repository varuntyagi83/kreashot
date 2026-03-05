'use client'

import { useRef, useEffect, useState } from 'react'
import { TemplateLayer, SafeZone } from './TemplateBuilderCanvas'
import { Card } from '@/components/ui/card'
import { CheckCircle2, XCircle } from 'lucide-react'

interface TemplateSamplePreviewProps {
  guidelineImageUrl?: string
  safeZones: SafeZone[]
  layers: TemplateLayer[]
  width?: number
  height?: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // No crossOrigin — Google Drive CDN (lh3.googleusercontent.com) rejects requests with Origin header
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

const LAYER_COLORS: Record<string, string> = {
  background: '#3b82f6',
  product: '#8b5cf6',
  text: '#f59e0b',
  logo: '#10b981',
  overlay: '#ec4899',
}

export function TemplateSamplePreview({
  guidelineImageUrl,
  safeZones,
  layers,
  width = 1080,
  height = 1080,
}: TemplateSamplePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [validationResults, setValidationResults] = useState<
    Record<string, { valid: boolean; issues: string[] }>
  >({})

  // Validate layers against safe zones
  useEffect(() => {
    const results: Record<string, { valid: boolean; issues: string[] }> = {}
    layers.forEach((layer) => {
      const issues: string[] = []
      safeZones.forEach((zone) => {
        if (zone.type === 'restricted' && isOverlapping(layer, zone)) {
          issues.push(`Overlaps with restricted zone "${zone.name}"`)
        }
      })
      const safes = safeZones.filter((z) => z.type === 'safe')
      if (safes.length > 0 && !safes.some((z) => isFullyWithin(layer, z))) {
        issues.push('Not within any safe zone')
      }
      results[layer.id] = { valid: issues.length === 0, issues }
    })
    setValidationResults(results)
  }, [layers, safeZones])

  // Draw preview: render actual layer images + text, then safe zones on top
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false

    const drawPreview = async () => {
      canvas.width = width
      canvas.height = height

      // Light grey base
      ctx.fillStyle = '#f3f4f6'
      ctx.fillRect(0, 0, width, height)

      const sortedLayers = [...layers].sort((a, b) => a.z_index - b.z_index)

      for (const layer of sortedLayers) {
        if (cancelled) break

        const x = (layer.x / 100) * width
        const y = (layer.y / 100) * height
        const w = (layer.width / 100) * width
        const h = (layer.height / 100) * height

        const imageUrl = (layer.type === 'overlay' || layer.type === 'composite') ? layer.source_url : layer.preview_url

        if (imageUrl) {
          try {
            const img = await loadImage(imageUrl)
            if (cancelled) break
            ctx.save()
            // Product shots from Gemini have white backgrounds — multiply blends white away
            if (layer.type === 'product') {
              ctx.globalCompositeOperation = 'multiply'
            }
            ctx.drawImage(img, x, y, w, h)
            ctx.restore()
            continue
          } catch {
            // fall through to placeholder
          }
        }

        if (layer.type === 'text') {
          ctx.save()
          const scaleFactor = width / 1080
          const fontSize = Math.max((layer.font_size || 24) * scaleFactor, 10)
          ctx.font = `bold ${fontSize}px ${layer.font_family || 'Arial'}`
          const textColor = layer.color || '#000000'
          ctx.textAlign = (layer.text_align as CanvasTextAlign) || 'left'
          // Only add backdrop behind light-colored text for legibility
          const hex = textColor.replace('#', '')
          const isLight = hex.length >= 6 && (
            parseInt(hex.substring(0, 2), 16) * 0.299 +
            parseInt(hex.substring(2, 4), 16) * 0.587 +
            parseInt(hex.substring(4, 6), 16) * 0.114
          ) > 186
          if (isLight) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
            ctx.fillRect(x, y, w, h)
          }
          ctx.fillStyle = textColor
          const textX =
            layer.text_align === 'center'
              ? x + w / 2
              : layer.text_align === 'right'
              ? x + w
              : x + 6
          ctx.fillText(layer.sample_text || layer.name || 'Tagline Text', textX, y + fontSize + 4, w)
          ctx.restore()
          continue
        }

        // Placeholder for layers without preview image (logo, etc.)
        const color = LAYER_COLORS[layer.type] ?? '#6b7280'
        ctx.fillStyle = color + '30'
        ctx.fillRect(x, y, w, h)
        ctx.strokeStyle = color
        ctx.setLineDash([8, 4])
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
        ctx.fillStyle = color
        ctx.font = `bold ${Math.max(14 * (width / 800), 10)}px Arial`
        ctx.fillText(layer.name || layer.type.toUpperCase(), x + 8, y + 24)
      }

      if (cancelled) return

      // Draw safe zones on top (as overlays)
      safeZones.forEach((zone) => {
        const zx = (zone.x / 100) * width
        const zy = (zone.y / 100) * height
        const zw = (zone.width / 100) * width
        const zh = (zone.height / 100) * height
        ctx.fillStyle = zone.color + '25'
        ctx.fillRect(zx, zy, zw, zh)
        ctx.strokeStyle = zone.color
        ctx.lineWidth = 2
        ctx.strokeRect(zx, zy, zw, zh)
        ctx.fillStyle = zone.color
        ctx.font = `bold ${Math.max(13 * (width / 800), 10)}px Arial`
        ctx.fillText(zone.name, zx + 6, zy + 20)
      })
    }

    drawPreview()
    return () => {
      cancelled = true
    }
  }, [layers, safeZones, width, height])

  const isOverlapping = (layer: TemplateLayer, zone: SafeZone): boolean => {
    return !(
      layer.x + layer.width <= zone.x ||
      zone.x + zone.width <= layer.x ||
      layer.y + layer.height <= zone.y ||
      zone.y + zone.height <= layer.y
    )
  }

  const isFullyWithin = (layer: TemplateLayer, zone: SafeZone): boolean => {
    return (
      layer.x >= zone.x &&
      layer.y >= zone.y &&
      layer.x + layer.width <= zone.x + zone.width &&
      layer.y + layer.height <= zone.y + zone.height
    )
  }

  const invalidCount = Object.values(validationResults).filter((r) => !r.valid).length
  const allValid = layers.length > 0 && invalidCount === 0

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Sample Template Preview</h3>
            <p className="text-xs text-muted-foreground">
              Renders your template with the selected preview images
            </p>
          </div>
          {layers.length > 0 && (
            <div className="flex items-center gap-2">
              {allValid ? (
                <div className="flex items-center gap-1 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>All valid</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <XCircle className="h-4 w-4" />
                  <span>{invalidCount} issue{invalidCount !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Canvas Preview */}
        <div className="border rounded-lg overflow-hidden bg-gray-50">
          <canvas ref={canvasRef} width={width} height={height} className="w-full h-auto" />
        </div>

        {/* Validation Details */}
        {layers.length > 0 && invalidCount > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-red-600">Validation Issues:</div>
            <div className="space-y-2">
              {layers.map((layer) => {
                const result = validationResults[layer.id]
                if (!result || result.valid) return null
                return (
                  <div
                    key={layer.id}
                    className="p-2 bg-red-50 border border-red-200 rounded text-xs"
                  >
                    <div className="font-medium text-red-900">
                      {layer.name || layer.type.toUpperCase()}
                    </div>
                    <ul className="list-disc list-inside text-red-700 mt-1">
                      {result.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {layers.length === 0 && safeZones.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Add layers in the Template Builder tab to see the preview here
          </div>
        )}
      </div>
    </Card>
  )
}
