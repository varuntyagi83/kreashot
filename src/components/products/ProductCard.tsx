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
import { MoreVertical, Trash2, Image, Edit } from 'lucide-react'
import { toast } from 'sonner'
import { ManageProductImagesDialog } from './ManageProductImagesDialog'
import { EditProductDialog } from './EditProductDialog'
import { driveImgSrc } from '@/lib/utils'

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

  useEffect(() => {
    fetchImages()
  }, [product.id])

  const fetchImages = async () => {
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/products/${product.id}/images`
      )
      if (response.ok) {
        const data = await response.json()
        const images = data.images || []
        setImageCount(images.length)
        const primary = images.find((img: any) => img.is_primary) || images[0]
        if (primary) {
          setPrimaryImage(driveImgSrc(primary.storage_url || primary.public_url, primary.gdrive_file_id))
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
      <Card className="group hover:shadow-md transition-shadow rounded-xl shadow-sm overflow-hidden">
        {/* Image area */}
        <div
          className="aspect-square relative cursor-pointer overflow-hidden bg-muted"
          onClick={() => setManageImagesOpen(true)}
        >
          {primaryImage ? (
            <img
              src={primaryImage}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setPrimaryImage(null)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
              <Image className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-xs">Click to add images</p>
            </div>
          )}
          {/* Image count badge */}
          {imageCount > 0 && (
            <span className="absolute top-2 right-2 text-xs bg-black/60 text-white rounded-full px-2 py-0.5 leading-none">
              {imageCount}
            </span>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </div>

        <CardContent className="p-3">
          <div className="flex items-center gap-1">
            <h3 className="flex-1 font-medium text-sm line-clamp-1">{product.name}</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={deleting}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
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
          {imageCount > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {imageCount} image{imageCount !== 1 ? 's' : ''}
            </p>
          )}
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
          fetchImages()
          onDeleted()
        }}
      />
    </>
  )
}
