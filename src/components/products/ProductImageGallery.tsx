'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Star, Trash2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface ProductImage {
  id: string
  product_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  is_primary: boolean
  created_at: string
  public_url?: string  // Added: public URL from API (Google Drive or Supabase)
}

interface ProductImageGalleryProps {
  categoryId: string
  productId: string
  refreshTrigger?: number
}

export function ProductImageGallery({
  categoryId,
  productId,
  refreshTrigger,
}: ProductImageGalleryProps) {
  const [images, setImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null)
  const supabase = createClient()

  const fetchImages = async () => {
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/products/${productId}/images`
      )
      const data = await response.json()

      if (response.ok) {
        setImages(data.images || [])
      } else {
        toast.error(data.error || 'Failed to load images')
      }
    } catch (error) {
      toast.error('Failed to load images')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchImages()
  }, [categoryId, productId, refreshTrigger])

  const handleSetPrimary = async (imageId: string) => {
    setSettingPrimaryId(imageId)

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/products/${productId}/images/${imageId}`,
        {
          method: 'PATCH',
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Primary image updated!')
        fetchImages()
      } else {
        toast.error(data.error || 'Failed to set primary image')
      }
    } catch (error) {
      toast.error('Failed to set primary image')
    } finally {
      setSettingPrimaryId(null)
    }
  }

  const handleDelete = async (imageId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"?`)) {
      return
    }

    setDeletingId(imageId)

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/products/${productId}/images/${imageId}`,
        {
          method: 'DELETE',
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Image deleted successfully!')
        fetchImages()
      } else {
        toast.error(data.error || 'Failed to delete image')
      }
    } catch (error) {
      toast.error('Failed to delete image')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-square rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No images uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {images.map((image) => (
        <div key={image.id} className="relative group">
          <div className="aspect-square rounded-lg overflow-hidden bg-muted">
            <img
              src={image.public_url || ''}
              alt={image.file_name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to placeholder on error
                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3EImage%3C/text%3E%3C/svg%3E'
              }}
            />
          </div>

          {/* Primary badge */}
          {image.is_primary && (
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" />
              Primary
            </div>
          )}

          {/* Actions */}
          <div className="absolute bottom-2 left-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {!image.is_primary && (
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => handleSetPrimary(image.id)}
                disabled={settingPrimaryId === image.id}
              >
                <Star className="h-3 w-3 mr-1" />
                {settingPrimaryId === image.id ? 'Setting...' : 'Set Primary'}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDelete(image.id, image.file_name)}
              disabled={deletingId === image.id}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-1 truncate">
            {image.file_name}
          </p>
        </div>
      ))}
    </div>
  )
}
