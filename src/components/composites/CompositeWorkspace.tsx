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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  SlidersHorizontal,
  Plus,
  X,
  Sparkles,
  Image as ImageIcon,
  Camera,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { driveImgSrc } from '@/lib/utils'
import { FORMATS } from '@/lib/formats'
import { CompositeGallery } from './CompositeGallery'

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
  const [scenePickerOpen, setScenePickerOpen] = useState(false)
  const [availableScenes, setAvailableScenes] = useState<Scene[]>([])
  const [loadingScenes, setLoadingScenes] = useState(false)

  // Product selection
  const [selectedProducts, setSelectedProducts] = useState<ProductShot[]>([])
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [availableProducts, setAvailableProducts] = useState<ProductShot[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const fetchScenes = async () => {
    setLoadingScenes(true)
    try {
      const res = await fetch(`/api/categories/${category.id}/backgrounds?format=${selectedFormat}`)
      const data = await res.json()
      if (res.ok) setAvailableScenes(data.backgrounds || [])
    } catch { /* silent */ } finally {
      setLoadingScenes(false)
    }
  }

  const fetchProducts = async () => {
    setLoadingProducts(true)
    try {
      const res = await fetch(`/api/categories/${category.id}/angled-shots?format=${selectedFormat}`)
      const data = await res.json()
      if (res.ok) setAvailableProducts(data.angledShots || [])
    } catch { /* silent */ } finally {
      setLoadingProducts(false)
    }
  }

  const openScenePicker = () => {
    fetchScenes()
    setScenePickerOpen(true)
  }

  const openProductPicker = () => {
    fetchProducts()
    setProductPickerOpen(true)
  }

  const toggleScene = (scene: Scene) => {
    setSelectedScenes(prev =>
      prev.find(s => s.id === scene.id)
        ? prev.filter(s => s.id !== scene.id)
        : [...prev, scene]
    )
  }

  const toggleProduct = (shot: ProductShot) => {
    setSelectedProducts(prev =>
      prev.find(p => p.id === shot.id)
        ? prev.filter(p => p.id !== shot.id)
        : [...prev, shot]
    )
  }

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
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="controls-toggle" className="text-sm text-muted-foreground cursor-pointer select-none">
            Controls
          </Label>
          <Switch
            id="controls-toggle"
            checked={showControls}
            onCheckedChange={setShowControls}
            className="data-[state=checked]:bg-[#7C5DFA]"
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
                    className="h-7 w-7 p-0 text-[#7C5DFA]"
                    onClick={openScenePicker}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {selectedScenes.length === 0 ? (
                  <button
                    onClick={openScenePicker}
                    className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-[#7C5DFA]/40 hover:text-[#7C5DFA] transition-colors"
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
                      onClick={openScenePicker}
                      className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:border-[#7C5DFA]/40 hover:text-[#7C5DFA] transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
                    className="h-7 w-7 p-0 text-[#7C5DFA]"
                    onClick={openProductPicker}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {selectedProducts.length === 0 ? (
                  <button
                    onClick={openProductPicker}
                    className="w-full aspect-video rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-[#7C5DFA]/40 hover:text-[#7C5DFA] transition-colors"
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
                      onClick={openProductPicker}
                      className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground hover:border-[#7C5DFA]/40 hover:text-[#7C5DFA] transition-colors"
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
                  className="text-sm resize-none border-[#E0E0E0] focus:border-[#7C5DFA]"
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
                className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white h-8 px-3 flex-shrink-0"
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

      {/* Scene Picker Dialog */}
      <Dialog open={scenePickerOpen} onOpenChange={setScenePickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose Scenes</DialogTitle>
          </DialogHeader>
          {loadingScenes ? (
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : availableScenes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No scenes yet — generate some in the Scenes tab first.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {availableScenes.map(scene => {
                const selected = selectedScenes.some(s => s.id === scene.id)
                return (
                  <button
                    key={scene.id}
                    onClick={() => toggleScene(scene)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selected
                        ? 'border-[#7C5DFA] ring-2 ring-[#7C5DFA]/20'
                        : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                  >
                    <img
                      src={driveImgSrc(scene.public_url || scene.storage_url, scene.gdrive_file_id)}
                      alt={scene.name}
                      className="w-full h-full object-cover"
                    />
                    {selected && (
                      <div className="absolute top-1.5 right-1.5 bg-[#7C5DFA] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs line-clamp-1">{scene.name}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-sm text-muted-foreground">{selectedScenes.length} selected</span>
            <Button
              size="sm"
              className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
              onClick={() => setScenePickerOpen(false)}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Picker Dialog */}
      <Dialog open={productPickerOpen} onOpenChange={setProductPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose Products</DialogTitle>
          </DialogHeader>
          {loadingProducts ? (
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : availableProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No product shots yet — generate angled shots in the Products tab first.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {availableProducts.map(shot => {
                const selected = selectedProducts.some(p => p.id === shot.id)
                return (
                  <button
                    key={shot.id}
                    onClick={() => toggleProduct(shot)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selected
                        ? 'border-[#7C5DFA] ring-2 ring-[#7C5DFA]/20'
                        : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                  >
                    <img
                      src={driveImgSrc(shot.public_url || shot.storage_url, shot.gdrive_file_id)}
                      alt={shot.display_name || shot.angle_name}
                      className="w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    {selected && (
                      <div className="absolute top-1.5 right-1.5 bg-[#7C5DFA] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs line-clamp-1">
                        {shot.display_name || shot.angle_name}
                      </p>
                      {shot.product && (
                        <p className="text-white/60 text-xs line-clamp-1">{shot.product.name}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-sm text-muted-foreground">{selectedProducts.length} selected</span>
            <Button
              size="sm"
              className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
              onClick={() => setProductPickerOpen(false)}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
