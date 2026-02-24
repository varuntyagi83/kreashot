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
import {
  Download,
  MoreVertical,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react'
import { toast } from 'sonner'

interface Composite {
  id: string
  name: string
  slug: string
  description: string | null
  storage_url: string
  created_at: string
  angled_shot: {
    id: string
    angle_name: string
    angle_description: string | null
  }
  background: {
    id: string
    name: string
    description: string | null
  }
}

interface CompositeGalleryProps {
  categoryId: string
  format: string
  refreshTrigger?: number
}

export function CompositeGallery({
  categoryId,
  format,
  refreshTrigger,
}: CompositeGalleryProps) {
  const [composites, setComposites] = useState<Composite[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchComposites = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/composites?format=${format}`)
      const data = await response.json()

      if (response.ok) {
        setComposites(data.composites || [])
      } else {
        toast.error(data.error || 'Failed to load composites')
      }
    } catch (error) {
      console.error('Error fetching composites:', error)
      toast.error('Failed to load composites')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComposites()
  }, [categoryId, format, refreshTrigger])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(id)

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/composites/${id}`,
        {
          method: 'DELETE',
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Composite deleted successfully')
        fetchComposites()
      } else {
        toast.error(data.error || 'Failed to delete composite')
      }
    } catch (error) {
      console.error('Error deleting composite:', error)
      toast.error('Failed to delete composite')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownload = (composite: Composite) => {
    const link = document.createElement('a')
    link.href = composite.storage_url
    link.download = `${composite.slug}.jpg`
    link.target = '_blank'
    link.click()
    toast.success('Download started')
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="aspect-square animate-pulse bg-muted" />
        ))}
      </div>
    )
  }

  if (composites.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No composites yet</h3>
        <p className="text-muted-foreground mb-4">
          Generate your first composite above to get started
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {composites.map((composite) => (
        <Card key={composite.id} className="group overflow-hidden">
          <div className="relative aspect-square bg-muted">
            <img
              src={composite.storage_url}
              alt={composite.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src =
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3EImage%3C/text%3E%3C/svg%3E'
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
                    disabled={deletingId === composite.id}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload(composite)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(composite.id, composite.name)}
                    className="text-red-600 focus:text-red-600"
                    disabled={deletingId === composite.id}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="p-4 space-y-1">
            <h3 className="font-medium line-clamp-1">{composite.name}</h3>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p className="line-clamp-1">
                Shot: {composite.angled_shot?.angle_name || 'Unknown'}
              </p>
              <p className="line-clamp-1">
                Background: {composite.background?.name || 'Unknown'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(composite.created_at).toLocaleDateString()}
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}
