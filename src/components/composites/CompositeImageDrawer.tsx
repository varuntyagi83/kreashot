'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Sparkles,
  Camera,
  Loader2,
  ArrowLeftRight,
  ExternalLink,
} from 'lucide-react'
import { driveImgSrc } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Composite {
  id: string
  name: string
  slug: string
  storage_url: string
  gdrive_file_id: string | null
  created_at: string
  generation_time_ms: number | null
  aspect_ratio: string | null
  angled_shot: {
    id: string
    angle_name: string
    angle_description: string | null
  }
  background: {
    id: string
    name: string
    description: string | null
  }
}

// Full angled shot record from GET /angled-shots (includes product + product_image)
interface AngledShotFull {
  id: string
  angle_name: string
  display_name: string
  storage_url: string
  gdrive_file_id: string | null
  product: { id: string; name: string; slug: string }
  product_image: { id: string; file_name: string }
}

interface CompositeImageDrawerProps {
  composite: Composite | null
  composites: Composite[]
  categoryId: string
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  onRefresh: () => void
}

const RATIOS = ['1:1', '4:5', '9:16', '16:9', '3:4']
const RESOLUTIONS = ['Original', '1K', '2K', '4K']
const FORMATS_DL = ['JPEG', 'WebP', 'PNG']

export function CompositeImageDrawer({
  composite,
  composites,
  categoryId,
  currentIndex,
  onClose,
  onNavigate,
  onRefresh,
}: CompositeImageDrawerProps) {
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isChangingRatio, setIsChangingRatio] = useState(false)
  const [selectedRatio, setSelectedRatio] = useState('1:1')
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false)
  const [isSwappingProduct, setIsSwappingProduct] = useState(false)
  const [angledShots, setAngledShots] = useState<AngledShotFull[]>([])
  const [selectedNewProductId, setSelectedNewProductId] = useState<string | null>(null)
  const [loadingShots, setLoadingShots] = useState(false)
  const [selectedResolution, setSelectedResolution] = useState('Original')
  const [selectedFormat, setSelectedFormat] = useState('JPEG')

  useEffect(() => {
    if (!composite) return
    setSelectedRatio(composite.aspect_ratio || '1:1')
    setSelectedNewProductId(null)
    fetchAngledShots()
  }, [composite?.id])

  const fetchAngledShots = async () => {
    setLoadingShots(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/angled-shots`)
      const data = await res.json()
      if (res.ok) setAngledShots(data.angledShots || [])
    } catch { /* silent */ } finally {
      setLoadingShots(false)
    }
  }

  // Find the full angled shot record for the current composite's shot
  const currentShot = angledShots.find(s => s.id === composite?.angled_shot.id)

  const handleRegenerate = async () => {
    if (!composite) return
    setIsRegenerating(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/composites/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'selected',
          pairs: [{ angledShotId: composite.angled_shot.id, backgroundId: composite.background.id }],
          format: composite.aspect_ratio || '1:1',
          superimpose: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Regeneration failed')
      toast.success('New variation generated!')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to regenerate')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleChangeRatio = async () => {
    if (!composite) return
    if (selectedRatio === (composite.aspect_ratio || '1:1')) {
      toast.error('Choose a different ratio first')
      return
    }
    setIsChangingRatio(true)
    try {
      const res = await fetch(
        `/api/categories/${categoryId}/composites/${composite.id}/reformat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formats: [selectedRatio] }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reformat failed')
      toast.success(`Reformatted to ${selectedRatio}!`)
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to change aspect ratio')
    } finally {
      setIsChangingRatio(false)
    }
  }

  const handleGenerateAngles = async () => {
    if (!composite || !currentShot) {
      toast.error('Could not identify product. Try refreshing.')
      return
    }
    setIsGeneratingAngles(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/angled-shots/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: currentShot.product.id,
          productImageId: currentShot.product_image.id,
          // No angleName = bulk mode (all angles)
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate angles')
      toast.success('Angles generated! Check the Products tab.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate angles')
    } finally {
      setIsGeneratingAngles(false)
    }
  }

  const handleSwapProduct = async () => {
    if (!composite || !selectedNewProductId) return
    setIsSwappingProduct(true)
    try {
      const res = await fetch(
        `/api/categories/${categoryId}/composites/${composite.id}/swap-product`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newAngledShotId: selectedNewProductId }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Swap failed')
      toast.success('Product swapped — new photoshoot generated!')
      onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to swap product')
    } finally {
      setIsSwappingProduct(false)
    }
  }

  const handleDownload = () => {
    if (!composite) return
    const link = document.createElement('a')
    link.href = composite.storage_url
    link.download = `${composite.slug}.${selectedFormat.toLowerCase()}`
    link.target = '_blank'
    link.click()
    toast.success('Download started')
  }

  if (!composite) return null

  // All angled shots except the current one (for swap product)
  const swapOptions = angledShots.filter(s => s.id !== composite.angled_shot.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {/* Drawer container */}
      <div className="relative bg-white rounded-2xl w-full max-w-6xl max-h-[92vh] flex mx-4 shadow-2xl overflow-hidden">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* LEFT: Image preview */}
        <div className="flex-1 bg-[#F5F5F3] flex flex-col min-h-0 min-w-0">
          {/* Image area */}
          <div className="relative flex-1 flex items-center justify-center p-8 min-h-0">
            <img
              src={driveImgSrc(composite.storage_url, composite.gdrive_file_id)}
              alt={composite.name}
              className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
            />

            {/* Prev/Next arrows */}
            {composites.length > 1 && (
              <>
                <button
                  onClick={() => onNavigate((currentIndex - 1 + composites.length) % composites.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => onNavigate((currentIndex + 1) % composites.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {/* Metadata chips */}
            <div className="absolute bottom-3 left-3 flex gap-2 pointer-events-none">
              {composite.generation_time_ms != null && (
                <span className="bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded-full">
                  {(composite.generation_time_ms / 1000).toFixed(1)}s
                </span>
              )}
              {composite.aspect_ratio && (
                <span className="bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded-full">
                  {composite.aspect_ratio}
                </span>
              )}
            </div>
          </div>

          {/* Image metadata footer */}
          <div className="px-6 py-4 border-t bg-white flex-shrink-0">
            <p className="text-sm font-semibold text-foreground line-clamp-1">{composite.name}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              <span>Shot: {composite.angled_shot?.angle_name || 'Unknown'}</span>
              <span>·</span>
              <span>Scene: {composite.background?.name || 'Unknown'}</span>
              <span>·</span>
              <span>{new Date(composite.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center mt-2">
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} of {composites.length}
              </span>
              <button
                onClick={() => window.open(composite.storage_url, '_blank')}
                className="ml-auto text-xs text-[#7C5DFA] hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Open in tab
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Action panel */}
        <div className="w-[340px] flex-shrink-0 border-l overflow-y-auto">
          <div className="p-4 space-y-3">

            {/* 1. Regenerate */}
            <div className="rounded-xl border border-muted p-4">
              <p className="text-sm font-semibold mb-1">Regenerate</p>
              <p className="text-xs text-muted-foreground mb-3">
                Create a new variation with the same product + scene.
              </p>
              <Button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                size="sm"
                className="w-full bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
              >
                {isRegenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                {isRegenerating ? 'Generating...' : 'Regenerate'}
              </Button>
            </div>

            {/* 2. Change Aspect Ratio */}
            <div className="rounded-xl border border-muted p-4">
              <p className="text-sm font-semibold mb-1">Change Aspect Ratio</p>
              <p className="text-xs text-muted-foreground mb-3">
                Reformat this image to a different ratio using AI.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {RATIOS.map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRatio(r)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      selectedRatio === r
                        ? 'bg-[#7C5DFA] text-white border-[#7C5DFA]'
                        : 'text-muted-foreground border-muted hover:border-[#7C5DFA]/50 hover:text-[#7C5DFA]'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <Button
                onClick={handleChangeRatio}
                disabled={isChangingRatio || selectedRatio === (composite.aspect_ratio || '1:1')}
                size="sm"
                variant="outline"
                className="w-full border-[#7C5DFA] text-[#7C5DFA] hover:bg-[#7C5DFA]/5"
              >
                {isChangingRatio
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  : <ArrowLeftRight className="h-3.5 w-3.5 mr-2" />}
                {isChangingRatio ? 'Reformatting...' : 'Apply Ratio'}
              </Button>
            </div>

            {/* 3. Generate Angles */}
            <div className="rounded-xl border border-muted p-4">
              <p className="text-sm font-semibold mb-1">Generate Angles</p>
              <p className="text-xs text-muted-foreground mb-3">
                Generate all 7 angled shots for{' '}
                <span className="font-medium text-foreground">
                  {currentShot?.product.name || composite.angled_shot.angle_name}
                </span>.
              </p>
              <Button
                onClick={handleGenerateAngles}
                disabled={isGeneratingAngles || !currentShot}
                size="sm"
                variant="outline"
                className="w-full border-[#7C5DFA] text-[#7C5DFA] hover:bg-[#7C5DFA]/5"
              >
                {isGeneratingAngles
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  : <Camera className="h-3.5 w-3.5 mr-2" />}
                {isGeneratingAngles ? 'Generating angles...' : 'Generate All Angles'}
              </Button>
            </div>

            {/* 4. Swap Product */}
            <div className="rounded-xl border border-muted p-4">
              <p className="text-sm font-semibold mb-1">Swap Product</p>
              <p className="text-xs text-muted-foreground mb-3">
                Replace the product in this scene with a different one.
              </p>

              {loadingShots ? (
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : swapOptions.length > 0 ? (
                <div className="grid grid-cols-5 gap-1.5 mb-3 max-h-[130px] overflow-y-auto pr-0.5">
                  {swapOptions.map(shot => (
                    <button
                      key={shot.id}
                      onClick={() => setSelectedNewProductId(
                        shot.id === selectedNewProductId ? null : shot.id
                      )}
                      title={shot.display_name || shot.angle_name}
                      className={cn(
                        'aspect-square rounded-lg overflow-hidden border-2 transition-all',
                        selectedNewProductId === shot.id
                          ? 'border-[#7C5DFA] ring-1 ring-[#7C5DFA]/30'
                          : 'border-transparent hover:border-muted-foreground/30'
                      )}
                    >
                      <img
                        src={driveImgSrc(shot.storage_url, shot.gdrive_file_id)}
                        alt={shot.display_name || shot.angle_name}
                        className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">
                  No other product shots available.
                </p>
              )}

              <Button
                onClick={handleSwapProduct}
                disabled={isSwappingProduct || !selectedNewProductId}
                size="sm"
                variant="outline"
                className="w-full border-[#7C5DFA] text-[#7C5DFA] hover:bg-[#7C5DFA]/5"
              >
                {isSwappingProduct
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  : <Camera className="h-3.5 w-3.5 mr-2" />}
                {isSwappingProduct ? 'Swapping...' : 'Swap Product'}
              </Button>
            </div>

            {/* 5. Download */}
            <div className="rounded-xl border border-muted p-4">
              <p className="text-sm font-semibold mb-3">Download</p>
              <div className="flex gap-3 mb-3">
                {/* Resolution */}
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Resolution</p>
                  <div className="flex flex-col gap-1">
                    {RESOLUTIONS.map(r => (
                      <button
                        key={r}
                        onClick={() => setSelectedResolution(r)}
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium border text-left transition-colors',
                          selectedResolution === r
                            ? 'bg-[#7C5DFA]/10 text-[#7C5DFA] border-[#7C5DFA]/30'
                            : 'text-muted-foreground border-muted hover:border-[#7C5DFA]/30 hover:text-[#7C5DFA]'
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Format */}
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">Format</p>
                  <div className="flex flex-col gap-1">
                    {FORMATS_DL.map(f => (
                      <button
                        key={f}
                        onClick={() => setSelectedFormat(f)}
                        className={cn(
                          'px-2 py-1 rounded-md text-xs font-medium border text-left transition-colors',
                          selectedFormat === f
                            ? 'bg-[#7C5DFA]/10 text-[#7C5DFA] border-[#7C5DFA]/30'
                            : 'text-muted-foreground border-muted hover:border-[#7C5DFA]/30 hover:text-[#7C5DFA]'
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Note: Resolution conversion requires Phase 15 API. Currently downloads original.
              </p>
              <Button
                onClick={handleDownload}
                size="sm"
                className="w-full bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
              >
                <Download className="h-3.5 w-3.5 mr-2" />
                Download
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
