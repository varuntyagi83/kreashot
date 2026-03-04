'use client'

import { useRef, useEffect } from 'react'
import * as fabric from 'fabric'
import type { CollageLayer } from '@/lib/types/collage'

interface CollageCanvasProps {
  layers: CollageLayer[]
  backgroundColor: string
  selectedLayerId: string | null
  width: number
  height: number
  onLayerSelect: (layerId: string | null) => void
  onLayerUpdate: (layerId: string, updates: Partial<CollageLayer>) => void
}

interface CustomFabricObject extends fabric.FabricObject {
  customData?: {
    isLayer?: boolean
    isLabel?: boolean
    layerId?: string
  }
}

const LAYER_COLORS: Record<string, string> = {
  image: '#8b5cf6',      // purple
  text: '#f59e0b',       // orange
  overlay: '#ec4899',    // pink
  background: '#3b82f6', // blue
}

export function CollageCanvas({
  layers,
  backgroundColor,
  selectedLayerId,
  width,
  height,
  onLayerSelect,
  onLayerUpdate,
}: CollageCanvasProps) {
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
      backgroundColor,
      selection: true,
    })

    fabricCanvasRef.current = canvas

    return () => {
      canvas.dispose()
      fabricCanvasRef.current = null
    }
  }, [width, height])

  // Update background color
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.backgroundColor = backgroundColor
    canvas.renderAll()
  }, [backgroundColor])

  // Draw layers
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const canvasWidth = canvas.getWidth()
    const canvasHeight = canvas.getHeight()

    // Remove existing layer objects
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
        const ly = (layer.y / 100) * canvasHeight
        const lw = (layer.width / 100) * canvasWidth
        const lh = (layer.height / 100) * canvasHeight
        const layerColor = LAYER_COLORS[layer.type] ?? '#6b7280'

        // Image or overlay layers with source_url — load the actual image
        if ((layer.type === 'image' || layer.type === 'overlay') && layer.source_url) {
          try {
            const img = await fabric.Image.fromURL(layer.source_url)
            if (cancelled) break

            img.set({
              left: lx,
              top: ly,
              scaleX: lw / (img.width || 1),
              scaleY: lh / (img.height || 1),
              selectable: !layer.locked,
              stroke: isSelected ? '#2563eb' : undefined,
              strokeWidth: isSelected ? 2 : 0,
              ...commonControls,
            })
            ;(img as CustomFabricObject).customData = { isLayer: true, layerId: layer.id }
            canvas.add(img)
            canvas.renderAll()
            continue
          } catch {
            // fall through to placeholder
          }
        }

        // Text layers
        if (layer.type === 'text') {
          const displayText = layer.text_content || layer.name || 'TEXT'
          const scaleFactor = canvasWidth / width
          const displayFontSize = Math.max((layer.font_size || 24) * scaleFactor, 8)

          const textbox = new fabric.Textbox(displayText, {
            left: lx,
            top: ly,
            width: lw,
            fontSize: displayFontSize,
            fill: layer.color || '#000000',
            fontFamily: layer.font_family || 'Arial',
            textAlign: (layer.text_align as 'left' | 'center' | 'right') || 'center',
            backgroundColor: layer.background_color || 'rgba(251, 191, 36, 0.15)',
            selectable: !layer.locked,
            stroke: isSelected ? '#000000' : undefined,
            strokeWidth: isSelected ? 1 : 0,
            ...commonControls,
          }) as CustomFabricObject
          textbox.customData = { isLayer: true, layerId: layer.id }
          canvas.add(textbox)
        } else {
          // Colored placeholder rect for layers without images
          const rect = new fabric.Rect({
            left: lx,
            top: ly,
            width: lw,
            height: lh,
            fill: layerColor,
            opacity: 0.4,
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

    const drawAndActivate = async () => {
      await drawLayers()
      if (cancelled) return
      if (selectedLayerId) {
        const target = canvas.getObjects().find(
          (obj) =>
            (obj as CustomFabricObject).customData?.isLayer &&
            (obj as CustomFabricObject).customData?.layerId === selectedLayerId &&
            !(obj as CustomFabricObject).customData?.isLabel
        )
        if (target) {
          canvas.setActiveObject(target)
          canvas.renderAll()
        }
      }
    }

    drawAndActivate()
    return () => { cancelled = true }
  }, [layers, selectedLayerId, width, height])

  // Handle canvas events
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    const canvasWidth = canvas.getWidth()
    const canvasHeight = canvas.getHeight()

    const handleSelectionCreated = (e: any) => {
      const obj = e.selected?.[0] as CustomFabricObject | undefined
      if (obj?.customData?.isLayer && obj.customData.layerId) {
        onLayerSelect(obj.customData.layerId)
      }
    }

    const handleSelectionUpdated = (e: any) => {
      const obj = e.selected?.[0] as CustomFabricObject | undefined
      if (obj?.customData?.isLayer && obj.customData.layerId) {
        onLayerSelect(obj.customData.layerId)
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
          y: ((target.top || 0) / canvasHeight) * 100,
          width: ((target.width || 0) * scaleX / canvasWidth) * 100,
          height: ((target.height || 0) * scaleY / canvasHeight) * 100,
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
      <div className="absolute top-2 right-2 bg-white dark:bg-gray-800 px-3 py-1 rounded shadow text-xs">
        <span className="font-mono font-semibold">{width}x{height}</span>
      </div>
    </div>
  )
}
