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
import { Download, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { GeneratedComposite } from './CompositeWorkspace'

interface CompositePreviewGridProps {
  composites: GeneratedComposite[]
  categoryId: string
  categorySlug: string
  format: string
  onCompositeSaved: () => void
  onClearAll: () => void
}

export function CompositePreviewGrid({
  composites,
  categoryId,
  categorySlug,
  format,
  onCompositeSaved,
  onClearAll,
}: CompositePreviewGridProps) {
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [compositeName, setCompositeName] = useState('')

  const handleSaveClick = (index: number) => {
    const composite = composites[index]
    setSelectedIndex(index)
    setCompositeName(
      `${composite.angledShotName} on ${composite.backgroundName}`
    )
    setSaveDialogOpen(true)
  }

  const handleSaveConfirm = async () => {
    if (selectedIndex === null) return

    const composite = composites[selectedIndex]
    setSavingIndex(selectedIndex)

    try {
      const response = await fetch(`/api/categories/${categoryId}/composites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: compositeName,
          description: `Composite of ${composite.angledShotName} with ${composite.backgroundName}`,
          promptUsed: composite.prompt_used,
          imageData: composite.image_base64,
          mimeType: composite.image_mime_type,
          angledShotId: composite.angledShotId,
          backgroundId: composite.backgroundId,
          format,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save composite')
      }

      toast.success(`Composite "${compositeName}" saved successfully!`)
      onCompositeSaved()
      setSaveDialogOpen(false)
      setCompositeName('')
      setSelectedIndex(null)
    } catch (error: any) {
      console.error('Error saving composite:', error)
      toast.error(error.message || 'Failed to save composite')
    } finally {
      setSavingIndex(null)
    }
  }

  const handleDownload = (composite: GeneratedComposite, index: number) => {
    const link = document.createElement('a')
    link.href = composite.image_base64
    link.download = `composite-${index + 1}.${composite.image_mime_type.split('/')[1] || 'jpg'}`
    link.click()
    toast.success('Composite downloaded')
  }

  const handleSaveAll = async () => {
    toast.info('Saving all composites...')

    for (let i = 0; i < composites.length; i++) {
      setSavingIndex(i)
      const composite = composites[i]

      try {
        const name = `${composite.angledShotName} on ${composite.backgroundName}`

        await fetch(`/api/categories/${categoryId}/composites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: `Composite of ${composite.angledShotName} with ${composite.backgroundName}`,
            promptUsed: composite.prompt_used,
            imageData: composite.image_base64,
            mimeType: composite.image_mime_type,
            angledShotId: composite.angledShotId,
            backgroundId: composite.backgroundId,
            format,
          }),
        })
      } catch (error) {
        console.error(`Error saving composite ${i + 1}:`, error)
      }
    }

    setSavingIndex(null)
    toast.success(`Saved all ${composites.length} composites!`)
    onCompositeSaved()
    onClearAll()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Generated Composites</CardTitle>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {composites.map((composite, index) => (
              <div key={index} className="space-y-3">
                <div className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                  <img
                    src={composite.image_base64}
                    alt={`Composite ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {savingIndex === index && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="text-white text-sm">Saving...</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm">
                    <div className="font-medium truncate">
                      {composite.angledShotName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      + {composite.backgroundName}
                    </div>
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
                      onClick={() => handleDownload(composite, index)}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Composite</DialogTitle>
            <DialogDescription>
              Give this composite a name to save it to your library
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="composite-name">Composite Name</Label>
              <Input
                id="composite-name"
                value={compositeName}
                onChange={(e) => setCompositeName(e.target.value)}
                placeholder="e.g., Vitamin C - Hand Scene"
                maxLength={100}
              />
            </div>

            {selectedIndex !== null && (
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <img
                  src={composites[selectedIndex].image_base64}
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
              disabled={!compositeName.trim() || savingIndex !== null}
            >
              {savingIndex !== null ? 'Saving...' : 'Save Composite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
