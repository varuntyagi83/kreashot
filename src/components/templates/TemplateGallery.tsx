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
import { MoreVertical, Trash2, Edit, FileJson } from 'lucide-react'
import { toast } from 'sonner'

interface Template {
  id: string
  name: string
  description: string | null
  format: string
  width: number
  height: number
  template_data: {
    layers: any[]
    safe_zones: any[]
  }
  created_at: string
  updated_at: string
}

interface TemplateGalleryProps {
  categoryId: string
  refreshTrigger?: number
  onEdit?: (template: Template) => void
}

export function TemplateGallery({
  categoryId,
  refreshTrigger,
  onEdit,
}: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/templates`)
      const data = await response.json()

      if (response.ok) {
        setTemplates(data.templates || [])
      } else {
        toast.error(data.error || 'Failed to load templates')
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast.error('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [categoryId, refreshTrigger])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(id)

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/templates/${id}`,
        {
          method: 'DELETE',
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Template deleted successfully')
        fetchTemplates()
      } else {
        toast.error(data.error || 'Failed to delete template')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      toast.error('Failed to delete template')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Saved Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-48 bg-gray-200 rounded mb-4" />
              <div className="h-4 bg-gray-200 rounded mb-2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Saved Templates</h2>
        <Card className="p-12 text-center">
          <FileJson className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No templates yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first template by uploading a guideline document and
            defining safe zones and layer placeholders.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Saved Templates</h2>
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="overflow-hidden">
            {/* Template Preview */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-6 relative">
              <div className="aspect-square flex items-center justify-center">
                <div className="text-center space-y-2">
                  <FileJson className="h-16 w-16 mx-auto text-primary" />
                  <div className="text-xs font-medium text-muted-foreground">
                    {template.format} • {template.width}x{template.height}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {template.template_data.layers?.length || 0} layers •{' '}
                    {template.template_data.safe_zones?.length || 0} safe zones
                  </div>
                </div>
              </div>

              {/* Dropdown Menu */}
              <div className="absolute top-2 right-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      disabled={deletingId === template.id}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(template)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Template
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleDelete(template.id, template.name)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Template Info */}
            <div className="p-4 space-y-2">
              <h3 className="font-semibold truncate">{template.name}</h3>
              {template.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {template.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Created {new Date(template.created_at).toLocaleDateString()}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
