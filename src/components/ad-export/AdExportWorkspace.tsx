'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Download, FileText, Package } from 'lucide-react'
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

interface CopyDoc {
  id: string
  copy_type: string
  generated_text: string
  tone: string | null
  created_at: string
}

interface AdExportWorkspaceProps {
  categoryId: string
  format?: string
}

// Meta copy fields that appear outside the image
const META_COPY_TYPES = ['hook', 'headline', 'cta', 'body'] as const
type MetaCopyType = (typeof META_COPY_TYPES)[number]

const META_COPY_LABELS: Record<MetaCopyType, string> = {
  hook: 'Hook (primary text)',
  headline: 'Headline',
  cta: 'Call to Action',
  body: 'Body / Caption',
}

export function AdExportWorkspace({ categoryId, format = '1:1' }: AdExportWorkspaceProps) {
  const [finalAssets, setFinalAssets] = useState<FinalAsset[]>([])
  const [copyDocs, setCopyDocs] = useState<CopyDoc[]>([])
  const [loading, setLoading] = useState(true)

  // Selected asset IDs (multi-select)
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())

  // Selected copy doc per Meta field
  const [selectedCopy, setSelectedCopy] = useState<Partial<Record<MetaCopyType, string>>>({})

  useEffect(() => {
    fetchData()
  }, [categoryId, format])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [assetsRes, copyRes] = await Promise.all([
        fetch(`/api/categories/${categoryId}/final-assets?format=${format}`),
        fetch(`/api/categories/${categoryId}/copy-docs`),
      ])

      const assetsData = await assetsRes.json()
      const copyData = await copyRes.json()

      setFinalAssets(assetsData.finalAssets || [])
      setCopyDocs(copyData.copy_docs || [])
    } catch (error: any) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const toggleAsset = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllAssets = () => {
    setSelectedAssetIds(new Set(finalAssets.map((a) => a.id)))
  }

  const clearAssetSelection = () => {
    setSelectedAssetIds(new Set())
  }

  const copyDocsForType = (type: MetaCopyType) =>
    copyDocs.filter((d) => d.copy_type === type)

  const handleExportCSV = () => {
    if (selectedAssetIds.size === 0) {
      toast.error('Select at least one final asset to export')
      return
    }

    const selectedAssets = finalAssets.filter((a) => selectedAssetIds.has(a.id))

    // Build CSV
    const headers = ['asset_name', 'image_url', 'format', 'hook', 'headline', 'cta', 'body']

    const getCopyText = (type: MetaCopyType) => {
      const docId = selectedCopy[type]
      if (!docId) return ''
      return copyDocs.find((d) => d.id === docId)?.generated_text || ''
    }

    const rows = selectedAssets.map((asset) => [
      asset.name,
      asset.storage_url,
      asset.format,
      getCopyText('hook'),
      getCopyText('headline'),
      getCopyText('cta'),
      getCopyText('body'),
    ])

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ad-export-${format.replace(':', 'x')}-${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)

    toast.success(`Exported ${selectedAssets.length} ad(s) to CSV`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Package className="h-5 w-5" />
            Ad Export
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Package your final assets with Meta copy fields (hook, headline, CTA, body) and export
            as a CSV for manual upload to Meta Ads Manager.
          </p>
        </CardHeader>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Final Asset Selection */}
        <Card className="border rounded-xl shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">Final Assets</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllAssets}
                  className="text-xs text-primary hover:bg-muted/50"
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAssetSelection}
                  className="text-xs text-primary hover:bg-muted/50"
                >
                  Clear
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedAssetIds.size} of {finalAssets.length} selected
            </p>
          </CardHeader>
          <CardContent>
            {finalAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No final assets yet. Generate some in the Final Assets tab first.
              </p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {finalAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedAssetIds.has(asset.id)
                        ? 'border-primary bg-primary/5'
                        : 'border hover:bg-muted/50'
                    }`}
                    onClick={() => toggleAsset(asset.id)}
                  >
                    <Checkbox
                      checked={selectedAssetIds.has(asset.id)}
                      onCheckedChange={() => toggleAsset(asset.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="relative h-12 w-12 rounded overflow-hidden bg-muted flex-shrink-0">
                      <Image
                        src={asset.storage_url}
                        alt={asset.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {asset.format} • {new Date(asset.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Meta Copy Selection */}
        <Card className="border rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Meta Copy Fields</CardTitle>
            <p className="text-xs text-muted-foreground">
              Select the copy for each Meta field. These appear outside the image in the ad.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {META_COPY_TYPES.map((type) => {
              const options = copyDocsForType(type)
              return (
                <div key={type} className="space-y-1.5">
                  <Label>{META_COPY_LABELS[type]}</Label>
                  <Select
                    value={selectedCopy[type] || '__none__'}
                    onValueChange={(val) =>
                      setSelectedCopy((prev) => ({ ...prev, [type]: val === '__none__' ? undefined : val }))
                    }
                  >
                    <SelectTrigger className="border-input focus:border-primary rounded-lg">
                      <SelectValue placeholder={`No ${type} selected`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {options.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.generated_text.substring(0, 50)}
                          {doc.generated_text.length > 50 ? '…' : ''}
                          {doc.tone ? ` [${doc.tone}]` : ''}
                        </SelectItem>
                      ))}
                      {options.length === 0 && (
                        <SelectItem value="empty" disabled>
                          No {type} copy — generate in Copy tab
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {selectedCopy[type] && (
                    <p className="text-xs text-muted-foreground bg-background p-2 rounded-lg line-clamp-2">
                      {copyDocs.find((d) => d.id === selectedCopy[type])?.generated_text}
                    </p>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Export Button */}
      <div className="bg-card rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-medium text-foreground">Ready to export</p>
            <p className="text-sm text-muted-foreground">
              {selectedAssetIds.size} asset(s) × 1 copy set → {selectedAssetIds.size} CSV row(s)
            </p>
          </div>
          <Button
            onClick={handleExportCSV}
            disabled={selectedAssetIds.size === 0}
            size="lg"
            className="bg-primary hover:bg-primary/90 text-white rounded-lg"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="mt-4 p-3 bg-background rounded-lg text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">CSV columns:</span>
          </div>
          <p>asset_name, image_url, format, hook, headline, cta, body</p>
          <p>Upload the image_url column to Meta directly — all images are hosted on Google Drive CDN.</p>
        </div>
      </div>
    </div>
  )
}
