'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { FileText, Image as ImageIcon, Download, Trash2, ExternalLink } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Guideline {
  id: string
  name: string
  slug: string
  description: string | null
  storage_path: string
  storage_url: string
  storage_provider: string
  gdrive_file_id: string | null
  metadata: {
    file_type: string
    file_size: number
    original_name: string
  }
  created_at: string
}

interface GuidelinesListProps {
  categoryId: string
  onRefresh?: () => void
}

export function GuidelinesList({ categoryId, onRefresh }: GuidelinesListProps) {
  const [guidelines, setGuidelines] = useState<Guideline[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchGuidelines = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/guidelines`)
      const data = await response.json()

      if (response.ok) {
        setGuidelines(data.guidelines || [])
      } else {
        toast.error(data.error || 'Failed to load guidelines')
      }
    } catch (error) {
      toast.error('Failed to load guidelines')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGuidelines()
  }, [categoryId])

  const handleDelete = async (guidelineId: string) => {
    setDeletingId(guidelineId)
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/guidelines/${guidelineId}`,
        {
          method: 'DELETE',
        }
      )

      if (response.ok) {
        toast.success('Guideline deleted successfully')
        fetchGuidelines()
        onRefresh?.()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete guideline')
      }
    } catch (error) {
      toast.error('Failed to delete guideline')
    } finally {
      setDeletingId(null)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  const getFileIcon = (fileType: string) => {
    if (fileType === 'application/pdf') {
      return <FileText className="h-8 w-8 text-red-500" />
    }
    return <ImageIcon className="h-8 w-8 text-blue-500" />
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (guidelines.length === 0) {
    return null // Don't show empty state - the upload form handles this
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Uploaded Guidelines</h3>
        <p className="text-sm text-muted-foreground">
          {guidelines.length} {guidelines.length === 1 ? 'guideline' : 'guidelines'} uploaded
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {guidelines.map((guideline) => (
          <Card key={guideline.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {getFileIcon(guideline.metadata.file_type)}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{guideline.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {formatFileSize(guideline.metadata.file_size)}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {guideline.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {guideline.description}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  asChild
                >
                  <a
                    href={guideline.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View
                  </a>
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deletingId === guideline.id}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Guideline?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{guideline.name}". This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(guideline.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="text-xs text-muted-foreground">
                {new Date(guideline.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
