'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Save, Loader2, ImagePlus, Trash2, Sparkles, LayoutGrid } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CollageCanvas } from './CollageCanvas'
import { CollageLayerPanel } from './CollageLayerPanel'
import { CollagePropertiesPanel } from './CollagePropertiesPanel'
import type { CollageLayer, CollageData, Collage } from '@/lib/types/collage'

interface CollageWorkspaceProps {
  categoryId: string
  format?: string
}

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
}

// Gap (%) between cells so images don't touch edge-to-edge
const CELL_GAP = 1

interface PresetCell {
  type: 'image' | 'text'
  x: number; y: number; width: number; height: number
  // text-only fields
  text_content?: string; font_size?: number; color?: string; text_align?: 'left' | 'center' | 'right'
  background_color?: string
}

interface GridPreset {
  label: string
  description: string
  bg: string
  cells: PresetCell[]
}

const GRID_PRESETS: Record<string, GridPreset> = {
  '2col': {
    label: '2 Columns',
    description: 'Two images side by side',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 50, height: 100 },
      { type: 'image', x: 50, y: 0, width: 50, height: 100 },
    ],
  },
  '2row': {
    label: '2 Rows',
    description: 'Two images stacked',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 100, height: 50 },
      { type: 'image', x: 0, y: 50, width: 100, height: 50 },
    ],
  },
  '3col': {
    label: '3 Columns',
    description: 'Three equal columns',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 33.33, height: 100 },
      { type: 'image', x: 33.33, y: 0, width: 33.34, height: 100 },
      { type: 'image', x: 66.67, y: 0, width: 33.33, height: 100 },
    ],
  },
  '4grid': {
    label: '2x2 Grid',
    description: 'Four equal cells',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 50, height: 50 },
      { type: 'image', x: 50, y: 0, width: 50, height: 50 },
      { type: 'image', x: 0, y: 50, width: 50, height: 50 },
      { type: 'image', x: 50, y: 50, width: 50, height: 50 },
    ],
  },
  '1hero-2sub': {
    label: 'Hero + 2 Below',
    description: 'Large top image, two smaller below',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 100, height: 60 },
      { type: 'image', x: 0, y: 60, width: 50, height: 40 },
      { type: 'image', x: 50, y: 60, width: 50, height: 40 },
    ],
  },
  '2hero-1side': {
    label: 'Hero + 2 Side',
    description: 'Large left image, two stacked right',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 60, height: 100 },
      { type: 'image', x: 60, y: 0, width: 40, height: 50 },
      { type: 'image', x: 60, y: 50, width: 40, height: 50 },
    ],
  },
  '1hero-3side': {
    label: 'Hero + 3 Side',
    description: 'Large left image, three stacked right',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 60, height: 100 },
      { type: 'image', x: 60, y: 0, width: 40, height: 33.33 },
      { type: 'image', x: 60, y: 33.33, width: 40, height: 33.34 },
      { type: 'image', x: 60, y: 66.67, width: 40, height: 33.33 },
    ],
  },
  'hero-over-4grid': {
    label: 'Hero over 2x2 Grid',
    description: '2x2 grid with hero image superimposed on top',
    bg: '#FFFFFF',
    cells: [
      { type: 'image', x: 0, y: 0, width: 50, height: 50 },
      { type: 'image', x: 50, y: 0, width: 50, height: 50 },
      { type: 'image', x: 0, y: 50, width: 50, height: 50 },
      { type: 'image', x: 50, y: 50, width: 50, height: 50 },
      { type: 'image', x: 20, y: 15, width: 60, height: 70 },
    ],
  },
}

function applyGap(cell: PresetCell, gap: number): PresetCell {
  return {
    ...cell,
    x: cell.x + gap / 2,
    y: cell.y + gap / 2,
    width: cell.width - gap,
    height: cell.height - gap,
  }
}

