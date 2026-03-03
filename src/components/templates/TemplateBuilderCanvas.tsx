'use client'

import { useRef, useEffect } from 'react'
import * as fabric from 'fabric'
import type { TemplateLayer, SafeZone } from '@/lib/types/template'

// Re-export types for use by parent components
export type { TemplateLayer, SafeZone }

interface TemplateBuilderCanvasProps {
  format: string
  width: number
  height: number
  layers: TemplateLayer[]
  safeZones: SafeZone[]
  selectedLayerId: string | null
  onLayerSelect: (layerId: string | null) => void
  onLayerUpdate: (layerId: string, updates: Partial<TemplateLayer>) => void
  gridEnabled?: boolean
  gridSize?: number
}

// Extend fabric objects to include custom data
interface CustomFabricObject extends fabric.FabricObject {
  customData?: {
    isGrid?: boolean
    isSafeZone?: boolean
    isLayer?: boolean
    isLabel?: boolean
    layerId?: string
    zoneId?: string
  }
}

const LAYER_COLORS: Record<string, string> = {
  background: '#3b82f6',  // blue
  product: '#8b5cf6',     // purple
  text: '#f59e0b',        // orange
  logo: '#10b981',        // green
  overlay: '#ec4899',     // pink
}

function getLayerColor(type: TemplateLayer['type']): string {
  return LAYER_COLORS[type] ?? '#6b7280'
}

