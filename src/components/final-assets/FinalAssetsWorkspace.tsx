'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Download, Sparkles } from 'lucide-react'
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

interface Template {
  id: string
  name: string
  format: string
  template_data?: {
    layers?: Array<{
      id: string
      type: string
      x?: number
      y?: number
      width?: number
      height?: number
      z_index?: number
    }>
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
  storage_url: string
  created_at: string
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

interface FinalAssetsWorkspaceProps {
  categoryId: string
  format?: string
}

export function FinalAssetsWorkspace({ categoryId, format = '1:1' }: FinalAssetsWorkspaceProps) {
  const [finalAssets, setFinalAssets] = useState<FinalAsset[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [composites, setComposites] = useState<Composite[]>([])
  const [copyDocs, setCopyDocs] = useState<CopyDoc[]>([])
  const [logos, setLogos] = useState<BrandAsset[]>([])
  const [selectedLogoId, setSelectedLogoId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [assetName, setAssetName] = useState('')

  // Selected IDs
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [selectedCompositeId, setSelectedCompositeId] = useState<string>('')
  const [selectedCopyDocId, setSelectedCopyDocId] = useState<string>('')

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
      const url = format
        ? `/api/categories/${categoryId}/templates?format=${format}`
        : `/api/categories/${categoryId}/templates`
      const response = await fetch(url)
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const templateList = data.templates || []
      setTemplates(templateList)

      // Auto-select first template if available
      if (templateList.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(templateList[0].id)
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
      const logoList: BrandAsset[] = (data.assets || []).filter(
        (a: BrandAsset) => a.asset_type === 'logo'
      )
      setLogos(logoList)
      if (logoList.length > 0) setSelectedLogoId(logoList[0].id)
    } catch {
      // Logo is optional — silently ignore
    }
  }

  const handleGenerate = async () => {
    if (!assetName.trim()) {
      toast.error('Please enter a name for the ad')
      return
    }

    if (!selectedCompositeId) {
      toast.error('Please select a composite image')
      return
    }

    if (!selectedCopyDocId) {
      toast.error('Please select copy text')
      return
    }

    const logo = logos.find(l => l.id === selectedLogoId) || null

    setGenerating(true)

    try {
      const response = await fetch(`/api/categories/${categoryId}/final-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: assetName,
          format,
          compositeId: selectedCompositeId,
          copyDocId: selectedCopyDocId,
          ...(selectedTemplateId && { templateId: selectedTemplateId }),
          ...(logo && { logoUrl: logo.storage_url }),
        })
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
  const selectedCopyDoc = copyDocs.find(d => d.id === selectedCopyDocId)
  const selectedLogo = logos.find(l => l.id === selectedLogoId) || null

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
              <Label htmlFor="template">Template (Optional)</Label>
              <Select
                value={selectedTemplateId}
                onValueChange={setSelectedTemplateId}
                disabled={generating}
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder={templates.length === 0 ? "No templates - will use default" : "Select template"} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.format})
                    </SelectItem>
                  ))}
                  {templates.length === 0 && (
                    <SelectItem value="none" disabled>No templates available</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave empty to use default layout
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="composite">Composite Image *</Label>
              <Select
                value={selectedCompositeId}
                onValueChange={setSelectedCompositeId}
                disabled={generating}
              >
                <SelectTrigger id="composite">
                  <SelectValue placeholder="Select composite image" />
                </SelectTrigger>
                <SelectContent>
                  {composites.map((composite, index) => (
                    <SelectItem key={composite.id} value={composite.id}>
                      Composite {composites.length - index} • {new Date(composite.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
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

            <div className="space-y-2">
              <Label htmlFor="copy">Copy Text *</Label>
              <Select
                value={selectedCopyDocId}
                onValueChange={setSelectedCopyDocId}
                disabled={generating}
              >
                <SelectTrigger id="copy">
                  <SelectValue placeholder="Select copy text" />
                </SelectTrigger>
                <SelectContent>
                  {copyDocs.map((doc, index) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.copy_type} {copyDocs.length - index} • {doc.generated_text.substring(0, 30)}...
                    </SelectItem>
                  ))}
                  {copyDocs.length === 0 && (
                    <SelectItem value="none" disabled>No copy docs available</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {copyDocs.length === 0 && (
                <p className="text-xs text-red-500">
                  Please generate copy first in the Copy tab
                </p>
              )}
            </div>

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
              disabled={generating || !assetName.trim() || !selectedCompositeId || !selectedCopyDocId}
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

                {/* Template Preview */}
                {selectedTemplate && (
                  <div className="border rounded-lg p-3 bg-muted/20">
                    <p className="text-xs font-medium mb-1">Template</p>
                    <p className="text-sm text-muted-foreground">{selectedTemplate.name}</p>
                  </div>
                )}

                {/* Final Ad Preview */}
                {selectedComposite ? (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium">Final Ad Preview</p>
                    <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                      {/* Background Composite */}
                      <Image
                        src={selectedComposite.storage_url}
                        alt="Selected composite"
                        fill
                        className="object-contain"
                      />

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
                        if (layer.type === 'text' && selectedCopyDoc) {
                          return (
                            <div
                              key={layer.id}
                              className="absolute border-2 border-blue-500 border-dashed flex items-center justify-center p-2"
                              style={{
                                left: `${layer.x || 0}%`,
                                top: `${layer.y || 0}%`,
                                width: `${layer.width || 100}%`,
                                height: `${layer.height || 20}%`,
                              }}
                            >
                              <p className="text-sm font-bold text-center line-clamp-2 bg-white/90 px-2 py-1 rounded">
                                {selectedCopyDoc.generated_text.substring(0, 100)}...
                              </p>
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
                                  className="w-full h-full object-contain bg-white/80 p-1 rounded"
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
                    <p className="text-sm text-muted-foreground">No composite selected</p>
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
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 mb-3">
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
