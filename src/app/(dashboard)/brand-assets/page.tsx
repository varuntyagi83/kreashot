'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { BrandAssetCard } from '@/components/brand-assets/BrandAssetCard'
import { UploadBrandAsset } from '@/components/brand-assets/UploadBrandAsset'
import { toast } from 'sonner'

interface BrandAsset {
  id: string
  name: string
  asset_type: string
  storage_url: string
  metadata: {
    file_name: string
    file_size: number
    file_type: string
  }
  created_at: string
}

export default function BrandAssetsPage() {
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)

  const fetchAssets = async () => {
    try {
      const response = await fetch('/api/brand-assets')
      const data = await response.json()

      if (response.ok) {
        setAssets(data.assets || [])
      } else {
        toast.error(data.error || 'Failed to load brand assets')
      }
    } catch (error) {
      toast.error('Failed to load brand assets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  const handleAssetUploaded = () => {
    setUploadDialogOpen(false)
    fetchAssets()
    toast.success('Brand asset uploaded successfully!')
  }

  const handleAssetDeleted = () => {
    fetchAssets()
    toast.success('Brand asset deleted successfully!')
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-muted rounded mb-2" />
          <div className="h-4 w-96 bg-muted rounded mb-6" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brand Assets</h1>
          <p className="text-muted-foreground mt-1">
            Manage your global brand assets - logos, fonts, and colors
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Asset
        </Button>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <h3 className="text-lg font-medium mb-2">No brand assets yet</h3>
          <p className="text-muted-foreground mb-4">
            Upload your logos, fonts, and other brand elements
          </p>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Asset
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {assets.map((asset) => (
            <BrandAssetCard
              key={asset.id}
              asset={asset}
              onDeleted={handleAssetDeleted}
            />
          ))}
        </div>
      )}

      <UploadBrandAsset
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploaded={handleAssetUploaded}
      />
    </div>
  )
}