export function TemplateBuilderCanvas({
  format,
  width,
  height,
  layers,
  safeZones,
  selectedLayerId,
  onLayerSelect,
  onLayerUpdate,
  gridEnabled = true,
  gridSize = 50,
}: TemplateBuilderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const container = containerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    const scaleX = containerWidth / width
    const scaleY = containerHeight / height
    const scale = Math.min(scaleX, scaleY, 1) * 0.95

    const canvasWidth = width * scale
    const canvasHeight = height * scale

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#f3f4f6',
      selection: true,
    })

    fabricCanvasRef.current = canvas

    return () => {
      canvas.dispose()
      fabricCanvasRef.current = null
    }
  }, [width, height])

  // Draw grid
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !gridEnabled) return

    const canvasWidth = canvas.getWidth()
    const canvasHeight = canvas.getHeight()

    const objects = canvas.getObjects()
    objects.forEach((obj) => {
      if ((obj as CustomFabricObject).customData?.isGrid) canvas.remove(obj)
    })

    for (let i = 0; i <= width / gridSize; i++) {
      const line = new fabric.Line(
        [i * gridSize * (canvasWidth / width), 0, i * gridSize * (canvasWidth / width), canvasHeight],
        { stroke: '#9ca3af', strokeWidth: 1.5, selectable: false, evented: false, opacity: 0.8 }
      ) as CustomFabricObject
      line.customData = { isGrid: true }
      canvas.add(line)
    }

    for (let i = 0; i <= height / gridSize; i++) {
      const line = new fabric.Line(
        [0, i * gridSize * (canvasHeight / height), canvasWidth, i * gridSize * (canvasHeight / height)],
        { stroke: '#9ca3af', strokeWidth: 1.5, selectable: false, evented: false, opacity: 0.8 }
      ) as CustomFabricObject
      line.customData = { isGrid: true }
      canvas.add(line)
    }

    const gridLines = canvas.getObjects().filter((obj) => (obj as CustomFabricObject).customData?.isGrid)
    gridLines.forEach((line) => canvas.sendObjectToBack(line))
    canvas.renderAll()
  }, [gridEnabled, gridSize, width, height])

  // Draw safe zones
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const canvasWidth = canvas.getWidth()

    canvas.getObjects().forEach((obj) => {
      if ((obj as CustomFabricObject).customData?.isSafeZone) canvas.remove(obj)
    })

    safeZones.forEach((zone) => {
      const rect = new fabric.Rect({
        left: (zone.x / 100) * canvasWidth,
        top: (zone.y / 100) * canvasWidth * (height / width),
        width: (zone.width / 100) * canvasWidth,
        height: (zone.height / 100) * canvasWidth * (height / width),
        fill: zone.color,
        opacity: 0.3,
        selectable: false,
        evented: false,
      }) as CustomFabricObject
      rect.customData = { isSafeZone: true, zoneId: zone.id }
      canvas.add(rect)
    })

    canvas.renderAll()
  }, [safeZones, width, height])

  // Draw layers — async to support image loading for product/background/overlay layers
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const canvasWidth = canvas.getWidth()

    // Remove existing layer objects synchronously
    canvas.getObjects().forEach((obj) => {
      if ((obj as CustomFabricObject).customData?.isLayer) canvas.remove(obj)
    })

    let cancelled = false
    const sortedLayers = [...layers].sort((a, b) => a.z_index - b.z_index)

    const commonControls = {
      hasControls: true,
      hasBorders: true,
      cornerSize: 16,
      cornerColor: '#2563eb',
      cornerStrokeColor: '#ffffff',
      borderColor: '#2563eb',
      cornerStyle: 'circle' as const,
      transparentCorners: false,
      borderScaleFactor: 2,
      padding: 5,
    }

    const drawLayers = async () => {
      for (const layer of sortedLayers) {
        if (cancelled) break

        const isSelected = layer.id === selectedLayerId
        const lx = (layer.x / 100) * canvasWidth
        const ly = (layer.y / 100) * canvasWidth * (height / width)
        const lw = (layer.width / 100) * canvasWidth
        const lh = (layer.height / 100) * canvasWidth * (height / width)
        const layerColor = getLayerColor(layer.type)

        // overlay uses source_url (part of template); product/background use preview_url (preview only)
        const imageUrl = layer.type === 'overlay' ? layer.source_url : layer.preview_url

        if (imageUrl) {
          try {
            const img = await fabric.Image.fromURL(imageUrl, { crossOrigin: 'anonymous' })
            if (cancelled) break

            img.set({
              left: lx,
              top: ly,
              scaleX: lw / (img.width || 1),
              scaleY: lh / (img.height || 1),
              selectable: !layer.locked,
              stroke: isSelected ? '#000000' : layerColor,
              strokeWidth: isSelected ? 2 : 1,
              ...commonControls,
            })
            ;(img as CustomFabricObject).customData = { isLayer: true, layerId: layer.id }
            canvas.add(img)
            canvas.renderAll()
            continue
          } catch {
            // fall through to placeholder rect if image fails to load
          }
        }

        if (layer.type === 'text') {
          // Render styled text preview using actual font settings
          const displayText = layer.sample_text || layer.name || 'TEXT'
          const scaleFactor = canvasWidth / width
          const displayFontSize = Math.max((layer.font_size || 24) * scaleFactor, 8)

          const textbox = new fabric.Textbox(displayText, {
            left: lx,
            top: ly,
            width: lw,
            fontSize: displayFontSize,
            fill: layer.color || '#000000',
            fontFamily: layer.font_family || 'Arial',
            textAlign: (layer.text_align as 'left' | 'center' | 'right') || 'left',
            backgroundColor: 'rgba(251, 191, 36, 0.15)',
            selectable: !layer.locked,
            stroke: isSelected ? '#000000' : layerColor,
            strokeWidth: isSelected ? 1 : 0,
            ...commonControls,
          }) as CustomFabricObject
          textbox.customData = { isLayer: true, layerId: layer.id }
          canvas.add(textbox)
        } else {
          // Colored placeholder rect + name label
          const rect = new fabric.Rect({
            left: lx,
            top: ly,
            width: lw,
            height: lh,
            fill: layerColor,
            opacity: 0.5,
            stroke: isSelected ? '#000000' : layerColor,
            strokeWidth: isSelected ? 2 : 1,
            strokeDashArray: [10, 5],
            selectable: !layer.locked,
            ...commonControls,
          }) as CustomFabricObject
          rect.customData = { isLayer: true, layerId: layer.id }

          const label = new fabric.FabricText(layer.name || layer.type.toUpperCase(), {
            left: lx + 5,
            top: ly + 5,
            fontSize: 12,
            fill: '#000',
            fontWeight: 'bold',
            selectable: false,
            evented: false,
          }) as CustomFabricObject
          label.customData = { isLayer: true, layerId: layer.id, isLabel: true }

          canvas.add(rect)
          canvas.add(label)
        }

        canvas.renderAll()
      }
    }

    drawLayers()
    return () => { cancelled = true }
  }, [layers, selectedLayerId, width, height, onLayerSelect, onLayerUpdate])

  // Handle canvas events
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const canvasWidth = canvas.getWidth()

    const handleSelectionCreated = (e: any) => {
      const activeObject = e.selected?.[0] as CustomFabricObject | undefined
      if (activeObject?.customData?.isLayer && activeObject.customData.layerId) {
        onLayerSelect(activeObject.customData.layerId)
      }
    }

    const handleSelectionUpdated = (e: any) => {
      const activeObject = e.selected?.[0] as CustomFabricObject | undefined
      if (activeObject?.customData?.isLayer && activeObject.customData.layerId) {
        onLayerSelect(activeObject.customData.layerId)
      }
    }

    const handleSelectionCleared = () => {
      onLayerSelect(null)
    }

    const handleObjectModified = (e: any) => {
      const target = e.target as CustomFabricObject
      if (target.customData?.isLayer && target.customData.layerId) {
        const scaleX = target.scaleX || 1
        const scaleY = target.scaleY || 1

        onLayerUpdate(target.customData.layerId, {
          x: ((target.left || 0) / canvasWidth) * 100,
          y: ((target.top || 0) / canvasWidth / (height / width)) * 100,
          width: ((target.width || 0) * scaleX / canvasWidth) * 100,
          height: ((target.height || 0) * scaleY / canvasWidth / (height / width)) * 100,
        })

        target.set({ scaleX: 1, scaleY: 1 })
        canvas.renderAll()
      }
    }

    canvas.on('selection:created', handleSelectionCreated)
    canvas.on('selection:updated', handleSelectionUpdated)
    canvas.on('selection:cleared', handleSelectionCleared)
    canvas.on('object:modified', handleObjectModified)

    return () => {
      canvas.off('selection:created', handleSelectionCreated)
      canvas.off('selection:updated', handleSelectionUpdated)
      canvas.off('selection:cleared', handleSelectionCleared)
      canvas.off('object:modified', handleObjectModified)
    }
  }, [onLayerSelect, onLayerUpdate, width, height])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center"
    >
      <canvas ref={canvasRef} />

      {/* Canvas info overlay */}
      <div className="absolute top-2 right-2 bg-white dark:bg-gray-800 px-3 py-1 rounded shadow text-xs">
        <span className="font-mono font-semibold">{format}</span>
        <span className="mx-2 text-muted-foreground">•</span>
        <span className="text-muted-foreground">
          {width}×{height}
        </span>
      </div>
    </div>
  )
}
