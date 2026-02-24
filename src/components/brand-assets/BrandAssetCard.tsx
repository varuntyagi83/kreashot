'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Download, Eye } from 'lucide-react'
import { toast } from 'sonner'

interface BrandAssetCardProps {
  asset: {
    id: string
    name: string
    asset_type: string
    storage_url: string
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

  const isImage = asset.metadata.file_type.startsWith('image/')
  const fileSize = (asset.metadata.file_size / 1024).toFixed(2) + ' KB'

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="aspect-square mb-3 rounded-md bg-muted flex items-center justify-center overflow-hidden relative">
          {isImage ? (
            <Image
              src={asset.storage_url}
              alt={asset.name}
              fill
              className="object-contain"
              unoptimized
            />
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
              <a href={asset.storage_url} target="_blank" rel="noopener noreferrer">
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
