'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Loader2, Download, Sparkles, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { getFormatDimensions } from '@/lib/formats'
import { driveImgSrc } from '@/lib/utils'
import { AdLivePreview } from '@/components/final-assets/AdLivePreview'
import { AD_LAYOUT_PRESETS } from '@/lib/ad-layouts'

interface FinalAsset {
  id: string
  name: string
  storage_url: string
  gdrive_file_id: string | null
  format: string
  width: number
  height: number
  created_at: string
  generation_time_ms: number | null
  aspect_ratio: string | null
}

interface PreviewData {
  storageUrl: string
  storagePath: string
  gdriveFileId: string
  name: string
  format: string
  width: number
  height: number
  compositeId: string | null
  copyDocId: string | null
  templateId: string | null
  compositionData: object
}

interface TemplateLayer {
  id: string
  type: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  z_index?: number
  sample_text?: string
  font_size?: number
  font_family?: string
  text_align?: string
  color?: string
  source_url?: string
}

interface Template {
  id: string
  name: string
  format: string
  template_data?: {
    layers?: TemplateLayer[]
    safe_zones?: Array<{
      id: string
      name: string
      x: number
      y: number
      width: number
      height: number
      type: 'safe' | 'restricted'
      color: string
    }>
  }
}

interface Composite {
  id: string
  name: string
  storage_url: string
  created_at: string
  angled_shot?: { angle_name?: string; angle_description?: string }
  background?: { name?: string }
}

interface AngledShot {
  id: string
  angle_name: string
  display_name?: string
  storage_url: string
  public_url: string
  created_at: string
  product?: { name?: string }
}

interface CopyDoc {
  id: string
  copy_type: string
  generated_text: string
  created_at: string
}

interface BrandAsset {
  id: string
  name: string
  asset_type: string
  storage_url: string
}

interface FreeformTextLayer {
  id: string
  text: string
  x: number
  y: number
  width: number
  fontSize: number
  fontFamily: string
  fontUrl?: string  // brand asset font URL for Python compositor
  color: string
  align: 'left' | 'center' | 'right'
}

let _textLayerCounter = 0
function createTextLayer(defaults?: Partial<FreeformTextLayer>): FreeformTextLayer {
  _textLayerCounter++
  return {
    id: `text_${_textLayerCounter}_${Date.now()}`,
    text: '',
    x: 5,
    y: 80,
    width: 90,
    fontSize: 42,
    fontFamily: 'Arial',
    color: '#FFFFFF',
    align: 'center',
    ...defaults,
  }
}

interface FinalAssetsWorkspaceProps {
  categoryId: string
  format?: string
}

