'use client'

import { TemplateLayer } from '@/lib/types/template'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

interface PropertiesPanelProps {
  layer: TemplateLayer | null
  onLayerUpdate: (updates: Partial<TemplateLayer>) => void
}

export function PropertiesPanel({ layer, onLayerUpdate }: PropertiesPanelProps) {
  if (!layer) {
    return (
      <div className="w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center px-4">
          Select a layer to edit its properties
        </p>
      </div>
    )
  }

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
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
            placeholder={layer.type}
            className="h-8 text-sm"
          />
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
              <Label
                htmlFor="layer-width"
                className="text-xs text-muted-foreground"
              >
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
              <Label
                htmlFor="layer-height"
                className="text-xs text-muted-foreground"
              >
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
                Font Family
              </Label>
              <Select
                value={layer.font_family || 'Arial'}
                onValueChange={(value) => onLayerUpdate({ font_family: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arial">Arial</SelectItem>
                  <SelectItem value="Helvetica">Helvetica</SelectItem>
                  <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                  <SelectItem value="Georgia">Georgia</SelectItem>
                  <SelectItem value="Verdana">Verdana</SelectItem>
                </SelectContent>
              </Select>
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
      </div>
    </div>
  )
}
