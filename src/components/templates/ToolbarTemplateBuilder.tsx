'use client'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { 
  Image, 
  Package, 
  Type, 
  Tag, 
  Grid3x3, 
  Save, 
  Download,
  Plus
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ToolbarTemplateBuilderProps {
  onAddLayer: (type: 'background' | 'product' | 'text' | 'logo') => void
  onAddSafeZone: (type: 'safe' | 'restricted') => void
  onSave: () => void
  onToggleGrid: () => void
  gridEnabled: boolean
  isSaving?: boolean
}

export function ToolbarTemplateBuilder({
  onAddLayer,
  onAddSafeZone,
  onSave,
  onToggleGrid,
  gridEnabled,
  isSaving = false,
}: ToolbarTemplateBuilderProps) {
  return (
    <div className="h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center gap-2">
      {/* Add Layer Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Layer
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onAddLayer('background')}>
            <Image className="h-4 w-4 mr-2" />
            Background Layer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddLayer('product')}>
            <Package className="h-4 w-4 mr-2" />
            Product Layer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddLayer('text')}>
            <Type className="h-4 w-4 mr-2" />
            Text Layer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddLayer('logo')}>
            <Tag className="h-4 w-4 mr-2" />
            Logo Layer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Safe Zone Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Grid3x3 className="h-4 w-4 mr-2" />
            Add Safe Zone
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onAddSafeZone('safe')}>
            <span className="inline-block w-3 h-3 rounded bg-green-500 mr-2" />
            Safe Zone (Text Allowed)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddSafeZone('restricted')}>
            <span className="inline-block w-3 h-3 rounded bg-red-500 mr-2" />
            Restricted Zone (No Text)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6" />

      {/* Grid Toggle */}
      <Button
        variant={gridEnabled ? 'default' : 'outline'}
        size="sm"
        onClick={onToggleGrid}
      >
        <Grid3x3 className="h-4 w-4 mr-2" />
        Grid
      </Button>

      <div className="flex-1" />

      {/* Save Button */}
      <Button
        variant="default"
        size="sm"
        onClick={onSave}
        disabled={isSaving}
      >
        <Save className="h-4 w-4 mr-2" />
        {isSaving ? 'Saving...' : 'Save Template'}
      </Button>
    </div>
  )
}
