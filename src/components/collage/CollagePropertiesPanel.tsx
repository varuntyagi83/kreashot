'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Loader2 } from 'lucide-react'
import type { CollageLayer } from '@/lib/types/collage'

interface CollagePropertiesPanelProps {
  selectedLayer: CollageLayer | null
  backgroundColor: string
  onBackgroundColorChange: (color: string) => void
  onLayerUpdate: (updates: Partial<CollageLayer>) => void
  onLayerDelete: () => void
  categoryId: string
  format: string
}

interface ImageAsset {
  id: string
  name?: string
  storage_url: string
  asset_type?: string
}

export function CollagePropertiesPanel({
  selectedLayer,
  backgroundColor,
  onBackgroundColorChange,
  onLayerUpdate,
  onLayerDelete,
  categoryId,
  format,
}: CollagePropertiesPanelProps) {
  const [brandAssets, setBrandAssets] = useState<ImageAsset[]>([])
  const [pipelineImages, setPipelineImages] = useState<{
    angledShots: ImageAsset[]
    backgrounds: ImageAsset[]
    composites: ImageAsset[]
  }>({ angledShots: [], backgrounds: [], composites: [] })
  const [urlInput, setUrlInput] = useState('')
  const [loadingBrand, setLoadingBrand] = useState(false)
  const [loadingPipeline, setLoadingPipeline] = useState(false)

  // Fetch brand assets when an image/overlay layer is selected
  useEffect(() => {
    if (!selectedLayer || (selectedLayer.type !== 'image' && selectedLayer.type !== 'overlay')) return

    const fetchBrandAssets = async () => {
      setLoadingBrand(true)
      try {
        const res = await fetch('/api/brand-assets')
        const data = await res.json()
        if (res.ok) {
          // For overlay layers, filter to overlay assets only
          const assets = data.assets || []
          if (selectedLayer.type === 'overlay') {
            setBrandAssets(assets.filter((a: any) => a.asset_type === 'overlay'))
          } else {
            setBrandAssets(assets)
          }
        }
      } catch (err) {
        console.error('Failed to fetch brand assets:', err)
      } finally {
        setLoadingBrand(false)
      }
    }

    fetchBrandAssets()
  }, [selectedLayer?.id, selectedLayer?.type])

  // Fetch pipeline images when an image layer is selected
  useEffect(() => {
    if (!selectedLayer || selectedLayer.type !== 'image') return

    const fetchPipeline = async () => {
      setLoadingPipeline(true)
      try {
        const [shotRes, bgRes, compRes] = await Promise.all([
          fetch(`/api/categories/${categoryId}/angled-shots?format=${format}`),
          fetch(`/api/categories/${categoryId}/backgrounds?format=${format}`),
          fetch(`/api/categories/${categoryId}/composites?format=${format}`),
        ])

        const [shotData, bgData, compData] = await Promise.all([
          shotRes.json(),
          bgRes.json(),
          compRes.json(),
        ])

        setPipelineImages({
          angledShots: (shotData.angledShots || []).map((s: any) => ({
            id: s.id,
            name: s.name || 'Angled Shot',
            storage_url: s.storage_url,
          })),
          backgrounds: (bgData.backgrounds || []).map((b: any) => ({
            id: b.id,
            name: b.name || b.prompt?.substring(0, 30) || 'Background',
            storage_url: b.storage_url,
          })),
          composites: (compData.composites || []).map((c: any) => ({
            id: c.id,
            name: c.name || 'Composite',
            storage_url: c.storage_url,
          })),
        })
      } catch (err) {
        console.error('Failed to fetch pipeline images:', err)
      } finally {
        setLoadingPipeline(false)
      }
    }

    fetchPipeline()
  }, [selectedLayer?.id, selectedLayer?.type, categoryId, format])

  const handleImageSelect = (url: string) => {
    onLayerUpdate({ source_url: url })
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onLayerUpdate({ source_url: urlInput.trim() })
      setUrlInput('')
    }
  }

  // No layer selected — show canvas background settings
  if (!selectedLayer) {
    return (
      <div className="border rounded-lg bg-background p-4 space-y-4">
        <h3 className="text-sm font-semibold">Canvas Settings</h3>
        <div className="space-y-2">
          <Label className="text-xs">Background Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
              className="h-8 w-8 rounded border cursor-pointer"
            />
            <Input
              value={backgroundColor}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
              className="flex-1 font-mono text-sm"
              placeholder="#FFFFFF"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Select a layer in the canvas or layers panel to edit its properties.
        </p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg bg-background p-4 space-y-4 max-h-[800px] overflow-y-auto">
      <h3 className="text-sm font-semibold">
        {selectedLayer.name || selectedLayer.type}
      </h3>

      {/* Common position/size */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Name</Label>
        <Input
          value={selectedLayer.name || ''}
          onChange={(e) => onLayerUpdate({ name: e.target.value })}
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">X (%)</Label>
          <Input
            type="number"
            value={selectedLayer.x}
            onChange={(e) => onLayerUpdate({ x: Number(e.target.value) })}
            className="text-sm"
            min={0}
            max={100}
          />
        </div>
        <div>
          <Label className="text-xs">Y (%)</Label>
          <Input
            type="number"
            value={selectedLayer.y}
            onChange={(e) => onLayerUpdate({ y: Number(e.target.value) })}
            className="text-sm"
            min={0}
            max={100}
          />
        </div>
        <div>
          <Label className="text-xs">Width (%)</Label>
          <Input
            type="number"
            value={selectedLayer.width}
            onChange={(e) => onLayerUpdate({ width: Number(e.target.value) })}
            className="text-sm"
            min={1}
            max={100}
          />
        </div>
        <div>
          <Label className="text-xs">Height (%)</Label>
          <Input
            type="number"
            value={selectedLayer.height}
            onChange={(e) => onLayerUpdate({ height: Number(e.target.value) })}
            className="text-sm"
            min={1}
            max={100}
          />
        </div>
      </div>

      {/* Image layer properties */}
      {selectedLayer.type === 'image' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Object Fit</Label>
            <Select
              value={selectedLayer.object_fit || 'cover'}
              onValueChange={(v) => onLayerUpdate({ object_fit: v as 'cover' | 'contain' })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover (fill & crop)</SelectItem>
                <SelectItem value="contain">Contain (fit inside)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remove-bg"
              checked={selectedLayer.remove_bg || false}
              onChange={(e) => onLayerUpdate({ remove_bg: e.target.checked })}
              className="h-4 w-4 rounded border cursor-pointer"
            />
            <Label htmlFor="remove-bg" className="text-xs cursor-pointer">
              Remove white background
            </Label>
          </div>

          {/* Image source URL display */}
          {selectedLayer.source_url && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Current Image</Label>
              <img
                src={selectedLayer.source_url}
                alt="Selected"
                className="w-full rounded border object-cover max-h-32"
              />
            </div>
          )}

          {/* Image Source Picker */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Choose Image</Label>
            <Tabs defaultValue="pipeline" className="w-full">
              <TabsList className="w-full grid grid-cols-3 h-8">
                <TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger>
                <TabsTrigger value="brand" className="text-xs">Brand</TabsTrigger>
                <TabsTrigger value="url" className="text-xs">URL</TabsTrigger>
              </TabsList>

              <TabsContent value="pipeline" className="mt-2">
                {loadingPipeline ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {pipelineImages.angledShots.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Angled Shots</p>
                        <ImageGrid images={pipelineImages.angledShots} onSelect={handleImageSelect} currentUrl={selectedLayer.source_url} />
                      </div>
                    )}
                    {pipelineImages.backgrounds.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Backgrounds</p>
                        <ImageGrid images={pipelineImages.backgrounds} onSelect={handleImageSelect} currentUrl={selectedLayer.source_url} />
                      </div>
                    )}
                    {pipelineImages.composites.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Composites</p>
                        <ImageGrid images={pipelineImages.composites} onSelect={handleImageSelect} currentUrl={selectedLayer.source_url} />
                      </div>
                    )}
                    {pipelineImages.angledShots.length === 0 &&
                      pipelineImages.backgrounds.length === 0 &&
                      pipelineImages.composites.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          No pipeline images found for this format.
                        </p>
                      )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="brand" className="mt-2">
                {loadingBrand ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : brandAssets.length > 0 ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    <ImageGrid images={brandAssets} onSelect={handleImageSelect} currentUrl={selectedLayer.source_url} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No brand assets found.</p>
                )}
              </TabsContent>

              <TabsContent value="url" className="mt-2 space-y-2">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                <Button size="sm" className="w-full" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
                  Use URL
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}

      {/* Overlay layer properties */}
      {selectedLayer.type === 'overlay' && (
        <>
          {selectedLayer.source_url && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">Current Overlay</Label>
              <img
                src={selectedLayer.source_url}
                alt="Overlay"
                className="w-full rounded border object-contain max-h-32 bg-muted"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium">Choose Overlay</Label>
            <Tabs defaultValue="brand" className="w-full">
              <TabsList className="w-full grid grid-cols-2 h-8">
                <TabsTrigger value="brand" className="text-xs">Brand Assets</TabsTrigger>
                <TabsTrigger value="url" className="text-xs">URL</TabsTrigger>
              </TabsList>

              <TabsContent value="brand" className="mt-2">
                {loadingBrand ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : brandAssets.length > 0 ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    <ImageGrid images={brandAssets} onSelect={handleImageSelect} currentUrl={selectedLayer.source_url} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No overlay assets found.</p>
                )}
              </TabsContent>

              <TabsContent value="url" className="mt-2 space-y-2">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/overlay.png"
                  className="text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                <Button size="sm" className="w-full" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
                  Use URL
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}

      {/* Text layer properties */}
      {selectedLayer.type === 'text' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Text Content</Label>
            <Input
              value={selectedLayer.text_content || ''}
              onChange={(e) => onLayerUpdate({ text_content: e.target.value })}
              className="text-sm"
              placeholder="Enter text..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Font Size</Label>
            <Input
              type="number"
              value={selectedLayer.font_size || 36}
              onChange={(e) => onLayerUpdate({ font_size: Number(e.target.value) })}
              className="text-sm"
              min={8}
              max={200}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Text Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedLayer.color || '#000000'}
                onChange={(e) => onLayerUpdate({ color: e.target.value })}
                className="h-8 w-8 rounded border cursor-pointer"
              />
              <Input
                value={selectedLayer.color || '#000000'}
                onChange={(e) => onLayerUpdate({ color: e.target.value })}
                className="flex-1 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selectedLayer.background_color || '#FFFFFF'}
                onChange={(e) => onLayerUpdate({ background_color: e.target.value })}
                className="h-8 w-8 rounded border cursor-pointer"
              />
              <Input
                value={selectedLayer.background_color || ''}
                onChange={(e) => onLayerUpdate({ background_color: e.target.value })}
                className="flex-1 font-mono text-sm"
                placeholder="None"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Text Align</Label>
            <Select
              value={selectedLayer.text_align || 'center'}
              onValueChange={(v) => onLayerUpdate({ text_align: v as 'left' | 'center' | 'right' })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Delete button */}
      <Button
        variant="destructive"
        size="sm"
        className="w-full mt-4"
        onClick={onLayerDelete}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete Layer
      </Button>
    </div>
  )
}

// Reusable image grid for selecting from thumbnails
function ImageGrid({
  images,
  onSelect,
  currentUrl,
}: {
  images: ImageAsset[]
  onSelect: (url: string) => void
  currentUrl?: string
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {images.map((img) => (
        <button
          key={img.id}
          onClick={() => onSelect(img.storage_url)}
          className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${
            currentUrl === img.storage_url
              ? 'border-primary ring-1 ring-primary'
              : 'border-transparent hover:border-primary/50'
          }`}
        >
          <img
            src={img.storage_url}
            alt={img.name || ''}
            className="w-full h-full object-cover"
          />
        </button>
      ))}
    </div>
  )
}
