'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Download, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { driveImgSrc } from '@/lib/utils'

interface BrandAssetCardProps {
  asset: {
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
  }
  onDeleted: () => void
}

export function BrandAssetCard({ asset, onDeleted }: BrandAssetCardProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${asset.name}"?`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`/api/brand-assets/${asset.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        onDeleted()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete asset')
      }
    } catch (error) {
      toast.error('Failed to delete asset')
    } finally {
      setDeleting(false)
    }
  }

  const isImage = asset.metadata?.file_type?.startsWith('image/')
  const isOverlay = asset.asset_type === 'overlay' || asset.asset_type === 'watermark'
  const isFont = asset.asset_type === 'font'
  const fileSizeBytes = asset.metadata?.file_size
  const fileSize = fileSizeBytes ? (fileSizeBytes / 1024).toFixed(2) + ' KB' : (isOverlay ? 'Seeded' : '—')

  // Overlays and data URIs must use a plain <img> tag — Next.js Image doesn't support data: URIs
  const isDataUri = asset.storage_url?.startsWith('data:')
  const imgSrc = isDataUri ? asset.storage_url : driveImgSrc(asset.storage_url, asset.gdrive_file_id)

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Overlay previews: dark checkered bg so white strokes are visible */}
        <div className={`aspect-square mb-3 rounded-md flex items-center justify-center overflow-hidden relative ${isOverlay ? 'bg-neutral-800' : 'bg-muted'}`}>
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={asset.name}
              className="w-full h-full object-contain"
            />
          ) : isFont ? (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <span className="text-3xl font-bold" style={{ fontFamily: 'serif' }}>Aa</span>
              <span className="text-xs">{asset.name.substring(0, 12)}</span>
            </div>
          ) : (
            <div className="text-4xl font-bold text-muted-foreground">
              {asset.name.substring(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="font-medium line-clamp-1">{asset.name}</h3>
            <p className="text-xs text-muted-foreground">{fileSize}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs capitalize">
              {asset.asset_type.replace(/_/g, ' ')}
            </Badge>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              asChild
            >
              <a href={driveImgSrc(asset.storage_url, asset.gdrive_file_id)} target="_blank" rel="noopener noreferrer">
                <Eye className="h-3 w-3 mr-1" />
                View
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
