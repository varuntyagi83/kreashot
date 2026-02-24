'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2, Image, ImagePlus, Edit } from 'lucide-react'
import { toast } from 'sonner'
import { ManageProductImagesDialog } from './ManageProductImagesDialog'
import { EditProductDialog } from './EditProductDialog'
import { ReferenceDisplay } from '@/components/ui/reference-display'
import { createClient } from '@/lib/supabase/client'

interface ProductCardProps {
  product: {
    id: string
    name: string
    slug: string
    description: string | null
    created_at: string
  }
  categoryId: string
  format: string // Aspect ratio (1:1, 4:5, 9:16, 16:9)
  onDeleted: () => void
}

export function ProductCard({ product, categoryId, format, onDeleted }: ProductCardProps) {
  const [deleting, setDeleting] = useState(false)
  const [manageImagesOpen, setManageImagesOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [primaryImage, setPrimaryImage] = useState<string | null>(null)
  const [imageCount, setImageCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    fetchImages()
  }, [product.id, refreshKey])

  const fetchImages = async () => {
    try {
      // Use the API endpoint instead of direct database query
      // This ensures we get the correct public_url (Google Drive or Supabase)
      const response = await fetch(
        `/api/categories/${categoryId}/products/${product.id}/images`
      )

      if (response.ok) {
        const data = await response.json()
        const images = data.images || []

        setImageCount(images.length)
        const primary = images.find((img: any) => img.is_primary)
        if (primary && primary.public_url) {
          setPrimaryImage(primary.public_url)
        }
      }
    } catch (error) {
      console.error('Error fetching images:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/products/${product.id}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        toast.success('Product deleted successfully!')
        onDeleted()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete product')
      }
    } catch (error) {
      toast.error('Failed to delete product')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className="group hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div
            className="aspect-square mb-3 rounded-md bg-muted flex items-center justify-center overflow-hidden relative cursor-pointer"
            onClick={() => setManageImagesOpen(true)}
          >
            {primaryImage ? (
              <img
                src={primaryImage}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to placeholder on error
                  console.error('Failed to load image:', primaryImage)
                  setPrimaryImage(null) // Show the "No images yet" placeholder
                }}
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <Image className="h-12 w-12 mx-auto mb-2" />
                <p className="text-xs">No images yet</p>
                <p className="text-xs mt-2 text-primary">Click to add</p>
              </div>
            )}
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="sm" variant="secondary">
                <ImagePlus className="h-4 w-4 mr-1" />
                Manage
              </Button>
            </div>
          </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium line-clamp-1">{product.name}</h3>
              {product.description && (
                <div className="mt-1 line-clamp-2">
                  <ReferenceDisplay text={product.description} className="text-xs" />
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={deleting}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {imageCount} image{imageCount !== 1 ? 's' : ''}
            </span>
            <span>{new Date(product.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>

      <ManageProductImagesDialog
        open={manageImagesOpen}
        onOpenChange={(open) => {
          setManageImagesOpen(open)
          if (!open) {
            fetchImages() // Refresh images when dialog closes
          }
        }}
        categoryId={categoryId}
        productId={product.id}
        productName={product.name}
        format={format}
      />

      <EditProductDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        categoryId={categoryId}
        product={product}
        onUpdated={() => {
          setRefreshKey((prev) => prev + 1)
          onDeleted() // Refresh the products list (misnomer - should be onChanged)
        }}
      />
    </>
  )
}
