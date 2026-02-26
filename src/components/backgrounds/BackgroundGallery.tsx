'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Download,
  MoreVertical,
  Trash2,
  Image as ImageIcon,
  Pencil,
  Copy,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { FORMATS } from '@/lib/formats'

interface Background {
  id: string
  name: string
  slug: string
  description: string | null
  format: string
  width: number | null
  height: number | null
  storage_url: string
  gdrive_file_id: string | null
  prompt_used: string | null
  created_at: string
}

interface BackgroundGalleryProps {
  categoryId: string
  format?: string
  refreshTrigger?: number
  onRegenerateInFormats?: (background: Background, formats: string[]) => void
}

export function BackgroundGallery({
  categoryId,
  format,
  refreshTrigger,
  onRegenerateInFormats,
}: BackgroundGalleryProps) {
  const [backgrounds, setBackgrounds] = useState<Background[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingBackground, setRenamingBackground] = useState<Background | null>(null)
  const [newName, setNewName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

  // Regenerate in other formats state
  const [regenDialogOpen, setRegenDialogOpen] = useState(false)
  const [regenBackground, setRegenBackground] = useState<Background | null>(null)
  const [regenFormats, setRegenFormats] = useState<string[]>([])
  const [isRegenerating, setIsRegenerating] = useState(false)

  const fetchBackgrounds = async () => {
    try {
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
  }, [categoryId, format, refreshTrigger])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(id)

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/backgrounds/${id}`,
        { method: 'DELETE' }
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

  // Rename handlers
  const openRenameDialog = (background: Background) => {
    setRenamingBackground(background)
    setNewName(background.name)
    setRenameDialogOpen(true)
  }

  const handleRename = async () => {
    if (!renamingBackground || !newName.trim()) return

    setIsSavingName(true)
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/backgrounds/${renamingBackground.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Background renamed')
        setRenameDialogOpen(false)
        fetchBackgrounds()
      } else {
        toast.error(data.error || 'Failed to rename background')
      }
    } catch (error) {
      console.error('Error renaming background:', error)
      toast.error('Failed to rename background')
    } finally {
      setIsSavingName(false)
    }
  }

  // Regenerate in other formats handlers
  const openRegenDialog = (background: Background) => {
    setRegenBackground(background)
    // Pre-select all formats EXCEPT the one this background already is
    const otherFormats = Object.keys(FORMATS).filter((f) => f !== background.format)
    setRegenFormats(otherFormats)
    setRegenDialogOpen(true)
  }

  const handleRegenerate = async () => {
    if (!regenBackground || regenFormats.length === 0) return

    setIsRegenerating(true)
    try {
      // Call the reformat API — sends the actual image to Gemini
      // to create a variation in the target aspect ratio
      const response = await fetch(
        `/api/categories/${categoryId}/backgrounds/${regenBackground.id}/reformat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formats: regenFormats,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reformat background')
      }

      const successCount = (data.results || []).filter((r: any) => r.success).length
      const failedResults = (data.results || []).filter((r: any) => !r.success)

      if (successCount > 0) {
        toast.success(`Created ${successCount} format variant${successCount > 1 ? 's' : ''}!`)
      }
      if (failedResults.length > 0) {
        for (const r of failedResults) {
          toast.error(`Failed ${r.format}: ${r.error}`)
        }
      }

      setRegenDialogOpen(false)
      fetchBackgrounds()
    } catch (error: any) {
      console.error('Error reformatting:', error)
      toast.error(error.message || 'Failed to reformat')
    } finally {
      setIsRegenerating(false)
    }
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
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {backgrounds.map((background) => (
          <Card key={background.id} className="group overflow-hidden">
            <div className="relative aspect-video bg-muted">
              <img
                src={background.storage_url}
                alt={background.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.currentTarget
                  const retryCount = parseInt(target.dataset.retryCount || '0')
                  const fileId = background.gdrive_file_id

                  if (retryCount === 0 && fileId) {
                    // Try lh3 CDN URL (most reliable for public files)
                    target.dataset.retryCount = '1'
                    target.src = `https://lh3.googleusercontent.com/d/${fileId}=w2000`
                  } else if (retryCount <= 1 && fileId) {
                    // Try old thumbnail endpoint as last resort
                    target.dataset.retryCount = '2'
                    target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
                  } else {
                    target.dataset.retryCount = '3'
                    target.src =
                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f1f5f9" width="400" height="300"/%3E%3Ctext fill="%2394a3b8" font-family="sans-serif" font-size="14" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3EImage unavailable%3C/text%3E%3C/svg%3E'
                  }
                }}
              />

              {/* Format badge */}
              {background.format && (
                <div className="absolute top-2 left-2 bg-black/70 text-white text-xs font-mono font-semibold px-2 py-0.5 rounded">
                  {background.format}
                </div>
              )}

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
                    <DropdownMenuItem onClick={() => openRenameDialog(background)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownload(background)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openRegenDialog(background)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Generate Other Formats
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(background.created_at).toLocaleDateString()}</span>
                {background.width && background.height && (
                  <span>&middot; {background.width}x{background.height}</span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Background</DialogTitle>
            <DialogDescription>
              Enter a new name for this background
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Background name"
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!newName.trim() || isSavingName}
            >
              {isSavingName ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Other Formats Dialog */}
      <Dialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Other Formats</DialogTitle>
            <DialogDescription>
              Send &quot;{regenBackground?.name}&quot; to Gemini to create variations in different aspect ratios.
              The actual image is used as input — no design details will be lost.
            </DialogDescription>
          </DialogHeader>

          {regenBackground && (
            <div className="space-y-4">
              {/* Preview of source image */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted max-h-40">
                <img
                  src={regenBackground.storage_url}
                  alt={regenBackground.name}
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-1 left-1 bg-black/70 text-white text-xs font-mono font-semibold px-1.5 py-0.5 rounded">
                  {regenBackground.format}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select target formats</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(FORMATS).map((f) => {
                    const isCurrentFormat = f.format === regenBackground.format
                    return (
                      <div key={f.format} className="flex items-center gap-2">
                        <Checkbox
                          id={`regen-format-${f.format}`}
                          checked={regenFormats.includes(f.format)}
                          disabled={isCurrentFormat || isRegenerating}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setRegenFormats((prev) => [...prev, f.format])
                            } else {
                              setRegenFormats((prev) =>
                                prev.filter((fmt) => fmt !== f.format)
                              )
                            }
                          }}
                        />
                        <label
                          htmlFor={`regen-format-${f.format}`}
                          className={`text-sm cursor-pointer flex items-center gap-2 ${isCurrentFormat ? 'opacity-50' : ''}`}
                        >
                          <span className="font-mono font-semibold">{f.format}</span>
                          <span className="text-xs text-muted-foreground">
                            {isCurrentFormat ? '(current)' : f.description}
                          </span>
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenDialogOpen(false)} disabled={isRegenerating}>
              Cancel
            </Button>
            <Button
              onClick={handleRegenerate}
              disabled={regenFormats.length === 0 || isRegenerating}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                `Generate ${regenFormats.length} Format${regenFormats.length > 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
