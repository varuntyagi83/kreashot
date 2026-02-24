'use client'

import { TemplateLayer } from '@/lib/types/template'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Lock, Unlock, Trash2, MoveUp, MoveDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LayerPanelProps {
  layers: TemplateLayer[]
  selectedLayerId: string | null
  onLayerSelect: (layerId: string) => void
  onLayerUpdate: (layerId: string, updates: Partial<TemplateLayer>) => void
  onLayerDelete: (layerId: string) => void
  onLayerReorder: (layerId: string, direction: 'up' | 'down') => void
}

export function LayerPanel({
  layers,
  selectedLayerId,
  onLayerSelect,
  onLayerUpdate,
  onLayerDelete,
  onLayerReorder,
}: LayerPanelProps) {
  const getLayerIcon = (type: TemplateLayer['type']) => {
    switch (type) {
      case 'background':
        return '🖼️'
      case 'product':
        return '📦'
      case 'text':
        return '📝'
      case 'logo':
        return '🏷️'
      default:
        return '▫️'
    }
  }

  const sortedLayers = [...layers].sort((a, b) => b.z_index - a.z_index)

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-sm">Layers</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {layers.length} layer{layers.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedLayers.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No layers yet.
            <br />
            Add a layer to get started.
          </div>
        ) : (
          sortedLayers.map((layer, index) => {
            const isSelected = layer.id === selectedLayerId
            const isFirst = index === 0
            const isLast = index === sortedLayers.length - 1

            return (
              <div
                key={layer.id}
                className={cn(
                  'group flex items-center gap-2 p-2 rounded cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-primary/10 border border-primary'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                onClick={() => onLayerSelect(layer.id)}
              >
                <span className="text-lg">{getLayerIcon(layer.type)}</span>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {layer.name || layer.type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Z:{layer.z_index}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Move up/down */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={isFirst}
                    onClick={(e) => {
                      e.stopPropagation()
                      onLayerReorder(layer.id, 'up')
                    }}
                  >
                    <MoveUp className="h-3 w-3" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={isLast}
                    onClick={(e) => {
                      e.stopPropagation()
                      onLayerReorder(layer.id, 'down')
                    }}
                  >
                    <MoveDown className="h-3 w-3" />
                  </Button>

                  {/* Lock/Unlock */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      onLayerUpdate(layer.id, { locked: !layer.locked })
                    }}
                  >
                    {layer.locked ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      <Unlock className="h-3 w-3" />
                    )}
                  </Button>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      onLayerDelete(layer.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
