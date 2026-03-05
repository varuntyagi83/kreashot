'use client'

import { useState, useEffect } from 'react'
import { TemplateLayer } from '@/lib/types/template'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'

interface AssetOption {
  id: string
  name: string
  url: string
}

interface PropertiesPanelProps {
  layer: TemplateLayer | null
  categoryId: string
  format: string
  onLayerUpdate: (updates: Partial<TemplateLayer>) => void
  onLayerDelete: (layerId: string) => void
}

export function PropertiesPanel({ layer, categoryId, format, onLayerUpdate, onLayerDelete }: PropertiesPanelProps) {
  const [overlays, setOverlays] = useState<AssetOption[]>([])
  const [fonts, setFonts] = useState<AssetOption[]>([])
  const [angledShots, setAngledShots] = useState<AssetOption[]>([])
  const [backgrounds, setBackgrounds] = useState<AssetOption[]>([])
  const [composites, setComposites] = useState<AssetOption[]>([])

  useEffect(() => {
    if (layer?.type === 'overlay' || layer?.type === 'text') {
      fetch('/api/brand-assets')
        .then((r) => r.json())
        .then((data) => {
          const assets = data.assets || []
          setOverlays(
            assets
              .filter((a: any) => a.asset_type === 'overlay')
              .map((a: any) => ({ id: a.id, name: a.name, url: a.storage_url }))
          )
          setFonts(
            assets
              .filter((a: any) => a.asset_type === 'font')
              .map((a: any) => ({ id: a.id, name: a.name, url: a.storage_url }))
          )
        })
        .catch(() => {})
    }

    if (layer?.type === 'product') {
      fetch(`/api/categories/${categoryId}/angled-shots?format=${encodeURIComponent(format)}`)
        .then((r) => r.json())
        .then((data) => {
          setAngledShots(
            (data.angledShots || []).map((s: any) => ({
              id: s.id,
              name: s.display_name || s.angle_description || s.angle_name || `Shot ${s.id.slice(0, 6)}`,
              url: s.public_url || s.storage_url,
            }))
          )
        })
        .catch(() => {})
    }

    if (layer?.type === 'background') {
      fetch(`/api/categories/${categoryId}/backgrounds?format=${encodeURIComponent(format)}`)
        .then((r) => r.json())
        .then((data) => {
          setBackgrounds(
            (data.backgrounds || []).map((b: any) => ({
              id: b.id,
              name: b.name || b.prompt?.substring(0, 40) || `Background ${b.id.slice(0, 6)}`,
              url: b.storage_url,
            }))
          )
        })
        .catch(() => {})
    }

    if (layer?.type === 'composite') {
      fetch(`/api/categories/${categoryId}/composites?format=${encodeURIComponent(format)}`)
        .then((r) => r.json())
        .then((data) => {
          setComposites(
            (data.composites || []).map((c: any) => {
              const label = c.name
                || [c.angled_shot?.angle_name, c.background?.name].filter(Boolean).join(' + ')
                || `Composite ${c.id.slice(0, 6)}`
              return { id: c.id, name: label, url: c.storage_url }
            })
          )
        })
        .catch(() => {})
    }
  }, [layer?.type, categoryId, format])

  if (!layer) {
    return (
      <div className="w-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center px-4">
          Select a layer to edit its properties
        </p>
      </div>
    )
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-sm">Properties</h3>
        <p className="text-xs text-muted-foreground mt-1 capitalize">
          {layer.type} Layer
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Layer Name */}
        <div className="space-y-2">
          <Label htmlFor="layer-name" className="text-xs">
            Name
          </Label>
          <Input
            id="layer-name"
            value={layer.name || ''}
            onChange={(e) => onLayerUpdate({ name: e.target.value })}
            placeholder={layer.type === 'text' ? 'tagline' : layer.type}
            className="h-8 text-sm"
          />
          {layer.type === 'text' && (
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">tagline</code> to match on-image copy.
              Headline, hook, and CTA belong in Meta copy fields (Ad Export), not on the image.
            </p>
          )}
        </div>

        {/* Position */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Position</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="layer-x" className="text-xs text-muted-foreground">
                X (%)
              </Label>
              <Input
                id="layer-x"
                type="number"
                value={Math.round(layer.x * 10) / 10}
                onChange={(e) =>
                  onLayerUpdate({ x: parseFloat(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="layer-y" className="text-xs text-muted-foreground">
                Y (%)
              </Label>
              <Input
                id="layer-y"
                type="number"
                value={Math.round(layer.y * 10) / 10}
                onChange={(e) =>
                  onLayerUpdate({ y: parseFloat(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Size</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="layer-width" className="text-xs text-muted-foreground">
                Width (%)
              </Label>
              <Input
                id="layer-width"
                type="number"
                value={Math.round(layer.width * 10) / 10}
                onChange={(e) =>
                  onLayerUpdate({ width: parseFloat(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="layer-height" className="text-xs text-muted-foreground">
                Height (%)
              </Label>
              <Input
                id="layer-height"
                type="number"
                value={Math.round(layer.height * 10) / 10}
                onChange={(e) =>
                  onLayerUpdate({ height: parseFloat(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Z-Index */}
        <div className="space-y-2">
          <Label htmlFor="layer-z" className="text-xs">
            Z-Index (Layer Order)
          </Label>
          <Input
            id="layer-z"
            type="number"
            value={layer.z_index}
            onChange={(e) =>
              onLayerUpdate({ z_index: parseInt(e.target.value) || 0 })
            }
            className="h-8 text-sm"
          />
        </div>

        {/* Text-specific properties */}
        {layer.type === 'text' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="sample-text" className="text-xs">
                Sample Text (canvas preview)
              </Label>
              <Input
                id="sample-text"
                value={layer.sample_text || ''}
                onChange={(e) => onLayerUpdate({ sample_text: e.target.value })}
                placeholder="e.g. Pure. Simple. Effective."
                className="h-8 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Shown in canvas only. Actual copy is injected at final asset generation.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="font-size" className="text-xs">
                Font Size (px)
              </Label>
              <Input
                id="font-size"
                type="number"
                value={layer.font_size || 16}
                onChange={(e) =>
                  onLayerUpdate({ font_size: parseInt(e.target.value) || 16 })
                }
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="font-family" className="text-xs">
                Font
              </Label>
              <Select
                value={layer.font_url || layer.font_family || 'Arial'}
                onValueChange={(value) => {
                  // If value is a URL (starts with http), it's a custom font
                  if (value.startsWith('http')) {
                    const fontAsset = fonts.find(f => f.url === value)
                    onLayerUpdate({ font_url: value, font_family: fontAsset?.name || 'Custom' })
                  } else {
                    onLayerUpdate({ font_url: undefined, font_family: value })
                  }
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fonts.length > 0 && (
                    <>
                      {fonts.map((f) => (
                        <SelectItem key={f.id} value={f.url}>
                          {f.name} (custom)
                        </SelectItem>
                      ))}
                    </>
                  )}
                  <SelectItem value="serif-bold">Bold Serif</SelectItem>
                  <SelectItem value="serif-regular">Serif</SelectItem>
                  <SelectItem value="Arial">Arial (Sans)</SelectItem>
                  <SelectItem value="Helvetica">Helvetica (Sans)</SelectItem>
                  <SelectItem value="Georgia">Georgia (Serif)</SelectItem>
                  <SelectItem value="Times New Roman">Times New Roman (Serif)</SelectItem>
                  <SelectItem value="Verdana">Verdana (Sans)</SelectItem>
                </SelectContent>
              </Select>
              {fonts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Upload custom fonts (.ttf, .otf) in Brand Assets to use them here.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="text-align" className="text-xs">
                Text Align
              </Label>
              <Select
                value={layer.text_align || 'left'}
                onValueChange={(value: any) =>
                  onLayerUpdate({ text_align: value })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-chars" className="text-xs">
                Max Characters
              </Label>
              <Input
                id="max-chars"
                type="number"
                value={layer.max_chars || 50}
                onChange={(e) =>
                  onLayerUpdate({ max_chars: parseInt(e.target.value) || 50 })
                }
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="text-color" className="text-xs">
                Text Color
              </Label>
              <Input
                id="text-color"
                type="color"
                value={layer.color || '#000000'}
                onChange={(e) => onLayerUpdate({ color: e.target.value })}
                className="h-8"
              />
            </div>
          </>
        )}

        {/* Product-specific properties */}
        {layer.type === 'product' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="product-align" className="text-xs">
                Alignment
              </Label>
              <Select
                value={layer.alignment || 'center'}
                onValueChange={(value: any) => onLayerUpdate({ alignment: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Preview Image (canvas only)</Label>
              {angledShots.length > 0 ? (
                <Select
                  value={layer.preview_url || '__none__'}
                  onValueChange={(val) =>
                    onLayerUpdate({ preview_url: val === '__none__' ? '' : val })
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select angled shot to preview" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {angledShots.map((s) => (
                      <SelectItem key={s.id} value={s.url}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-amber-600">
                  No angled shots yet. Generate them in the Angled Shots tab first.
                </p>
              )}
              {layer.preview_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={layer.preview_url}
                  alt="Product preview"
                  className="w-full rounded border object-contain bg-muted"
                />
              )}
            </div>
          </>
        )}

        {/* Background-specific properties */}
        {layer.type === 'background' && (
          <div className="space-y-2">
            <Label className="text-xs">Preview Image (canvas only)</Label>
            {backgrounds.length > 0 ? (
              <Select
                value={layer.preview_url || '__none__'}
                onValueChange={(val) =>
                  onLayerUpdate({ preview_url: val === '__none__' ? '' : val })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select background to preview" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {backgrounds.map((b) => (
                    <SelectItem key={b.id} value={b.url}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-amber-600">
                No backgrounds yet. Generate them in the Backgrounds tab first.
              </p>
            )}
            {layer.preview_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={layer.preview_url}
                alt="Background preview"
                className="w-full rounded border"
              />
            )}
          </div>
        )}

        {/* Logo-specific properties */}
        {layer.type === 'logo' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="logo-position" className="text-xs">
                Position Preset
              </Label>
              <Select
                value={layer.position || 'top-left'}
                onValueChange={(value: any) => onLayerUpdate({ position: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-left">Top Left</SelectItem>
                  <SelectItem value="top-right">Top Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo-padding" className="text-xs">
                Padding (px)
              </Label>
              <Input
                id="logo-padding"
                type="number"
                value={layer.padding || 10}
                onChange={(e) =>
                  onLayerUpdate({ padding: parseInt(e.target.value) || 10 })
                }
                className="h-8 text-sm"
              />
            </div>
          </>
        )}

        {/* Composite-specific properties */}
        {layer.type === 'composite' && (
          <div className="space-y-2">
            <Label className="text-xs">Composite Image</Label>
            {composites.length > 0 ? (
              <Select
                value={layer.source_url || '__none__'}
                onValueChange={(val) =>
                  onLayerUpdate({ source_url: val === '__none__' ? '' : val })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select composite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (use selected at generation)</SelectItem>
                  {composites.map((c) => (
                    <SelectItem key={c.id} value={c.url}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-amber-600">
                No composites yet. Generate them in the Composites tab first.
              </p>
            )}
            {layer.source_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={layer.source_url}
                alt="Composite preview"
                className="w-full rounded border object-contain bg-muted"
              />
            )}
            <p className="text-xs text-muted-foreground">
              A composite is a pre-combined product + background image.
              Leave as &quot;None&quot; to use whichever composite is selected during final asset generation.
            </p>
          </div>
        )}

        {/* Overlay-specific properties */}
        {layer.type === 'overlay' && (
          <div className="space-y-2">
            <Label className="text-xs">Graphic Overlay Image</Label>
            {overlays.length > 0 ? (
              <Select
                value={layer.source_url || '__none__'}
                onValueChange={(val) =>
                  onLayerUpdate({ source_url: val === '__none__' ? '' : val })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select overlay PNG" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {overlays.map((o) => (
                    <SelectItem key={o.id} value={o.url}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-amber-600">
                No graphic overlays uploaded yet. Go to Brand Assets → Upload → Graphic Overlay.
              </p>
            )}
            {layer.source_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={layer.source_url}
                alt="Overlay preview"
                className="w-full rounded border bg-checkerboard"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Upload transparent PNGs (circles, grids, frames) in Brand Assets.
              This layer is composited between the background and text layers.
            </p>
          </div>
        )}
      </div>

      {/* Delete layer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => onLayerDelete(layer.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Layer
        </Button>
      </div>
    </div>
  )
}
