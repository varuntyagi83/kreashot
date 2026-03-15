'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Layers, ImageIcon, Type, Sparkles } from 'lucide-react'
import { BrandAssetCard } from '@/components/brand-assets/BrandAssetCard'
import { UploadBrandAsset } from '@/components/brand-assets/UploadBrandAsset'
import { toast } from 'sonner'

interface BrandAsset {
  id: string
  name: string
  asset_type: string
  storage_url: string
  gdrive_file_id?: string | null
  metadata: {
    file_name: string
    file_size: number
    file_type: string
  }
  created_at: string
}

type UploadTypePreset = '' | 'logo' | 'overlay' | 'font'

const SECTIONS: Array<{
  key: string
  label: string
  types: string[]
  icon: React.ReactNode
  uploadType: UploadTypePreset
  description: string
}> = [
  {
    key: 'logos',
    label: 'Logos',
    types: ['logo'],
    icon: <ImageIcon className="h-4 w-4" />,
    uploadType: 'logo',
    description: 'Primary and secondary brand logos',
  },
  {
    key: 'overlays',
    label: 'Overlays',
    types: ['overlay', 'watermark'],
    icon: <Layers className="h-4 w-4" />,
    uploadType: 'overlay',
    description: 'Transparent PNG overlays, watermarks, and graphic elements',
  },
  {
    key: 'fonts',
    label: 'Fonts',
    types: ['font'],
    icon: <Type className="h-4 w-4" />,
    uploadType: 'font',
    description: 'Brand typefaces and custom fonts',
  },
]

export default function BrandKitPage() {
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadTypePreset, setUploadTypePreset] = useState<UploadTypePreset>('')
  const [seeding, setSeeding] = useState(false)

  const handleSeedOverlays = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/brand-assets/seed-overlays', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const firstError = data.results?.find((r: any) => r.status === 'error')
        if (firstError) {
          toast.error(`${data.message} — first error: ${firstError.error}`)
        } else {
          toast.success(data.message)
        }
        fetchAssets()
      } else {
        toast.error(data.error || 'Failed to seed overlays')
      }
    } catch {
      toast.error('Failed to seed overlays')
    } finally {
      setSeeding(false)
    }
  }

  const fetchAssets = async () => {
    try {
      const response = await fetch('/api/brand-assets')
      const data = await response.json()
      if (response.ok) {
        setAssets(data.assets || [])
      } else {
        toast.error(data.error || 'Failed to load brand assets')
      }
    } catch {
      toast.error('Failed to load brand assets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  const openUpload = (typePreset: UploadTypePreset = '') => {
    setUploadTypePreset(typePreset)
    setUploadDialogOpen(true)
  }

  const handleAssetUploaded = () => {
    setUploadDialogOpen(false)
    fetchAssets()
    toast.success('Brand asset uploaded successfully!')
  }

  const handleAssetDeleted = () => {
    fetchAssets()
    toast.success('Brand asset deleted successfully!')
  }

  // Assets that don't fit into the three main sections
  const otherTypes = new Set(['color_palette', 'other'])
  const otherAssets = assets.filter((a) => otherTypes.has(a.asset_type))

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Brand Kit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global brand assets used across all campaigns — logos, overlays, and fonts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSeedOverlays} disabled={seeding}>
            <Layers className="h-4 w-4 mr-2" />
            {seeding ? 'Seeding...' : 'Seed Overlays'}
          </Button>
          <Button
            size="sm"
            className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
            onClick={() => openUpload('')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Upload Asset
          </Button>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => {
        const sectionAssets = assets.filter((a) => section.types.includes(a.asset_type))

        return (
          <section key={section.key}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{section.icon}</span>
                <h2 className="text-base font-semibold text-foreground">{section.label}</h2>
                {sectionAssets.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {sectionAssets.length}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[#7C5DFA] hover:text-[#6A4FD8] hover:bg-[#7C5DFA]/5 text-xs"
                onClick={() => openUpload(section.uploadType)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add {section.label.slice(0, -1)}
              </Button>
            </div>

            {sectionAssets.length === 0 ? (
              <button
                onClick={() => openUpload(section.uploadType)}
                className="w-full border-2 border-dashed border-muted-foreground/20 rounded-xl p-8 text-center hover:border-[#7C5DFA]/40 hover:bg-[#7C5DFA]/5 transition-colors group"
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-[#7C5DFA]">
                  <span>{section.icon}</span>
                  <p className="text-sm font-medium">No {section.label.toLowerCase()} yet</p>
                  <p className="text-xs">{section.description}</p>
                </div>
              </button>
            ) : (
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {/* Add new card */}
                <button
                  onClick={() => openUpload(section.uploadType)}
                  className="aspect-square border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-[#7C5DFA]/50 hover:text-[#7C5DFA] hover:bg-[#7C5DFA]/5 transition-colors"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-xs font-medium">Add</span>
                </button>

                {sectionAssets.map((asset) => (
                  <BrandAssetCard key={asset.id} asset={asset} onDeleted={handleAssetDeleted} />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Other assets (color_palette, other) */}
      {otherAssets.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Other</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {otherAssets.length}
            </span>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {otherAssets.map((asset) => (
              <BrandAssetCard key={asset.id} asset={asset} onDeleted={handleAssetDeleted} />
            ))}
          </div>
        </section>
      )}

      <UploadBrandAsset
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploaded={handleAssetUploaded}
      />
    </div>
  )
}
