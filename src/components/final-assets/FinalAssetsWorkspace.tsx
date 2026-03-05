'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Loader2, Download, Sparkles, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

interface FinalAsset {
  id: string
  name: string
  storage_url: string
  format: string
  width: number
  height: number
  created_at: string
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
  const [freeformTexts, setFreeformTexts] = useState<FreeformTextLayer[]>([])

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

      if (isFreeform) {
        // Build layers array from freeform controls
        const layers: any[] = [
          { id: 'bg', type: 'background', x: 0, y: 0, width: 100, height: 100, z_index: 0 },
        ]

        // Logo layer
        if (logo) {
          const margin = 3
          let lx = margin, ly = margin
          if (logoPosition === 'top-center')    { lx = (100 - logoSize) / 2; ly = margin }
          if (logoPosition === 'top-right')     { lx = 100 - logoSize - margin; ly = margin }
          if (logoPosition === 'bottom-left')   { lx = margin; ly = 100 - logoSize - margin }
          if (logoPosition === 'bottom-center') { lx = (100 - logoSize) / 2; ly = 100 - logoSize - margin }
          if (logoPosition === 'bottom-right')  { lx = 100 - logoSize - margin; ly = 100 - logoSize - margin }
          layers.push({ id: 'logo', type: 'logo', x: lx, y: ly, width: logoSize, height: logoSize, z_index: 3 })
        }

        // Text layers
        const textMap: Record<string, string> = {}
        freeformTexts.forEach((t, idx) => {
          if (!t.text.trim()) return
          const layerName = `text_${idx}`
          layers.push({
            id: t.id, type: 'text', name: layerName,
            x: t.x, y: t.y, width: t.width, height: 12, z_index: 2 + idx,
            font_size: t.fontSize,
            font_family: t.fontFamily,
            ...(t.fontUrl && { font_url: t.fontUrl }),
            color: t.color, text_align: t.align,
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

      const response = await fetch(`/api/categories/${categoryId}/final-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      toast.success('Final ad generated successfully! 🎉')
      setAssetName('')
      fetchFinalAssets()
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
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Get selected items for preview
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const selectedComposite = composites.find(c => c.id === selectedCompositeId)
  const selectedAngledShot = angledShots.find(s => s.id === selectedAngledShotId)
  const selectedCopyDoc = copyDocs.find(d => d.id === selectedCopyDocId)
  const selectedLogo = logos.find(l => l.id === selectedLogoId) || null
  const previewImageUrl = imageSource === 'composite'
    ? selectedComposite?.storage_url
    : selectedAngledShot?.public_url

  return (
    <div className="space-y-6">
      {/* Generation Form */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Final Ad</CardTitle>
          <CardDescription>
            Combines template, background, product, and copy into a complete ad creative
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left Column - Selectors */}
            <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Ad Name</Label>
              <Input
                id="name"
                placeholder="Summer Campaign - Variant A"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                disabled={generating}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Layout Mode</Label>
              <Select
                value={selectedTemplateId || '__freeform__'}
                onValueChange={(val) => setSelectedTemplateId(val === '__freeform__' ? '' : val)}
                disabled={generating}
              >
                <SelectTrigger id="template">
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

            <div className="space-y-2">
              <Label>Base Image *</Label>
              <Select
                value={imageSource}
                onValueChange={(val) => setImageSource(val as 'composite' | 'angled-shot')}
                disabled={generating}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="composite">Composite (product + background)</SelectItem>
                  <SelectItem value="angled-shot">Angled Shot (standalone)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {imageSource === 'composite' ? (
              <div className="space-y-2">
                <Label htmlFor="composite">Composite Image</Label>
                <Select
                  value={selectedCompositeId}
                  onValueChange={setSelectedCompositeId}
                  disabled={generating}
                >
                  <SelectTrigger id="composite">
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
                <Label htmlFor="angled-shot">Angled Shot</Label>
                <Select
                  value={selectedAngledShotId}
                  onValueChange={setSelectedAngledShotId}
                  disabled={generating}
                >
                  <SelectTrigger id="angled-shot">
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
              <Label htmlFor="copy">On-image tagline (optional)</Label>
              <Select
                value={selectedCopyDocId || '__none__'}
                onValueChange={(val) => setSelectedCopyDocId(val === '__none__' ? '' : val)}
                disabled={generating}
              >
                <SelectTrigger id="copy">
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

            {/* Freeform controls — shown when no template selected */}
            {isFreeform && (
              <div className="space-y-4 border rounded-lg p-3 bg-muted/20">
                <Label className="text-sm font-medium">Freeform Layout</Label>

                {/* Logo positioning */}
                {selectedLogoId && (
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">Logo Position</Label>
                    <Select value={logoPosition} onValueChange={setLogoPosition} disabled={generating}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top-left">Top Left</SelectItem>
                        <SelectItem value="top-center">Top Center</SelectItem>
                        <SelectItem value="top-right">Top Right</SelectItem>
                        <SelectItem value="bottom-left">Bottom Left</SelectItem>
                        <SelectItem value="bottom-center">Bottom Center</SelectItem>
                        <SelectItem value="bottom-right">Bottom Right</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Label className="text-xs text-muted-foreground">Text Layers ({freeformTexts.length})</Label>
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
                            className="h-7 text-xs"
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
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
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
                            } else {
                              updateFreeformText(tl.id, { fontUrl: undefined, fontFamily: v })
                            }
                          }}
                          disabled={generating}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
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
                <Label className="text-sm font-medium">Text Layers</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Enter the text for each layer in your template
                </p>
                {templates.find(t => t.id === selectedTemplateId)?.template_data?.layers
                  ?.filter(l => l.type === 'text')
                  .map(layer => {
                    const key = layer.name || layer.id
                    return (
                      <div key={layer.id} className="space-y-1">
                        <Label htmlFor={`layer-${key}`} className="text-xs capitalize text-muted-foreground">
                          {key.replace(/_/g, ' ')}
                        </Label>
                        <Input
                          id={`layer-${key}`}
                          value={layerTexts[key] ?? ''}
                          onChange={e => setLayerTexts(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={layer.sample_text || `Text for ${key}`}
                          disabled={generating}
                        />
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Logo selector */}
            <div className="space-y-2">
              <Label htmlFor="logo">Logo (Optional)</Label>
              {logos.length > 0 ? (
                <Select
                  value={selectedLogoId}
                  onValueChange={setSelectedLogoId}
                  disabled={generating}
                >
                  <SelectTrigger id="logo">
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
                            className="h-6 w-6 object-contain rounded border bg-white"
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

            <Button
              onClick={handleGenerate}
              disabled={generating || !assetName.trim() || (imageSource === 'composite' ? !selectedCompositeId : !selectedAngledShotId)}
              className="w-full"
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
                <Label>Preview</Label>

                {/* Layout Mode Info */}
                <div className="border rounded-lg p-3 bg-muted/20">
                  <p className="text-xs font-medium mb-1">{isFreeform ? 'Freeform Layout' : 'Template'}</p>
                  <p className="text-sm text-muted-foreground">
                    {isFreeform ? 'Manual positioning — no template' : selectedTemplate?.name}
                  </p>
                </div>

                {/* Final Ad Preview */}
                {previewImageUrl ? (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium">Final Ad Preview</p>
                    <div
                      className="relative rounded-lg overflow-hidden bg-gray-100"
                      style={{
                        aspectRatio: format === '16:9' ? '16/9'
                          : format === '9:16' ? '9/16'
                          : format === '4:5' ? '4/5'
                          : '1/1',
                      }}
                    >
                      {/* Base Image (composite or angled shot) */}
                      <Image
                        src={previewImageUrl}
                        alt="Selected base image"
                        fill
                        className="object-contain"
                      />

                      {/* Freeform position preview */}
                      {isFreeform && selectedLogo && (() => {
                        const margin = 3
                        let lx = margin, ly = margin
                        if (logoPosition === 'top-center')    { lx = (100 - logoSize) / 2; ly = margin }
                        if (logoPosition === 'top-right')     { lx = 100 - logoSize - margin; ly = margin }
                        if (logoPosition === 'bottom-left')   { lx = margin; ly = 100 - logoSize - margin }
                        if (logoPosition === 'bottom-center') { lx = (100 - logoSize) / 2; ly = 100 - logoSize - margin }
                        if (logoPosition === 'bottom-right')  { lx = 100 - logoSize - margin; ly = 100 - logoSize - margin }
                        return (
                          <div className="absolute" style={{ left: `${lx}%`, top: `${ly}%`, width: `${logoSize}%`, height: `${logoSize}%` }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={selectedLogo.storage_url} alt="Logo" className="w-full h-full object-contain" />
                          </div>
                        )
                      })()}
                      {isFreeform && freeformTexts.filter(t => t.text.trim()).map((tl) => (
                        <div
                          key={tl.id}
                          className="absolute flex items-center"
                          style={{
                            left: `${tl.x}%`,
                            top: `${tl.y}%`,
                            width: `${tl.width}%`,
                            justifyContent: tl.align === 'center' ? 'center' : tl.align === 'right' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <p className="text-xs font-bold leading-tight" style={{ color: tl.color, textShadow: '0 1px 4px rgba(0,0,0,0.5)', textAlign: tl.align }}>
                            {tl.text}
                          </p>
                        </div>
                      ))}

                      {/* Safe Zones Overlay */}
                      {selectedTemplate?.template_data?.safe_zones?.map((zone) => (
                        <div
                          key={zone.id}
                          className="absolute border-2"
                          style={{
                            left: `${zone.x}%`,
                            top: `${zone.y}%`,
                            width: `${zone.width}%`,
                            height: `${zone.height}%`,
                            backgroundColor: zone.type === 'safe' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)',
                            borderColor: zone.type === 'safe' ? 'rgb(0, 255, 0)' : 'rgb(255, 0, 0)',
                            borderStyle: 'dashed',
                          }}
                        >
                          <span className="absolute top-1 left-1 text-xs font-bold px-1 rounded" style={{
                            backgroundColor: zone.type === 'safe' ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)',
                            color: 'white'
                          }}>
                            {zone.name}
                          </span>
                        </div>
                      ))}

                      {/* Layer Placeholders */}
                      {selectedTemplate?.template_data?.layers?.map((layer) => {
                        if (layer.type === 'text') {
                          const key = layer.name || layer.id
                          const textContent = layerTexts[key] || selectedCopyDoc?.generated_text || ''
                          if (!textContent) return null
                          const textColor = layer.color || '#000000'
                          const isLight = (() => {
                            const hex = textColor.replace('#', '')
                            if (hex.length < 6) return false
                            const r = parseInt(hex.substring(0, 2), 16)
                            const g = parseInt(hex.substring(2, 4), 16)
                            const b = parseInt(hex.substring(4, 6), 16)
                            return (r * 0.299 + g * 0.587 + b * 0.114) > 186
                          })()
                          return (
                            <div
                              key={layer.id}
                              className="absolute border-2 border-blue-500 border-dashed flex items-center justify-center p-1 overflow-hidden"
                              style={{
                                left: `${layer.x || 0}%`,
                                top: `${layer.y || 0}%`,
                                width: `${layer.width || 100}%`,
                                height: `${layer.height || 20}%`,
                              }}
                            >
                              <p
                                className="text-xs font-bold text-center leading-tight"
                                style={{
                                  color: textColor,
                                  textShadow: isLight ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {textContent}
                              </p>
                            </div>
                          )
                        }
                        if (layer.type === 'composite' && layer.source_url) {
                          return (
                            <div
                              key={layer.id}
                              className="absolute overflow-hidden"
                              style={{
                                left: `${layer.x || 0}%`,
                                top: `${layer.y || 0}%`,
                                width: `${layer.width || 100}%`,
                                height: `${layer.height || 100}%`,
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={layer.source_url}
                                alt="Composite"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )
                        }
                        if (layer.type === 'overlay' && layer.source_url) {
                          return (
                            <div
                              key={layer.id}
                              className="absolute pointer-events-none"
                              style={{
                                left: `${layer.x || 0}%`,
                                top: `${layer.y || 0}%`,
                                width: `${layer.width || 100}%`,
                                height: `${layer.height || 100}%`,
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={layer.source_url}
                                alt="Overlay"
                                className="w-full h-full object-fill opacity-70"
                              />
                            </div>
                          )
                        }
                        if (layer.type === 'logo') {
                          return (
                            <div
                              key={layer.id}
                              className="absolute border-2 border-green-500 border-dashed flex items-center justify-center overflow-hidden"
                              style={{
                                left: `${layer.x || 0}%`,
                                top: `${layer.y || 0}%`,
                                width: `${layer.width || 15}%`,
                                height: `${layer.height || 15}%`,
                              }}
                            >
                              {selectedLogo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={selectedLogo.storage_url}
                                  alt="Brand logo"
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <span className="text-xs font-bold text-green-600 bg-white/90 px-2 py-1 rounded">
                                  LOGO
                                </span>
                              )}
                            </div>
                          )
                        }
                        return null
                      })}

                      {/* Template Indicator */}
                      {selectedTemplate && (
                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded">
                          {selectedTemplate.name}
                        </div>
                      )}

                      {/* Legend */}
                      <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-green-500 border-dashed bg-green-500/20"></div>
                          <span>Safe Zone</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-red-500 border-dashed bg-red-500/20"></div>
                          <span>Restricted</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 border-2 border-blue-500 border-dashed"></div>
                          <span>Text Layer</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Template zones and layers preview
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg p-6 text-center bg-muted/10">
                    <p className="text-sm text-muted-foreground">
                      No {imageSource === 'composite' ? 'composite' : 'angled shot'} selected
                    </p>
                  </div>
                )}

                {/* Copy Preview */}
                {selectedCopyDoc ? (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium">Copy Text</p>
                    <div className="bg-muted/20 rounded p-3 max-h-32 overflow-y-auto">
                      <p className="text-sm whitespace-pre-wrap">{selectedCopyDoc.generated_text}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Type: {selectedCopyDoc.copy_type}
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg p-6 text-center bg-muted/10">
                    <p className="text-sm text-muted-foreground">No copy text selected</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Final Assets Gallery */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Generated Ads ({finalAssets.length})
        </h3>

        {finalAssets.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No final ads yet. Generate your first one above!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {finalAssets.map((asset) => (
              <Card key={asset.id}>
                <CardContent className="p-4">
                  <div
                    className="relative rounded-lg overflow-hidden bg-gray-100 mb-3"
                    style={{
                      aspectRatio: asset.format === '16:9' ? '16/9'
                        : asset.format === '9:16' ? '9/16'
                        : asset.format === '4:5' ? '4/5'
                        : '1/1',
                    }}
                  >
                    <Image
                      src={asset.storage_url}
                      alt={asset.name}
                      fill
                      className="object-contain"
                    />
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold truncate">{asset.name}</h4>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{asset.format} • {asset.width}x{asset.height}</span>
                      <span>{new Date(asset.created_at).toLocaleDateString()}</span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(asset.storage_url, '_blank')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
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
