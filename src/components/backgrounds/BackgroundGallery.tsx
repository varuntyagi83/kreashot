'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, MoreVertical, Trash2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

interface Background {
  id: string
  name: string
  slug: string
  description: string | null
  storage_url: string
  created_at: string
}

interface BackgroundGalleryProps {
  categoryId: string
  format?: string // NEW: Format filter
  refreshTrigger?: number
}

export function BackgroundGallery({
  categoryId,
  format, // NEW
  refreshTrigger,
}: BackgroundGalleryProps) {
  const [backgrounds, setBackgrounds] = useState<Background[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchBackgrounds = async () => {
    try {
      // NEW: Add format query parameter
      const url = format
        ? `/api/categories/${categoryId}/backgrounds?format=${format}`
        : `/api/categories/${categoryId}/backgrounds`

      const response = await fetch(url)
      const data = await response.json()

      if (response.ok) {
        setBackgrounds(data.backgrounds || [])
      } else {
        toast.error(data.error || 'Failed to load backgrounds')
      }
    } catch (error) {
      console.error('Error fetching backgrounds:', error)
      toast.error('Failed to load backgrounds')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBackgrounds()
  }, [categoryId, format, refreshTrigger]) // NEW: Added format to dependencies

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(id)

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/backgrounds/${id}`,
        {
          method: 'DELETE',
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Background deleted successfully')
        fetchBackgrounds()
      } else {
        toast.error(data.error || 'Failed to delete background')
      }
    } catch (error) {
      console.error('Error deleting background:', error)
      toast.error('Failed to delete background')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownload = (background: Background) => {
    const link = document.createElement('a')
    link.href = background.storage_url
    link.download = `${background.slug}.jpg`
    link.target = '_blank'
    link.click()
    toast.success('Download started')
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="aspect-video animate-pulse bg-muted" />
        ))}
      </div>
    )
  }

  if (backgrounds.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No backgrounds yet</h3>
        <p className="text-muted-foreground mb-4">
          Generate your first background above to get started
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {backgrounds.map((background) => (
        <Card key={background.id} className="group overflow-hidden">
          <div className="relative aspect-video bg-muted">
            <img
              src={background.storage_url}
              alt={background.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src =
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3EImage%3C/text%3E%3C/svg%3E'
              }}
            />

            {/* Actions Overlay */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={deletingId === background.id}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload(background)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(background.id, background.name)}
                    className="text-red-600 focus:text-red-600"
                    disabled={deletingId === background.id}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="p-4 space-y-1">
            <h3 className="font-medium line-clamp-1">{background.name}</h3>
            {background.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {background.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(background.created_at).toLocaleDateString()}
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}
