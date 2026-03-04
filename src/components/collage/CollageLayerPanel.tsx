'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Image,
  Type,
  Sparkles,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  Layers,
} from 'lucide-react'
import type { CollageLayer, CollageLayerType } from '@/lib/types/collage'

interface CollageLayerPanelProps {
  layers: CollageLayer[]
  selectedLayerId: string | null
  onLayerSelect: (layerId: string) => void
  onLayerDelete: (layerId: string) => void
  onLayerReorder: (layerId: string, direction: 'up' | 'down') => void
  onAddLayer: (type: CollageLayerType) => void
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  image: <Image className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
  overlay: <Sparkles className="h-3.5 w-3.5" />,
  background: <Layers className="h-3.5 w-3.5" />,
}

const TYPE_COLORS: Record<string, string> = {
  image: 'text-purple-500',
  text: 'text-amber-500',
  overlay: 'text-pink-500',
  background: 'text-blue-500',
}

export function CollageLayerPanel({
  layers,
  selectedLayerId,
  onLayerSelect,
  onLayerDelete,
  onLayerReorder,
  onAddLayer,
}: CollageLayerPanelProps) {
  // Sort descending by z_index (highest = top of visual list)
  const sortedLayers = [...layers].sort((a, b) => b.z_index - a.z_index)

  return (
    <div className="border rounded-lg bg-background">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold">Layers</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddLayer('image')}>
              <Image className="h-4 w-4 mr-2" /> Image Cell
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddLayer('text')}>
              <Type className="h-4 w-4 mr-2" /> Text Block
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddLayer('overlay')}>
              <Sparkles className="h-4 w-4 mr-2" /> Overlay / Badge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        {sortedLayers.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground text-center">
            No layers yet. Add an image, text, or overlay to start.
          </p>
        ) : (
          sortedLayers.map((layer, idx) => {
            const isSelected = layer.id === selectedLayerId
            return (
              <div
                key={layer.id}
                onClick={() => onLayerSelect(layer.id)}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-b-0 transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-l-2 border-l-primary'
                    : 'hover:bg-muted/50'
                }`}
              >
                <span className={TYPE_COLORS[layer.type] || 'text-muted-foreground'}>
                  {TYPE_ICONS[layer.type] || <Layers className="h-3.5 w-3.5" />}
                </span>

                <span className="flex-1 text-sm truncate">
                  {layer.name || layer.type}
                </span>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={idx === 0}
                    onClick={(e) => { e.stopPropagation(); onLayerReorder(layer.id, 'up') }}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={idx === sortedLayers.length - 1}
                    onClick={(e) => { e.stopPropagation(); onLayerReorder(layer.id, 'down') }}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => { e.stopPropagation(); onLayerDelete(layer.id) }}
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
