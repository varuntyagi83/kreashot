'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, Download, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

interface GeneratedBackground {
  promptUsed: string
  imageData: string
  mimeType: string
  format: string
}

interface BackgroundPreviewGridProps {
  backgrounds: GeneratedBackground[]
  categoryId: string
  categorySlug: string
  format?: string // kept for backwards compatibility but not used for saving
  onBackgroundSaved: () => void
  onClearAll: () => void
}

export function BackgroundPreviewGrid({
  backgrounds,
  categoryId,
  categorySlug,
  onBackgroundSaved,
  onClearAll,
}: BackgroundPreviewGridProps) {
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [backgroundName, setBackgroundName] = useState('')
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const handleSaveClick = (index: number) => {
    setSelectedIndex(index)
    setBackgroundName(`Background ${index + 1}`)
    setSaveDialogOpen(true)
  }

  const handleSaveConfirm = async () => {
    if (selectedIndex === null) return

    const background = backgrounds[selectedIndex]
    setSavingIndex(selectedIndex)

    try {
      // Generate slug from name
      const slug = backgroundName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

      const response = await fetch(`/api/categories/${categoryId}/backgrounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: backgroundName,
          slug: `${slug}-${Date.now()}`,
          description: `Generated background for ${categorySlug}`,
          promptUsed: background.promptUsed,
          imageData: background.imageData,
          mimeType: background.mimeType,
          format: background.format,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save background')
      }

      toast.success(`Background "${backgroundName}" (${background.format}) saved successfully!`)
      onBackgroundSaved()
      setSaveDialogOpen(false)
      setBackgroundName('')
      setSelectedIndex(null)
    } catch (error: any) {
      console.error('Error saving background:', error)
      toast.error(error.message || 'Failed to save background')
    } finally {
      setSavingIndex(null)
    }
  }

  const handleDownload = (background: GeneratedBackground, index: number) => {
    const link = document.createElement('a')
    link.href = background.imageData
    link.download = `background-${index + 1}.${background.mimeType.split('/')[1] || 'jpg'}`
    link.click()
    toast.success('Background downloaded')
  }

  const handleSaveAll = async () => {
    toast.info('Saving all backgrounds...')

    for (let i = 0; i < backgrounds.length; i++) {
      setSavingIndex(i)
      const background = backgrounds[i]

      try {
        const name = `Background ${i + 1}`
        const slug = `background-${i + 1}-${Date.now()}`

        await fetch(`/api/categories/${categoryId}/backgrounds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            slug,
            description: `Generated background for ${categorySlug}`,
            promptUsed: background.promptUsed,
            imageData: background.imageData,
            mimeType: background.mimeType,
            format: background.format,
          }),
        })
      } catch (error) {
        console.error(`Error saving background ${i + 1}:`, error)
      }
    }

    setSavingIndex(null)
    toast.success(`Saved all ${backgrounds.length} backgrounds!`)
    onBackgroundSaved()
    onClearAll()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Generated Backgrounds</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveAll}>
                <Save className="h-4 w-4 mr-2" />
                Save All
              </Button>
              <Button variant="ghost" size="sm" onClick={onClearAll}>
                <X className="h-4 w-4 mr-2" />
                Discard All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {backgrounds.map((background, index) => (
              <div key={index} className="space-y-3">
                <div
                  className="relative group aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer"
                  onClick={() => setPreviewIndex(index)}
                >
                  <img
                    src={background.imageData}
                    alt={`Generated background ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {/* Format badge */}
                  {background.format && (
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs font-mono font-semibold px-2 py-0.5 rounded">
                      {background.format}
                    </div>
                  )}
                  {savingIndex === index && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-white text-sm">Saving...</div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSaveClick(index)}
                    disabled={savingIndex !== null}
                    className="flex-1"
                    size="sm"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button
                    onClick={() => handleDownload(background, index)}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View prompt used
                  </summary>
                  <p className="mt-2 text-muted-foreground bg-muted p-2 rounded">
                    {background.promptUsed}
                  </p>
                </details>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Lightbox — near-fullscreen overlay */}
      <Dialog open={previewIndex !== null} onOpenChange={(open) => { if (!open) setPreviewIndex(null) }}>
        <DialogContent
          className="max-w-[95vw] sm:max-w-[95vw] max-h-[95vh] w-auto p-0 overflow-hidden border-0 bg-black/95 gap-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            Background Preview {previewIndex !== null ? previewIndex + 1 : ''}
          </DialogTitle>
          {previewIndex !== null && (
            <div className="relative flex flex-col max-h-[95vh] overflow-hidden">
              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 z-20 text-white/80 hover:text-white hover:bg-white/10 rounded-full"
                onClick={() => setPreviewIndex(null)}
              >
                <X className="h-5 w-5" />
              </Button>

              {/* Image container — respects the background's aspect ratio */}
              <div className="flex-1 flex items-center justify-center p-4 min-h-0">
                <div
                  className="relative max-h-[calc(95vh-6rem)] max-w-[90vw] rounded overflow-hidden"
                  style={{
                    aspectRatio: backgrounds[previewIndex].format
                      ? backgrounds[previewIndex].format.replace(':', '/')
                      : 'auto',
                    width: '90vw',
                  }}
                >
                  <img
                    src={backgrounds[previewIndex].imageData}
                    alt={`Generated background ${previewIndex + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Format badge */}
              {backgrounds[previewIndex].format && (
                <div className="absolute top-4 left-4 bg-black/70 text-white text-sm font-mono font-semibold px-3 py-1 rounded z-10">
                  {backgrounds[previewIndex].format}
                </div>
              )}

              {/* Navigation arrows */}
              {backgrounds.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full text-white/80 hover:text-white hover:bg-white/10 h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); setPreviewIndex((prev) => prev !== null ? (prev - 1 + backgrounds.length) % backgrounds.length : 0) }}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full text-white/80 hover:text-white hover:bg-white/10 h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); setPreviewIndex((prev) => prev !== null ? (prev + 1) % backgrounds.length : 0) }}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {/* Footer with actions */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-white/10">
                <p className="text-sm text-white/60">
                  {previewIndex + 1} of {backgrounds.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-white/20 bg-transparent text-white hover:bg-white/10"
                    onClick={() => handleDownload(backgrounds[previewIndex], previewIndex)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => { setPreviewIndex(null); handleSaveClick(previewIndex) }}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Background</DialogTitle>
            <DialogDescription>
              Give this background a name to save it to your library
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="background-name">Background Name</Label>
              <Input
                id="background-name"
                value={backgroundName}
                onChange={(e) => setBackgroundName(e.target.value)}
                placeholder="e.g., Green Mood Boxes"
                maxLength={100}
              />
            </div>

            {selectedIndex !== null && (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                <img
                  src={backgrounds[selectedIndex].imageData}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfirm}
              disabled={!backgroundName.trim() || savingIndex !== null}
            >
              {savingIndex !== null ? 'Saving...' : 'Save Background'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