export function CollageWorkspace({ categoryId, format = '1:1' }: CollageWorkspaceProps) {
  const [selectedFormat, setSelectedFormat] = useState(format)
  const [layers, setLayers] = useState<CollageLayer[]>([])
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [collageName, setCollageName] = useState('Untitled Collage')
  const [currentCollageId, setCurrentCollageId] = useState<string | null>(null)
  const [collages, setCollages] = useState<Collage[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)

  const dims = FORMAT_DIMENSIONS[selectedFormat] ?? FORMAT_DIMENSIONS['1:1']

  // Sync format from parent
  useEffect(() => {
    setSelectedFormat(format)
  }, [format])

  // Track changes
  useEffect(() => {
    setHasChanges(true)
  }, [layers, backgroundColor])

  // Fetch collages on mount / format change
  const fetchCollages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/collages?format=${selectedFormat}`)
      const data = await res.json()
      if (res.ok) {
        setCollages(data.collages || [])
        // Auto-load the first collage if available
        if (data.collages?.length > 0 && !currentCollageId) {
          loadCollage(data.collages[0])
        }
      }
    } catch (err) {
      console.error('Failed to fetch collages:', err)
    } finally {
      setLoading(false)
    }
  }, [categoryId, selectedFormat])

  useEffect(() => {
    setCurrentCollageId(null)
    fetchCollages()
  }, [categoryId, selectedFormat, fetchCollages])

  const loadCollage = (collage: Collage) => {
    const data = typeof collage.collage_data === 'string'
      ? JSON.parse(collage.collage_data)
      : collage.collage_data

    setCurrentCollageId(collage.id)
    setCollageName(collage.name)
    setLayers(data?.layers || [])
    setBackgroundColor(data?.background_color || '#FFFFFF')
    setSelectedLayerId(null)
    setHasChanges(false)
  }

  // Layer management
  const handleAddLayer = (type: CollageLayer['type']) => {
    const sameTypeCount = layers.filter((l) => l.type === type).length + 1
    const typeNames: Record<string, string> = {
      image: 'Image',
      text: 'Text',
      overlay: 'Overlay',
      background: 'Background',
    }
    const maxZ = layers.length > 0 ? Math.max(...layers.map((l) => l.z_index)) : -1

    const defaults: Record<string, Partial<CollageLayer>> = {
      image: { x: 0, y: 0, width: 50, height: 50, object_fit: 'cover' },
      text: { x: 5, y: 5, width: 90, height: 10, font_size: 36, color: '#000000', text_align: 'center', text_content: 'Text' },
      overlay: { x: 30, y: 30, width: 20, height: 20 },
      background: { x: 0, y: 0, width: 100, height: 100 },
    }

    const newLayer: CollageLayer = {
      id: `${type}_${Date.now()}`,
      type,
      name: `${typeNames[type]} ${sameTypeCount}`,
      z_index: maxZ + 1,
      ...defaults[type],
    } as CollageLayer

    setLayers([...layers, newLayer])
    setSelectedLayerId(newLayer.id)
  }

  const handleUpdateLayer = (id: string, updates: Partial<CollageLayer>) => {
    setLayers(layers.map((l) => (l.id === id ? { ...l, ...updates } : l)))
  }

  const handleDeleteLayer = (id: string) => {
    setLayers(layers.filter((l) => l.id !== id))
    if (selectedLayerId === id) setSelectedLayerId(null)
  }

  const handleReorderLayer = (id: string, direction: 'up' | 'down') => {
    const sorted = [...layers].sort((a, b) => a.z_index - b.z_index)
    const idx = sorted.findIndex((l) => l.id === id)
    if (idx < 0) return

    const swapIdx = direction === 'up' ? idx + 1 : idx - 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const tmpZ = sorted[idx].z_index
    sorted[idx] = { ...sorted[idx], z_index: sorted[swapIdx].z_index }
    sorted[swapIdx] = { ...sorted[swapIdx], z_index: tmpZ }
    setLayers(sorted)
  }

  // Save collage
  const handleSave = async () => {
    setSaving(true)
    try {
      const collageData: CollageData = { layers, background_color: backgroundColor }

      if (currentCollageId) {
        const res = await fetch(`/api/categories/${categoryId}/collages/${currentCollageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: collageName, collage_data: collageData }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success('Collage saved')
      } else {
        const res = await fetch(`/api/categories/${categoryId}/collages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: collageName, format: selectedFormat, collage_data: collageData }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setCurrentCollageId(data.collage.id)
        toast.success('Collage created')
      }
      setHasChanges(false)
      fetchCollages()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Generate (render) collage
  const handleGenerate = async () => {
    if (!currentCollageId) {
      toast.error('Please save the collage first')
      return
    }

    // Auto-save before generating
    if (hasChanges) {
      await handleSave()
    }

    setGenerating(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/collages/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collageId: currentCollageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Collage generated!')
      fetchCollages()
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate')
    } finally {
      setGenerating(false)
    }
  }

  // Delete collage
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/categories/${categoryId}/collages/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Collage deleted')
      if (currentCollageId === id) {
        setCurrentCollageId(null)
        setLayers([])
        setCollageName('Untitled Collage')
        setBackgroundColor('#FFFFFF')
        setSelectedLayerId(null)
      }
      fetchCollages()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  // New collage
  const handleNew = () => {
    setCurrentCollageId(null)
    setLayers([])
    setCollageName('Untitled Collage')
    setBackgroundColor('#FFFFFF')
    setSelectedLayerId(null)
    setHasChanges(false)
  }

  // Apply a grid layout preset
  const handleApplyPreset = (presetKey: string) => {
    const preset = GRID_PRESETS[presetKey]
    if (!preset) return

    const ts = Date.now()
    let imgCount = 0
    const newLayers: CollageLayer[] = preset.cells.map((cell, i) => {
      const gapped = applyGap(cell, CELL_GAP)
      if (cell.type === 'text') {
        return {
          id: `text_${ts}_${i}`,
          type: 'text' as const,
          name: `Text ${i + 1}`,
          x: gapped.x,
          y: gapped.y,
          width: gapped.width,
          height: gapped.height,
          z_index: i + 10, // text above images
          text_content: cell.text_content || 'Text',
          font_size: cell.font_size || 36,
          color: cell.color || '#000000',
          text_align: cell.text_align || 'center',
          background_color: cell.background_color,
        }
      }
      imgCount++
      return {
        id: `image_${ts}_${i}`,
        type: 'image' as const,
        name: `Image ${imgCount}`,
        x: gapped.x,
        y: gapped.y,
        width: gapped.width,
        height: gapped.height,
        z_index: i,
        object_fit: 'cover' as const,
      }
    })

    setCurrentCollageId(null)
    setLayers(newLayers)
    setBackgroundColor(preset.bg)
    setCollageName('Untitled Collage')
    setSelectedLayerId(null)
    setHasChanges(true)
  }

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null

  return (
    <div className="space-y-4">
      {/* Top bar: name + actions */}
      <div className="flex items-center gap-3">
        <Input
          value={collageName}
          onChange={(e) => { setCollageName(e.target.value); setHasChanges(true) }}
          className="max-w-xs font-medium"
          placeholder="Collage name"
        />

        <Button variant="outline" size="sm" onClick={handleNew}>
          <ImagePlus className="h-4 w-4 mr-1" />
          New
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <LayoutGrid className="h-4 w-4 mr-1" />
              Layout
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {Object.entries(GRID_PRESETS).map(([key, preset]) => (
              <DropdownMenuItem key={key} onClick={() => handleApplyPreset(key)}>
                <div>
                  <div className="font-medium text-sm">{preset.label}</div>
                  <div className="text-xs text-muted-foreground">{preset.description}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>

        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating || layers.length === 0}
        >
          {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Generate
        </Button>
      </div>

      {/* Builder grid: layers panel + canvas + properties panel */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left: Layer Panel */}
        <div className="col-span-2">
          <CollageLayerPanel
            layers={layers}
            selectedLayerId={selectedLayerId}
            onLayerSelect={setSelectedLayerId}
            onLayerDelete={handleDeleteLayer}
            onLayerReorder={handleReorderLayer}
            onAddLayer={handleAddLayer}
          />
        </div>

        {/* Center: Canvas */}
        <div className="col-span-7 min-h-[700px]">
          <CollageCanvas
            layers={layers}
            backgroundColor={backgroundColor}
            selectedLayerId={selectedLayerId}
            width={dims.width}
            height={dims.height}
            onLayerSelect={setSelectedLayerId}
            onLayerUpdate={handleUpdateLayer}
          />
        </div>

        {/* Right: Properties Panel */}
        <div className="col-span-3">
          <CollagePropertiesPanel
            selectedLayer={selectedLayer}
            backgroundColor={backgroundColor}
            onBackgroundColorChange={(c) => { setBackgroundColor(c); setHasChanges(true) }}
            onLayerUpdate={(updates) => {
              if (selectedLayerId) handleUpdateLayer(selectedLayerId, updates)
            }}
            onLayerDelete={() => {
              if (selectedLayerId) handleDeleteLayer(selectedLayerId)
            }}
            categoryId={categoryId}
            format={selectedFormat}
          />
        </div>
      </div>

      {/* Saved collages gallery */}
      {collages.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Saved Collages</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {collages.map((c) => (
              <div
                key={c.id}
                className={`border rounded-lg overflow-hidden cursor-pointer transition-all ${
                  currentCollageId === c.id ? 'ring-2 ring-primary' : 'hover:border-primary/50'
                }`}
                onClick={() => loadCollage(c)}
              >
                {c.storage_url ? (
                  <img
                    src={c.storage_url}
                    alt={c.name}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted flex items-center justify-center text-muted-foreground text-sm">
                    Not generated
                  </div>
                )}
                <div className="p-2 flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{c.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id) }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