export function FinalAssetsWorkspace({ categoryId, format = '1:1' }: FinalAssetsWorkspaceProps) {
  const [finalAssets, setFinalAssets] = useState<FinalAsset[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [composites, setComposites] = useState<Composite[]>([])
  const [angledShots, setAngledShots] = useState<AngledShot[]>([])
  const [copyDocs, setCopyDocs] = useState<CopyDoc[]>([])
  const [logos, setLogos] = useState<BrandAsset[]>([])
  const [brandFonts, setBrandFonts] = useState<BrandAsset[]>([])
  const [selectedLogoId, setSelectedLogoId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
  const [assetName, setAssetName] = useState('')
  const [pendingPreview, setPendingPreview] = useState<PreviewData | null>(null)
  const [saving, setSaving] = useState(false)

  // Selected IDs
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [selectedCompositeId, setSelectedCompositeId] = useState<string>('')
  const [selectedCopyDocId, setSelectedCopyDocId] = useState<string>('')
  // Image source: 'composite' or 'angled-shot'
  const [imageSource, setImageSource] = useState<'composite' | 'angled-shot'>('composite')
  const [selectedAngledShotId, setSelectedAngledShotId] = useState<string>('')

  // Per-layer text inputs (keyed by layer name)
  const [layerTexts, setLayerTexts] = useState<Record<string, string>>({})

  // Freeform mode controls (when no template selected)
  const [logoPosition, setLogoPosition] = useState('top-center')
  const [logoSize, setLogoSize] = useState(12)
  // Custom pixel overrides for logo position (null = use preset)
  const [logoXPx, setLogoXPx] = useState<number | null>(null)
  const [logoYPx, setLogoYPx] = useState<number | null>(null)
  const [freeformTexts, setFreeformTexts] = useState<FreeformTextLayer[]>([])

  // Ad mode: 'preset' (named layout grid) or 'freeform' (manual positioning)
  const [adMode, setAdMode] = useState<'preset' | 'freeform'>('preset')
  const [selectedPresetId, setSelectedPresetId] = useState('bottom-strip')
  const [presetHeadline, setPresetHeadline] = useState('')
  const [presetSubline, setPresetSubline] = useState('')
  const [presetFontFamily, setPresetFontFamily] = useState('Arial')
  const [presetFontUrl, setPresetFontUrl] = useState<string | undefined>(undefined)
  const [presetLogoSize, setPresetLogoSize] = useState(10)
  const [darkenImage, setDarkenImage] = useState(false)

  // Stable list of brand font URLs for @font-face injection (preview) — same order => same family name
  const freeformBrandFontUrls = useMemo(
    () => [...new Set(freeformTexts.filter(t => t.fontUrl?.startsWith('http')).map(t => t.fontUrl as string))],
    [freeformTexts]
  )
  const fontUrlToFamily = useMemo(
    () => Object.fromEntries(freeformBrandFontUrls.map((url, i) => [url, `AdForgeBrandFont-${i}`])),
    [freeformBrandFontUrls]
  )

  const updateFreeformText = (id: string, updates: Partial<FreeformTextLayer>) => {
    setFreeformTexts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }
  const removeFreeformText = (id: string) => {
    setFreeformTexts(prev => prev.filter(t => t.id !== id))
  }

  const isFreeform = !selectedTemplateId

  // When selected template changes, initialise layerTexts from its text layers
  useEffect(() => {
    const template = templates.find(t => t.id === selectedTemplateId)
    const textLayers = template?.template_data?.layers?.filter(l => l.type === 'text') ?? []
    const initial: Record<string, string> = {}
    for (const layer of textLayers) {
      const key = layer.name || layer.id
      initial[key] = layerTexts[key] ?? layer.sample_text ?? ''
    }
    setLayerTexts(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId, templates])

  // When brand fonts load/update, fix any text layer that still has an old URL (e.g. GDrive)
  // so it uses the current Supabase URL for the same font by name
  useEffect(() => {
    if (brandFonts.length === 0) return
    const currentUrls = new Set(brandFonts.map((f) => f.storage_url))
    setFreeformTexts((prev) => {
      let changed = false
      const next = prev.map((tl) => {
        if (!tl.fontUrl) return tl
        if (currentUrls.has(tl.fontUrl)) return tl
        const match =
          brandFonts.find((f) => f.name === tl.fontFamily) ||
          (tl.fontFamily && /brandon|grotesque/i.test(tl.fontFamily)
            ? brandFonts.find((f) => /brandon|grotesque/i.test(f.name))
            : null)
        if (!match) return tl
        changed = true
        return { ...tl, fontUrl: match.storage_url }
      })
      return changed ? next : prev
    })
  }, [brandFonts])

  const previewImageUrl = imageSource === 'composite'
    ? (composites.find(c => c.id === selectedCompositeId)?.storage_url ?? '')
    : (angledShots.find(s => s.id === selectedAngledShotId)?.public_url ?? '')

  // Fetch all data
  useEffect(() => {
    fetchAllData()
  }, [categoryId, format])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchFinalAssets(),
        fetchTemplates(),
        fetchComposites(),
        fetchAngledShots(),
        fetchCopyDocs(),
        fetchLogo(),
      ])
    } catch (error: any) {
      console.error('Error fetching data:', error)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchFinalAssets = async () => {
    try {
      const url = format
        ? `/api/categories/${categoryId}/final-assets?format=${format}`
        : `/api/categories/${categoryId}/final-assets`
      const response = await fetch(url)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setFinalAssets(data.finalAssets || [])
    } catch (error: any) {
      console.error('Error fetching final assets:', error)
      throw error
    }
  }

  const handleSavePreview = async () => {
    if (!pendingPreview) return
    setSaving(true)
    try {
      const response = await fetch(`/api/categories/${categoryId}/final-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savePreview: pendingPreview }),
      })
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setPendingPreview(null)
      setAssetName('')
      toast.success('Final ad saved to gallery! 🎉')
      fetchFinalAssets()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDiscardPreview = () => {
    setPendingPreview(null)
  }

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('Delete this final asset?')) return
    try {
      const res = await fetch(`/api/categories/${categoryId}/final-assets/${assetId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setFinalAssets(prev => prev.filter(a => a.id !== assetId))
      toast.success('Final asset deleted')
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  const fetchTemplates = async () => {
    try {
      // Fetch all templates — format-matching ones will be sorted first
      const url = `/api/categories/${categoryId}/templates`
      const response = await fetch(url)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Sort so templates matching the current format appear first
      const allTemplates: Template[] = data.templates || []
      const sorted = [
        ...allTemplates.filter((t) => t.format === format),
        ...allTemplates.filter((t) => t.format !== format),
      ]
      setTemplates(sorted)

      // Auto-select first format-matching template if available
      if (sorted.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(sorted[0].id)
      }
    } catch (error: any) {
      console.error('Error fetching templates:', error)
      // Templates are optional, don't throw
    }
  }

  const fetchComposites = async () => {
    try {
      const url = format
        ? `/api/categories/${categoryId}/composites?format=${format}`
        : `/api/categories/${categoryId}/composites`
      const response = await fetch(url)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const compositeList = data.composites || []
      setComposites(compositeList)

      // Auto-select latest composite
      if (compositeList.length > 0 && !selectedCompositeId) {
        setSelectedCompositeId(compositeList[0].id)
      }
    } catch (error: any) {
      console.error('Error fetching composites:', error)
      throw error
    }
  }

  const fetchAngledShots = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/angled-shots`)
      const data = await response.json()
      const shots: AngledShot[] = (data.angledShots || []).map((s: any) => ({
        ...s,
        public_url: s.public_url || s.storage_url,
      }))
      setAngledShots(shots)
      if (shots.length > 0 && !selectedAngledShotId) {
        setSelectedAngledShotId(shots[0].id)
      }
    } catch (error: any) {
      console.error('Error fetching angled shots:', error)
    }
  }

  const fetchCopyDocs = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/copy-docs`)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const copyList = data.copy_docs || []  // Fixed: API returns copy_docs not copyDocs
      setCopyDocs(copyList)

      // Auto-select latest copy doc
      if (copyList.length > 0 && !selectedCopyDocId) {
        setSelectedCopyDocId(copyList[0].id)
      }
    } catch (error: any) {
      console.error('Error fetching copy docs:', error)
      throw error
    }
  }

  const fetchLogo = async () => {
    try {
      const response = await fetch('/api/brand-assets')
      const data = await response.json()
      const allAssets: BrandAsset[] = data.assets || []
      const logoList = allAssets.filter(a => a.asset_type === 'logo')
      const fontList = allAssets.filter(a => a.asset_type === 'font')
      setLogos(logoList)
      setBrandFonts(fontList)
      if (logoList.length > 0) setSelectedLogoId(logoList[0].id)
    } catch {
      // Logo is optional — silently ignore
    }
  }

  const handleGenerate = async () => {
    if (generatingRef.current) return
    generatingRef.current = true

    if (!assetName.trim()) {
      toast.error('Please enter a name for the ad')
      return
    }

    const selectedAngledShot = angledShots.find(s => s.id === selectedAngledShotId)
    if (imageSource === 'composite' && !selectedCompositeId) {
      toast.error('Please select a composite image')
      return
    }
    if (imageSource === 'angled-shot' && !selectedAngledShot) {
      toast.error('Please select an angled shot')
      return
    }

    // copyDocId is optional — image can be generated without on-image text

    const logo = logos.find(l => l.id === selectedLogoId) || null

    setGenerating(true)

    try {
      // Build request body
      const requestBody: any = {
        name: assetName,
        format,
        ...(imageSource === 'composite'
          ? { compositeId: selectedCompositeId }
          : { baseImageUrl: selectedAngledShot!.public_url }),
        ...(logo && { logoUrl: logo.storage_url }),
      }

      if (adMode === 'preset') {
      // Build customLayers from the selected preset
      const selectedPreset = AD_LAYOUT_PRESETS.find(p => p.id === selectedPresetId)
      if (!selectedPreset) {
        toast.error('Please select a layout preset')
        generatingRef.current = false
        setGenerating(false)
        return
      }
      const { width: canvasW, height: canvasH } = getFormatDimensions(format)
      const layers: any[] = [
        { id: 'bg', type: 'background', x: 0, y: 0, width: 100, height: 100, z_index: 0 },
      ]
      // Overlay rect
      if (selectedPreset.overlay) {
        const ov = selectedPreset.overlay
        const h = ov.height ?? 30
        const w = ov.width ?? 100
        let ox = 0, oy = 0, ow = w, oh = h
        if (ov.type === 'strip-bottom') { ox = 0; oy = 100 - h; ow = 100; oh = h }
        else if (ov.type === 'strip-top') { ox = 0; oy = 0; ow = 100; oh = h }
        else if (ov.type === 'strip-center') { ox = 0; oy = (100 - h) / 2; ow = w; oh = h }
        else if (ov.type === 'badge-center') { ox = (100 - w) / 2; oy = (100 - h) / 2; ow = w; oh = h }
        else if (ov.type === 'full-darken') { ox = 0; oy = 0; ow = 100; oh = 100 }
        layers.push({ id: 'overlay', type: 'overlay_rect', x: ox, y: oy, width: ow, height: oh, color: '#000000', opacity: ov.opacity, z_index: 1 })
      }
      // Logo
      if (logo && selectedPreset.logo) {
        const pl = selectedPreset.logo
        layers.push({ id: 'logo', type: 'logo', x: pl.x, y: pl.y, width: pl.size, height: pl.size * (canvasH / canvasW), z_index: 3 })
      }
      // Headline
      const headlineText = presetHeadline.trim()
      if (headlineText) {
        const ph = selectedPreset.headline
        layers.push({ id: 'headline', type: 'text', name: 'headline', x: ph.x, y: ph.y, width: ph.width, height: 20, font_size: ph.fontSize, font_family: presetFontFamily, color: ph.color, text_align: ph.align, vertical_align: 'top', z_index: 4 })
        requestBody.layerTexts = { ...requestBody.layerTexts, headline: headlineText }
      }
      // Subline
      const sublineText = presetSubline.trim()
      if (sublineText && selectedPreset.subline) {
        const ps = selectedPreset.subline
        layers.push({ id: 'subline', type: 'text', name: 'subline', x: ps.x, y: ps.y, width: ps.width, height: 15, font_size: ps.fontSize, font_family: presetFontFamily, color: ps.color, text_align: ps.align, vertical_align: 'top', z_index: 5 })
        requestBody.layerTexts = { ...requestBody.layerTexts, subline: sublineText }
      }
      requestBody.customLayers = layers
    } else if (isFreeform) {
        // Build layers array from freeform controls
        const layers: any[] = [
          { id: 'bg', type: 'background', x: 0, y: 0, width: 100, height: 100, z_index: 0 },
        ]

        // Logo layer (clamp numbers so API validation never fails: no NaN, all in range)
        if (logo) {
          const { width: cw, height: ch } = getFormatDimensions(format)
          const margin = 3
          let lx = margin, ly = margin
          if (logoPosition === 'top-center')    { lx = (100 - logoSize) / 2; ly = margin }
          if (logoPosition === 'top-right')     { lx = 100 - logoSize - margin; ly = margin }
          if (logoPosition === 'bottom-left')   { lx = margin; ly = 100 - logoSize - margin }
          if (logoPosition === 'bottom-center') { lx = (100 - logoSize) / 2; ly = 100 - logoSize - margin }
          if (logoPosition === 'bottom-right')  { lx = 100 - logoSize - margin; ly = 100 - logoSize - margin }
          if (logoXPx != null) lx = Math.max(0, Math.min(100, (Number(logoXPx) || 0) / cw * 100))
          if (logoYPx != null) ly = Math.max(0, Math.min(100, (Number(logoYPx) || 0) / ch * 100))
          const sz = Math.max(1, Math.min(100, Number(logoSize) || 12))
          layers.push({ id: 'logo', type: 'logo', x: lx, y: ly, width: sz, height: sz, z_index: 3 })
        }

        // Text layers (clamp and default all numbers so API validation never fails)
        const textMap: Record<string, string> = {}
        freeformTexts.forEach((t, idx) => {
          if (!t.text.trim()) return
          const layerName = `text_${idx}`
          const nx = Math.max(0, Math.min(100, Number(t.x) || 0))
          const ny = Math.max(0, Math.min(100, Number(t.y) || 0))
          const nw = Math.max(1, Math.min(100, Number(t.width) || 90))
          const layerHeight = Math.max(1, Math.min(20, 100 - ny))
          layers.push({
            id: t.id, type: 'text', name: layerName,
            x: nx, y: ny, width: nw, height: layerHeight, z_index: 2 + idx,
            font_size: Math.max(8, Number(t.fontSize) || 24),
            font_family: t.fontFamily ?? 'Arial',
            ...(t.fontUrl && { font_url: t.fontUrl }),
            color: t.color ?? '#000000',
            text_align: t.align ?? 'center',
            vertical_align: 'top',
          })
          textMap[layerName] = t.text
        })
        if (Object.keys(textMap).length > 0) {
          requestBody.layerTexts = textMap
        }

        requestBody.customLayers = layers
      } else {
        if (selectedTemplateId) requestBody.templateId = selectedTemplateId
        if (selectedCopyDocId) requestBody.copyDocId = selectedCopyDocId
        if (Object.keys(layerTexts).length > 0) requestBody.layerTexts = layerTexts
      }

      console.log('🎨 GENERATE REQUEST:', JSON.stringify(requestBody, null, 2))

      const response = await fetch(`/api/categories/${categoryId}/final-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, preview: true })
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.isPreview) {
        setPendingPreview(data.preview as PreviewData)
      } else {
        toast.success('Final ad generated successfully! 🎉')
        setAssetName('')
        fetchFinalAssets()
      }
    } catch (error: any) {
      console.error('Error generating final asset:', error)
      toast.error(error.message)
    } finally {
      setGenerating(false)
      generatingRef.current = false
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Get selected items for preview
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const selectedComposite = composites.find(c => c.id === selectedCompositeId)
  const selectedAngledShot = angledShots.find(s => s.id === selectedAngledShotId)
  const selectedCopyDoc = copyDocs.find(d => d.id === selectedCopyDocId)
  const selectedLogo = logos.find(l => l.id === selectedLogoId) || null

  return (
    <div className="space-y-6">
      {/* Generation Form */}
      <Card className="rounded-xl shadow-sm border">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">Generate Final Ad</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Combines template, background, product, and copy into a complete ad creative
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left Column - Selectors */}
            <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Ad Name</Label>
              <Input
                id="name"
                placeholder="Summer Campaign - Variant A"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                disabled={generating}
                className="border-input focus:border-primary rounded-lg"
              />
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-input overflow-hidden">
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-medium transition-colors ${adMode === 'preset' ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
                onClick={() => setAdMode('preset')}
                disabled={generating}
              >
                Presets
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-medium transition-colors ${adMode === 'freeform' ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
                onClick={() => { setAdMode('freeform'); setSelectedTemplateId('') }}
                disabled={generating}
              >
                Freeform
              </button>
            </div>

            {/* Preset mode: headline + subline + font + layout grid */}
            {adMode === 'preset' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Headline</Label>
                  <textarea
                    value={presetHeadline}
                    onChange={(e) => setPresetHeadline(e.target.value)}
                    placeholder="e.g. Feel better, naturally"
                    rows={2}
                    disabled={generating}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Subline (optional)</Label>
                  <textarea
                    value={presetSubline}
                    onChange={(e) => setPresetSubline(e.target.value)}
                    placeholder="e.g. 30-day money-back guarantee"
                    rows={2}
                    disabled={generating}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Font</Label>
                  <Select
                    value={presetFontFamily}
                    onValueChange={(v) => {
                      setPresetFontFamily(v)
                      const bf = brandFonts.find(f => f.name === v)
                      setPresetFontUrl(bf?.storage_url ?? undefined)
                    }}
                    disabled={generating}
                  >
                    <SelectTrigger className="border-input focus:border-primary rounded-lg h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arial">Arial</SelectItem>
                      <SelectItem value="Helvetica">Helvetica</SelectItem>
                      <SelectItem value="Georgia">Georgia</SelectItem>
                      <SelectItem value="Verdana">Verdana</SelectItem>
                      {brandFonts.map((f) => (
                        <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="darken-image"
                    checked={darkenImage}
                    onChange={(e) => setDarkenImage(e.target.checked)}
                    disabled={generating}
                    className="rounded"
                  />
                  <Label htmlFor="darken-image" className="text-xs text-muted-foreground cursor-pointer">Darken base image slightly</Label>
                </div>
                {/* Layout presets grid */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Layout Preset</Label>
                  <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                    {AD_LAYOUT_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPresetId(p.id)}
                        disabled={generating}
                        className={`relative rounded-lg border-2 overflow-hidden aspect-square flex flex-col items-center justify-end pb-1 transition-all ${selectedPresetId === p.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30'}`}
                        title={p.name}
                      >
                        {/* Thumbnail SVG */}
                        <svg viewBox="0 0 60 60" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
                          <rect width="60" height="60" fill="#2a2a2a"/>
                          {p.overlay?.type === 'strip-bottom' && <rect x="0" y={60 - (p.overlay.height ?? 30) * 0.6} width="60" height={(p.overlay.height ?? 30) * 0.6} fill={`rgba(0,0,0,${p.overlay.opacity})`}/>}
                          {p.overlay?.type === 'strip-top' && <rect x="0" y="0" width="60" height={(p.overlay.height ?? 20) * 0.6} fill={`rgba(0,0,0,${p.overlay.opacity})`}/>}
                          {p.overlay?.type === 'full-darken' && <rect x="0" y="0" width="60" height="60" fill={`rgba(0,0,0,${p.overlay.opacity})`}/>}
                          {p.overlay?.type === 'badge-center' && <rect x={(60 - (p.overlay.width ?? 70) * 0.6) / 2} y={(60 - (p.overlay.height ?? 26) * 0.6) / 2} width={(p.overlay.width ?? 70) * 0.6} height={(p.overlay.height ?? 26) * 0.6} fill={`rgba(0,0,0,${p.overlay.opacity})`} rx="2"/>}
                          {p.overlay?.type === 'strip-center' && <rect x="0" y={(60 - (p.overlay.height ?? 30) * 0.6) / 2} width={(p.overlay.width ?? 100) * 0.6} height={(p.overlay.height ?? 30) * 0.6} fill={`rgba(0,0,0,${p.overlay.opacity})`}/>}
                          {p.logo && <rect x={p.logo.x * 0.6} y={p.logo.y * 0.6} width={p.logo.size * 0.6} height={p.logo.size * 0.6} fill="#888" rx="1"/>}
                          <rect x={p.headline.x * 0.6} y={p.headline.y * 0.6} width={p.headline.width * 0.6 * 0.7} height="3" fill="#fff" rx="1"/>
                          {p.subline && <rect x={p.subline.x * 0.6} y={p.subline.y * 0.6} width={p.subline.width * 0.6 * 0.5} height="2" fill="#ccc" rx="1"/>}
                        </svg>
                        <span className="relative z-10 text-[8px] text-white bg-black/50 px-1 rounded">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Freeform mode: existing template selector (no changes) */}
            {adMode === 'freeform' && (
            <div className="space-y-2">
              <Label htmlFor="template" className="text-xs font-medium text-muted-foreground">Layout Mode</Label>
              <Select
                value={selectedTemplateId || '__freeform__'}
                onValueChange={(val) => setSelectedTemplateId(val === '__freeform__' ? '' : val)}
                disabled={generating}
              >
                <SelectTrigger id="template" className="border-input focus:border-primary rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__freeform__">Freeform (manual positioning)</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.format})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isFreeform ? 'Position logo and text manually below' : 'Uses template layer positions'}
              </p>
            </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Base Image *</Label>
              <Select
                value={imageSource}
                onValueChange={(val) => setImageSource(val as 'composite' | 'angled-shot')}
                disabled={generating}
              >
                <SelectTrigger className="border-input focus:border-primary rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="composite">Composite (product + background)</SelectItem>
                  <SelectItem value="angled-shot">Angled Shot (standalone)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {imageSource === 'composite' ? (
              <div className="space-y-2">
                <Label htmlFor="composite" className="text-xs font-medium text-muted-foreground">Composite Image</Label>
                <Select
                  value={selectedCompositeId}
                  onValueChange={setSelectedCompositeId}
                  disabled={generating}
                >
                  <SelectTrigger id="composite" className="border-input focus:border-primary rounded-lg">
                    <SelectValue placeholder="Select composite image" />
                  </SelectTrigger>
                  <SelectContent>
                    {composites.map((composite) => {
                      const label = composite.name
                        || [
                             composite.angled_shot?.angle_name,
                             composite.background?.name,
                           ].filter(Boolean).join(' + ')
                        || `Composite ${composite.id.slice(0, 6)}`
                      return (
                        <SelectItem key={composite.id} value={composite.id}>
                          {label} • {new Date(composite.created_at).toLocaleDateString()}
                        </SelectItem>
                      )
                    })}
                    {composites.length === 0 && (
                      <SelectItem value="none" disabled>No composites available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {composites.length === 0 && (
                  <p className="text-xs text-red-500">
                    Please generate a composite first in the Composites tab
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="angled-shot" className="text-xs font-medium text-muted-foreground">Angled Shot</Label>
                <Select
                  value={selectedAngledShotId}
                  onValueChange={setSelectedAngledShotId}
                  disabled={generating}
                >
                  <SelectTrigger id="angled-shot" className="border-input focus:border-primary rounded-lg">
                    <SelectValue placeholder="Select angled shot" />
                  </SelectTrigger>
                  <SelectContent>
                    {angledShots.map((shot) => (
                      <SelectItem key={shot.id} value={shot.id}>
                        {shot.display_name || shot.angle_name}
                        {shot.product?.name ? ` — ${shot.product.name}` : ''}
                      </SelectItem>
                    ))}
                    {angledShots.length === 0 && (
                      <SelectItem value="none" disabled>No angled shots available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {angledShots.length === 0 && (
                  <p className="text-xs text-red-500">
                    Generate angled shots in the Angled Shots tab first
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="copy" className="text-xs font-medium text-muted-foreground">On-image tagline (optional)</Label>
              <Select
                value={selectedCopyDocId || '__none__'}
                onValueChange={(val) => setSelectedCopyDocId(val === '__none__' ? '' : val)}
                disabled={generating}
              >
                <SelectTrigger id="copy" className="border-input focus:border-primary rounded-lg">
                  <SelectValue placeholder="No on-image text" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {copyDocs
                    .filter((doc) => doc.copy_type === 'tagline')
                    .map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {doc.generated_text.substring(0, 50)}...
                      </SelectItem>
                    ))}
                  {copyDocs.filter(d => d.copy_type === 'tagline').length === 0 && (
                    <SelectItem value="none-available" disabled>
                      No tagline copy yet — generate one in Copy tab
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only tagline copy is baked onto the image. Headline, hook, CTA, and body go in Ad Export.
              </p>
            </div>

            {/* Freeform controls — shown only in Freeform mode when no template selected */}
            {adMode === 'freeform' && isFreeform && (
              <div className="space-y-4 border rounded-lg p-3 bg-muted/20">
                <Label className="text-sm font-medium text-muted-foreground">Freeform Layout</Label>

                {/* Logo positioning */}
                {selectedLogoId && (
                  <div className="space-y-3">
                    <Label className="text-xs font-medium text-muted-foreground">Logo Position</Label>
                    <Select
                      value={logoPosition}
                      onValueChange={(v) => { setLogoPosition(v); setLogoXPx(null); setLogoYPx(null) }}
                      disabled={generating}
                    >
                      <SelectTrigger className="h-8 text-sm border-input focus:border-primary rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top-left">Top Left</SelectItem>
                        <SelectItem value="top-center">Top Center</SelectItem>
                        <SelectItem value="top-right">Top Right</SelectItem>
                        <SelectItem value="bottom-left">Bottom Left</SelectItem>
                        <SelectItem value="bottom-center">Bottom Center</SelectItem>
                        <SelectItem value="bottom-right">Bottom Right</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* Pixel-precise X/Y override */}
                    {(() => {
                      const { width: cw, height: ch } = getFormatDimensions(format)
                      return (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Custom X/Y (px) — overrides preset above · canvas {cw}×{ch}
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px] text-muted-foreground">X (px)</Label>
                              <Input
                                type="number"
                                placeholder="—"
                                value={logoXPx ?? ''}
                                onChange={(e) => setLogoXPx(e.target.value === '' ? null : Number(e.target.value))}
                                className="h-7 text-xs border-input focus:border-primary rounded-lg"
                                disabled={generating}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Y (px)</Label>
                              <Input
                                type="number"
                                placeholder="—"
                                value={logoYPx ?? ''}
                                onChange={(e) => setLogoYPx(e.target.value === '' ? null : Number(e.target.value))}
                                className="h-7 text-xs border-input focus:border-primary rounded-lg"
                                disabled={generating}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Logo Size: {logoSize}%</Label>
                      <Slider
                        value={[logoSize]}
                        onValueChange={([v]) => setLogoSize(v)}
                        min={5} max={30} step={1}
                        disabled={generating}
                      />
                    </div>
                  </div>
                )}

                {/* Text layers — multiple allowed */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">Text Layers ({freeformTexts.length})</Label>
                    <Button
                      type="button" variant="outline" size="sm"
                      className="h-7 text-xs"
                      disabled={generating}
                      onClick={() => setFreeformTexts(prev => [...prev, createTextLayer({ y: Math.max(5, 85 - prev.length * 15) })])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Text
                    </Button>
                  </div>
                  {freeformTexts.map((tl) => (
                    <div key={tl.id} className="space-y-2 pl-2 border-l-2 border-primary/30 pb-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={tl.text}
                          onChange={(e) => updateFreeformText(tl.id, { text: e.target.value })}
                          placeholder="e.g. Entspannter durch den Zyklus"
                          disabled={generating}
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => removeFreeformText(tl.id)}
                          disabled={generating}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">X: {tl.x}%</Label>
                          <Slider value={[tl.x]} onValueChange={(v) => updateFreeformText(tl.id, { x: v[0] })} min={0} max={80} step={1} disabled={generating} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Y: {tl.y}%</Label>
                          <Slider value={[tl.y]} onValueChange={(v) => updateFreeformText(tl.id, { y: v[0] })} min={0} max={95} step={1} disabled={generating} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">W: {tl.width}%</Label>
                          <Slider value={[tl.width]} onValueChange={(v) => updateFreeformText(tl.id, { width: v[0] })} min={20} max={100} step={5} disabled={generating} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Size (px)</Label>
                          <Input
                            type="number"
                            value={tl.fontSize}
                            onChange={(e) => updateFreeformText(tl.id, { fontSize: Math.max(8, Number(e.target.value) || 16) })}
                            className="h-7 text-xs border-input focus:border-primary rounded-lg"
                            disabled={generating}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Color</Label>
                          <Input
                            type="color"
                            value={tl.color}
                            onChange={(e) => updateFreeformText(tl.id, { color: e.target.value })}
                            className="h-7"
                            disabled={generating}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Align</Label>
                          <Select value={tl.align} onValueChange={(v) => updateFreeformText(tl.id, { align: v as 'left' | 'center' | 'right' })} disabled={generating}>
                            <SelectTrigger className="h-7 text-xs border-input focus:border-primary rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Font</Label>
                        <Select
                          value={tl.fontUrl || tl.fontFamily}
                          onValueChange={(v) => {
                            const brandFont = brandFonts.find(f => f.storage_url === v)
                            if (brandFont) {
                              updateFreeformText(tl.id, { fontUrl: brandFont.storage_url, fontFamily: brandFont.name })
                            } else if (v.startsWith('brandon-grotesque-')) {
                              // Auto-link to any uploaded BG brand font if available
                              const bgBrandFont = brandFonts.find(f =>
                                f.name.toLowerCase().replace(/\s+/g, '-').includes('brandon') ||
                                f.name.toLowerCase().replace(/\s+/g, '-').includes('grotesque')
                              )
                              if (bgBrandFont) {
                                updateFreeformText(tl.id, { fontUrl: bgBrandFont.storage_url, fontFamily: v })
                              } else {
                                updateFreeformText(tl.id, { fontUrl: undefined, fontFamily: v })
                              }
                            } else {
                              updateFreeformText(tl.id, { fontUrl: undefined, fontFamily: v })
                            }
                          }}
                          disabled={generating}
                        >
                          <SelectTrigger className="h-7 text-xs border-input focus:border-primary rounded-lg"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="brandon-grotesque-regular">Brandon Grotesque Regular</SelectItem>
                            <SelectItem value="brandon-grotesque-medium">Brandon Grotesque Medium</SelectItem>
                            <SelectItem value="brandon-grotesque-bold">Brandon Grotesque Bold</SelectItem>
                            <SelectItem value="brandon-grotesque-black">Brandon Grotesque Black</SelectItem>
                            <SelectItem value="Arial">Arial</SelectItem>
                            <SelectItem value="Helvetica">Helvetica</SelectItem>
                            <SelectItem value="Georgia">Georgia</SelectItem>
                            <SelectItem value="Verdana">Verdana</SelectItem>
                            <SelectItem value="serif-bold">Serif Bold</SelectItem>
                            <SelectItem value="serif-regular">Serif Regular</SelectItem>
                            {brandFonts.map((f) => (
                              <SelectItem key={f.id} value={f.storage_url}>{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-layer text inputs — shown when template has text layers */}
            {!isFreeform && Object.keys(layerTexts).length > 0 && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                <Label className="text-sm font-medium text-muted-foreground">Text Layers</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Enter the text for each layer in your template
                </p>
                {templates.find(t => t.id === selectedTemplateId)?.template_data?.layers
                  ?.filter(l => l.type === 'text')
                  .map(layer => {
                    const key = layer.name || layer.id
                    return (
                      <div key={layer.id} className="space-y-1">
                        <Label htmlFor={`layer-${key}`} className="text-xs font-medium capitalize text-muted-foreground">
                          {key.replace(/_/g, ' ')}
                        </Label>
                        <Input
                          id={`layer-${key}`}
                          value={layerTexts[key] ?? ''}
                          onChange={e => setLayerTexts(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={layer.sample_text || `Text for ${key}`}
                          disabled={generating}
                          className="border-input focus:border-primary rounded-lg"
                        />
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Logo selector */}
            <div className="space-y-2">
              <Label htmlFor="logo" className="text-xs font-medium text-muted-foreground">Logo (Optional)</Label>
              {logos.length > 0 ? (
                <Select
                  value={selectedLogoId}
                  onValueChange={setSelectedLogoId}
                  disabled={generating}
                >
                  <SelectTrigger id="logo" className="border-input focus:border-primary rounded-lg">
                    <SelectValue placeholder="Select a logo">
                      {selectedLogo && (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selectedLogo.storage_url}
                            alt=""
                            className="h-5 w-5 object-contain rounded"
                          />
                          <span>{selectedLogo.name}</span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {logos.map((logo) => (
                      <SelectItem key={logo.id} value={logo.id}>
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logo.storage_url}
                            alt=""
                            className="h-6 w-6 object-contain rounded border bg-card"
                          />
                          <span>{logo.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-amber-600">
                  ⚠ No logos found — upload one in Brand Assets to include it
                </p>
              )}
            </div>

            {/* Logo size slider — preset mode only */}
            {adMode === 'preset' && selectedLogoId && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Logo Size</Label>
                  <span className="text-xs text-muted-foreground">{presetLogoSize}%</span>
                </div>
                <Slider
                  min={4}
                  max={30}
                  step={1}
                  value={[presetLogoSize]}
                  onValueChange={([v]) => setPresetLogoSize(v)}
                  disabled={generating}
                  className="w-full"
                />
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating || !assetName.trim() || (imageSource === 'composite' ? !selectedCompositeId : !selectedAngledShotId)}
              className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Final Ad
                </>
              )}
            </Button>
            </div>

            {/* Right Column - Previews */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Live Preview</Label>

                {/* CSS Live Preview — updates instantly, no server round-trip */}
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium">
                    {adMode === 'preset' ? `Preset: ${AD_LAYOUT_PRESETS.find(p => p.id === selectedPresetId)?.name ?? '—'}` : isFreeform ? 'Freeform Layout' : `Template: ${selectedTemplate?.name ?? '—'}`}
                    <span className="ml-2 text-[10px] text-green-600 font-normal">● Live</span>
                  </p>
                  <AdLivePreview
                    baseImageUrl={previewImageUrl || null}
                    logoUrl={selectedLogo?.storage_url || null}
                    preset={adMode === 'preset' ? AD_LAYOUT_PRESETS.find(p => p.id === selectedPresetId) : undefined}
                    headline={adMode === 'preset' ? presetHeadline : undefined}
                    subline={adMode === 'preset' ? presetSubline : undefined}
                    freeformLayers={adMode === 'freeform' && isFreeform ? freeformTexts : undefined}
                    freeformLogoX={logoXPx ?? undefined}
                    freeformLogoY={logoYPx ?? undefined}
                    freeformLogoSize={logoSize}
                    freeformLogoPosition={logoPosition}
                    darkenImage={darkenImage}
                    format={format}
                    fontFamily={adMode === 'preset' ? presetFontFamily : undefined}
                    fontUrl={adMode === 'preset' ? presetFontUrl : undefined}
                    presetLogoSize={adMode === 'preset' ? presetLogoSize : undefined}
                  />
                  <p className="text-xs text-muted-foreground">Updates live as you type — matches final output</p>
                </div>

                {/* Copy Preview */}
                {selectedCopyDoc ? (
                  <div className="border border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground">Copy Text</p>
                    <div className="bg-muted/20 rounded p-3 max-h-32 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{selectedCopyDoc.generated_text}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Type: {selectedCopyDoc.copy_type}
                    </p>
                  </div>
                ) : (
                  <div className="border border rounded-lg p-6 text-center bg-muted/10">
                    <p className="text-sm text-muted-foreground">No copy text selected</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview confirmation — shown after generation, before saving */}
      {pendingPreview && (
        <Card className="rounded-xl border-2 border-primary/40 shadow-lg">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Preview Generated Ad</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Review your ad before saving it to the gallery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <div className="relative rounded-lg overflow-hidden border" style={{ maxWidth: 320 }}>
                <Image
                  src={driveImgSrc(pendingPreview.storageUrl)}
                  alt="Generated ad preview"
                  width={pendingPreview.width}
                  height={pendingPreview.height}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {pendingPreview.name} · {pendingPreview.format} · {pendingPreview.width}×{pendingPreview.height}
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={handleSavePreview}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save to Gallery'}
              </Button>
              <Button
                variant="outline"
                onClick={handleDiscardPreview}
                disabled={saving}
              >
                Discard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Assets Gallery */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Generated Ads ({finalAssets.length})
        </h3>

        {finalAssets.length === 0 ? (
          <Card className="rounded-xl shadow-sm border hover:shadow-md transition-shadow">
            <CardContent className="p-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">
                No final ads yet. Generate your first one above!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {finalAssets.map((asset) => (
              <Card key={asset.id} className="rounded-xl shadow-sm border hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div
                    className="relative rounded-lg overflow-hidden bg-gray-100 mb-3"
                    style={{
                      aspectRatio: (() => {
                        try { const { width: w, height: h } = getFormatDimensions(asset.format); return `${w}/${h}` } catch { return '1/1' }
                      })(),
                    }}
                  >
                    <Image
                      src={driveImgSrc(asset.storage_url, asset.gdrive_file_id)}
                      alt={asset.name}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                    {/* Generation time badge — bottom-left */}
                    {asset.generation_time_ms != null && (
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded-full pointer-events-none">
                        {(asset.generation_time_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                    {/* Aspect ratio badge — bottom-right */}
                    {(asset.aspect_ratio || asset.format) && (
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded-full pointer-events-none">
                        {asset.aspect_ratio || asset.format}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold truncate">{asset.name}</h4>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{asset.format} • {asset.width}x{asset.height}</span>
                      <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => window.open(asset.storage_url, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteAsset(asset.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
