'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Plus,
  X,
  Sparkles,
  Image as ImageIcon,
  Camera,
  Loader2,
  Palette,
} from 'lucide-react'
import { toast } from 'sonner'
import { driveImgSrc } from '@/lib/utils'
import { FORMATS } from '@/lib/formats'
import { CompositeGallery } from './CompositeGallery'
import { SceneLibraryModal } from './SceneLibraryModal'
import { SelectProductImagesModal } from './SelectProductImagesModal'

interface Category {
  id: string
  name: string
  slug: string
  look_and_feel: string | null
}

interface Scene {
  id: string
  name: string
  storage_url: string
  public_url?: string
  gdrive_file_id?: string | null
}

interface ProductShot {
  id: string
  display_name: string
  angle_name: string
  storage_url: string
  public_url?: string
  gdrive_file_id?: string | null
  product?: { id: string; name: string }
}

interface CompositeWorkspaceProps {
  category: Category
  format?: string
}

// Keep this export for backwards-compat (CompositePreviewGrid still references it)
export interface GeneratedComposite {
  angledShotId: string
  angledShotName: string
  backgroundId: string
  backgroundName: string
  image_base64: string
  image_mime_type: string
  prompt_used: string
}

export function CompositeWorkspace({ category, format = '1:1' }: CompositeWorkspaceProps) {
  const [showControls, setShowControls] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const generatingRef = useRef(false)

  // Generation state
  const [selectedFormat, setSelectedFormat] = useState(format)
  const [count, setCount] = useState('1')
  const [userPrompt, setUserPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  // Scene selection
  const [selectedScenes, setSelectedScenes] = useState<Scene[]>([])
  const [sceneModalOpen, setSceneModalOpen] = useState(false)

  // Product selection
  const [selectedProducts, setSelectedProducts] = useState<ProductShot[]>([])
  const [productModalOpen, setProductModalOpen] = useState(false)

  const n = parseInt(count)
  const totalCombinations = selectedScenes.length * selectedProducts.length * n

  const handleGenerate = async () => {
    if (generatingRef.current) return
    if (selectedProducts.length === 0 || selectedScenes.length === 0) {
      toast.error('Select at least one product and one scene')
      return
    }
    generatingRef.current = true
    setIsGenerating(true)

    // Build pairs, repeated `count` times for variation
    const basePairs = selectedProducts.flatMap(product =>
      selectedScenes.map(scene => ({
        angledShotId: product.id,
        backgroundId: scene.id,
      }))
    )
    const pairs = n === 1 ? basePairs : Array.from({ length: n }, () => basePairs).flat()

    try {
      const res = await fetch(`/api/categories/${category.id}/composites/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'selected',
          pairs,
          userPrompt: userPrompt.trim() || undefined,
          format: selectedFormat,
          superimpose: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      if (!data.results?.length) throw new Error('No composites generated')

      toast.success(`Generated ${data.results.length} photoshoot${data.results.length > 1 ? 's' : ''}!`)
      setRefreshKey(k => k + 1)
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate composites')
    } finally {
      generatingRef.current = false
      setIsGenerating(false)
    }
  }

  const formatKeys = Object.keys(FORMATS)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Photoshoots</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compose product images into scene backgrounds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="controls-toggle" className="text-sm text-muted-foreground cursor-pointer select-none">
            Show Controls
          </Label>
          <Switch
            id="controls-toggle"
            checked={showControls}
            onCheckedChange={setShowControls}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      {/* Main layout */}
      <div className={showControls ? 'flex gap-6 items-start' : ''}>

        {/* LEFT: Controls panel (only when showControls) */}
        {showControls && (
          <div className="w-[300px] flex-shrink-0 flex flex-col gap-3">

            {/* Scenes card */}
            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Scenes</span>
                    {selectedScenes.length > 0 && (
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                        {selectedScenes.length}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-primary"
                    onClick={() => setSceneModalOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {selectedScenes.length === 0 ? (
                  <button
                    onClick={() => setSceneModalOpen(true)}
                    className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <ImageIcon className="h-5 w-5" />
                    <span className="text-xs">Choose a scene</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {selectedScenes.map(scene => (
                      <div key={scene.id} className="relative group aspect-square">
                        <img
                          src={driveImgSrc(scene.public_url || scene.storage_url, scene.gdrive_file_id)}
                          alt={scene.name}
                          className="w-full h-full object-cover rounded-md"
                        />
                        <button
                          onClick={() => setSelectedScenes(prev => prev.filter(s => s.id !== scene.id))}
                          className="absolute -top-1 -right-1 bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setSceneModalOpen(true)}
                      className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Style card */}
            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Style</span>
                    <Badge variant="outline" className="text-xs h-5 px-1.5 text-muted-foreground border-muted-foreground/30">
                      Optional
                    </Badge>
                  </div>
                </div>
                <div className="w-full rounded-lg border border-dashed border-muted-foreground/20 p-3 text-center text-xs text-muted-foreground">
                  Style rules from your Templates tab will be applied automatically.
                </div>
              </CardContent>
            </Card>

            {/* Products card */}
            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">Products</span>
                    {selectedProducts.length > 0 && (
                      <Badge variant="secondary" className="text-xs h-5 px-1.5">
                        {selectedProducts.length}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-primary"
                    onClick={() => setProductModalOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {selectedProducts.length === 0 ? (
                  <button
                    onClick={() => setProductModalOpen(true)}
                    className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <Camera className="h-5 w-5" />
                    <span className="text-xs">Choose a product</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {selectedProducts.map(product => (
                      <div key={product.id} className="relative group aspect-square">
                        <img
                          src={driveImgSrc(product.public_url || product.storage_url, product.gdrive_file_id)}
                          alt={product.display_name || product.angle_name}
                          className="w-full h-full object-cover rounded-md"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                        <button
                          onClick={() => setSelectedProducts(prev => prev.filter(p => p.id !== product.id))}
                          className="absolute -top-1 -right-1 bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setProductModalOpen(true)}
                      className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Prompt card */}
            <Card className="rounded-xl shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium">Prompt</span>
                  <Badge variant="outline" className="text-xs h-5 px-1.5 text-muted-foreground border-muted-foreground/30">
                    Optional
                  </Badge>
                </div>
                <Textarea
                  value={userPrompt}
                  onChange={e => setUserPrompt(e.target.value)}
                  placeholder="e.g., Center the product, morning light atmosphere..."
                  rows={3}
                  maxLength={200}
                  className="text-sm resize-none border-input focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">{userPrompt.length}/200</p>
              </CardContent>
            </Card>

            {/* Bottom action bar */}
            <div className="flex items-center gap-2">
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatKeys.map(f => (
                    <SelectItem key={f} value={f} className="text-xs font-mono">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={count} onValueChange={setCount}>
                <SelectTrigger className="h-8 w-[60px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4', '5'].map(n => (
                    <SelectItem key={n} value={n} className="text-xs">×{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || selectedProducts.length === 0 || selectedScenes.length === 0}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-white h-8 px-3 flex-shrink-0"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {totalCombinations > 0 ? `Generate (${totalCombinations})` : 'Generate'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* RIGHT: Gallery */}
        <div className="flex-1 min-w-0">
          <CompositeGallery
            categoryId={category.id}
            format={format}
            refreshTrigger={refreshKey}
            columns={showControls ? 2 : 5}
          />
        </div>
      </div>

      {/* Scene Library Modal */}
      <SceneLibraryModal
        open={sceneModalOpen}
        onClose={() => setSceneModalOpen(false)}
        categoryId={category.id}
        initialSelected={selectedScenes}
        onConfirm={setSelectedScenes}
      />

      {/* Select Product Images Modal */}
      <SelectProductImagesModal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        categoryId={category.id}
        initialSelected={selectedProducts}
        onConfirm={setSelectedProducts}
      />
    </div>
  )
}
