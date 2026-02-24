'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2, Download, Eye } from 'lucide-react'
import { toast } from 'sonner'

interface AngledShotCardProps {
  angledShot: {
    id: string
    angle_name: string
    angle_description: string
    display_name: string // Product-prefixed display name
    prompt_used: string | null
    storage_path: string
    storage_url: string
    created_at: string
    public_url: string
    product: {
      id: string
      name: string
      slug: string
    }
    product_image: {
      id: string
      file_name: string
    }
  }
  categoryId: string
  onDeleted: () => void
}

export function AngledShotCard({
  angledShot,
  categoryId,
  onDeleted,
}: AngledShotCardProps) {
  const [deleting, setDeleting] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Delete ${angledShot.angle_description}?`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/angled-shots/${angledShot.id}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        toast.success('Angled shot deleted successfully!')
        onDeleted()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete angled shot')
      }
    } catch (error) {
      toast.error('Failed to delete angled shot')
    } finally {
      setDeleting(false)
    }
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(angledShot.public_url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${angledShot.product.slug}_${angledShot.angle_name}.jpg`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Download started!')
    } catch (error) {
      toast.error('Failed to download image')
    }
  }

  const handleView = () => {
    window.open(angledShot.public_url, '_blank')
  }

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div
          className="aspect-square mb-3 rounded-md bg-muted flex items-center justify-center overflow-hidden relative cursor-pointer"
          onClick={handleView}
        >
          {imageError ? (
            <div className="text-center text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-2" />
              <p className="text-xs">Failed to load</p>
              <p className="text-xs mt-1 text-primary">Click to view</p>
            </div>
          ) : (
            <>
              <img
                src={angledShot.public_url}
                alt={angledShot.angle_description}
                className="w-full h-full object-cover"
                onError={() => {
                  console.error('Failed to load image:', angledShot.public_url)
                  setImageError(true)
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="secondary">
                    <Eye className="h-4 w-4 mr-1" />
                    View Full Size
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium line-clamp-1">
                {angledShot.display_name || `${angledShot.product.name}_${angledShot.angle_name}`}
              </h3>
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
                <DropdownMenuItem onClick={handleView}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Size
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
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
            <span className="line-clamp-1">{angledShot.angle_description}</span>
            <span>{new Date(angledShot.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
