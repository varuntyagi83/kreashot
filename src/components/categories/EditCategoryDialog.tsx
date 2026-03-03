'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  description: string
  look_and_feel: string | null
}

interface EditCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category
  onUpdated: (updated: Category) => void
}

export function EditCategoryDialog({
  open,
  onOpenChange,
  category,
  onUpdated,
}: EditCategoryDialogProps) {
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description)
  const [lookAndFeel, setLookAndFeel] = useState(category.look_and_feel ?? '')
  const [loading, setLoading] = useState(false)

  // Keep form in sync if the dialog is reopened with a different category
  useEffect(() => {
    setName(category.name)
    setDescription(category.description)
    setLookAndFeel(category.look_and_feel ?? '')
  }, [category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !description.trim()) {
      toast.error('Name and description are required')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          look_and_feel: lookAndFeel.trim() || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to update category')
        return
      }

      toast.success('Category updated')
      onUpdated(data.category)
      onOpenChange(false)
    } catch {
      toast.error('Failed to update category')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the name, description, or look &amp; feel for this category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Category Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-lookAndFeel">Look &amp; Feel (Optional)</Label>
              <Textarea
                id="edit-lookAndFeel"
                placeholder="e.g., Fresh, organic, green tones, nature imagery, clean minimalist aesthetic"
                value={lookAndFeel}
                onChange={(e) => setLookAndFeel(e.target.value)}
                disabled={loading}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This helps AI understand the visual style for generated content
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
