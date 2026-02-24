'use client'

import { useRef, useEffect, useState } from 'react'
import { TemplateLayer, SafeZone } from './TemplateBuilderCanvas'
import { Card } from '@/components/ui/card'
import { CheckCircle2, XCircle } from 'lucide-react'

interface TemplateSamplePreviewProps {
  guidelineImageUrl?: string
  safeZones: SafeZone[]
  layers: TemplateLayer[]
}

export function TemplateSamplePreview({
  guidelineImageUrl,
  safeZones,
  layers,
}: TemplateSamplePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [guidelineImage, setGuidelineImage] = useState<HTMLImageElement | null>(null)
  const [validationResults, setValidationResults] = useState<
    Record<string, { valid: boolean; issues: string[] }>
  >({})

  // Load guideline image
  useEffect(() => {
    if (guidelineImageUrl) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => setGuidelineImage(img)
      img.src = guidelineImageUrl
    } else {
      setGuidelineImage(null)
    }
  }, [guidelineImageUrl])

  // Validate layers against safe zones
  useEffect(() => {
    const results: Record<string, { valid: boolean; issues: string[] }> = {}

    layers.forEach((layer) => {
      const issues: string[] = []

      // Check overlap with restricted zones
      safeZones.forEach((zone) => {
        if (zone.type === 'restricted') {
          if (isOverlapping(layer, zone)) {
            issues.push(`Overlaps with restricted zone "${zone.name}"`)
          }
        }
      })

      // Check if within safe zones (if any safe zones exist)
      const safes = safeZones.filter((z) => z.type === 'safe')
      if (safes.length > 0) {
        const isWithinAnySafe = safes.some((zone) => isFullyWithin(layer, zone))
        if (!isWithinAnySafe) {
          issues.push('Not within any safe zone')
        }
      }

      results[layer.id] = {
        valid: issues.length === 0,
        issues,
      }
    })

    setValidationResults(results)
  }, [layers, safeZones])

  // Draw preview on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw guideline image if available
    if (guidelineImage) {
      ctx.globalAlpha = 0.3
      ctx.drawImage(guidelineImage, 0, 0, canvas.width, canvas.height)
      ctx.globalAlpha = 1.0
    }

    // Draw safe zones (semi-transparent overlays)
    safeZones.forEach((zone) => {
      const x = (zone.x / 100) * canvas.width
      const y = (zone.y / 100) * canvas.height
      const w = (zone.width / 100) * canvas.width
      const h = (zone.height / 100) * canvas.height

      // Fill with transparency
      ctx.fillStyle = zone.color + '40' // Add alpha channel
      ctx.fillRect(x, y, w, h)

      // Border
      ctx.strokeStyle = zone.color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)

      // Zone label
      ctx.fillStyle = zone.color
      ctx.font = 'bold 14px Arial'
      ctx.fillText(zone.name, x + 5, y + 20)
    })

    // Draw layer placeholders (dotted rectangles)
    const sortedLayers = [...layers].sort((a, b) => a.z_index - b.z_index)
    sortedLayers.forEach((layer) => {
      const x = (layer.x / 100) * canvas.width
      const y = (layer.y / 100) * canvas.height
      const w = (layer.width / 100) * canvas.width
      const h = (layer.height / 100) * canvas.height

      const color = getLayerColor(layer.type)
      const isValid = validationResults[layer.id]?.valid ?? true

      // Dotted border
      ctx.setLineDash([8, 4])
      ctx.strokeStyle = isValid ? color : '#ef4444' // Red if invalid
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([]) // Reset

      // Semi-transparent fill
      ctx.fillStyle = color + '20'
      ctx.fillRect(x, y, w, h)

      // Layer label
      ctx.fillStyle = color
      ctx.font = 'bold 18px Arial'
      const label = layer.name || layer.type.toUpperCase()
      ctx.fillText(label, x + 8, y + 28)

      // Validation indicator (✓ or ✗)
      ctx.font = 'bold 24px Arial'
      ctx.fillStyle = isValid ? '#10b981' : '#ef4444'
      const indicator = isValid ? '✓' : '✗'
      const indicatorX = x + w - 35
      const indicatorY = y + 30
      ctx.fillText(indicator, indicatorX, indicatorY)

      // Layer info
      ctx.font = '12px Arial'
      ctx.fillStyle = '#6b7280'
      const info = `${layer.width.toFixed(0)}×${layer.height.toFixed(0)}% • Z:${layer.z_index}`
      ctx.fillText(info, x + 8, y + h - 8)
    })
  }, [guidelineImage, safeZones, layers, validationResults])

  // Get layer color by type
  const getLayerColor = (type: TemplateLayer['type']) => {
    switch (type) {
      case 'background':
        return '#3b82f6' // blue
      case 'product':
        return '#8b5cf6' // purple
      case 'text':
        return '#f59e0b' // orange
      case 'logo':
        return '#10b981' // green
      default:
        return '#6b7280'
    }
  }

  // Check if two rectangles overlap
  const isOverlapping = (layer: TemplateLayer, zone: SafeZone): boolean => {
    const l1 = { x: layer.x, y: layer.y, w: layer.width, h: layer.height }
    const l2 = { x: zone.x, y: zone.y, w: zone.width, h: zone.height }

    return !(
      l1.x + l1.w <= l2.x ||
      l2.x + l2.w <= l1.x ||
      l1.y + l1.h <= l2.y ||
      l2.y + l2.h <= l1.y
    )
  }

  // Check if layer is fully within safe zone
  const isFullyWithin = (layer: TemplateLayer, zone: SafeZone): boolean => {
    return (
      layer.x >= zone.x &&
      layer.y >= zone.y &&
      layer.x + layer.width <= zone.x + zone.width &&
      layer.y + layer.height <= zone.y + zone.height
    )
  }

  // Count valid/invalid layers
  const validCount = Object.values(validationResults).filter((r) => r.valid).length
  const invalidCount = Object.values(validationResults).filter((r) => !r.valid).length
  const allValid = layers.length > 0 && invalidCount === 0

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Sample Template Preview</h3>
            <p className="text-xs text-muted-foreground">
              Validates your template configuration
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
          <canvas
            ref={canvasRef}
            width={1080}
            height={1080}
            className="w-full h-auto"
          />
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

        {/* Legend */}
        <div className="pt-4 border-t">
          <div className="text-xs font-medium mb-2">Legend:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-dashed border-blue-500" />
              <span>Background</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-dashed border-purple-500" />
              <span>Product</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-dashed border-orange-500" />
              <span>Text</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-dashed border-green-500" />
              <span>Logo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 opacity-25" />
              <span>Safe Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 opacity-25" />
              <span>Restricted</span>
            </div>
          </div>
        </div>

        {layers.length === 0 && safeZones.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Add layers and safe zones to see the preview
          </div>
        )}
      </div>
    </Card>
  )
}
