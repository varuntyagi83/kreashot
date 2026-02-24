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
import { toast } from 'sonner'
import { ReferencePicker } from '@/components/ui/reference-picker'

interface EditProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId: string
  product: {
    id: string
    name: string
    description: string | null
  }
  onUpdated: () => void
}

export function EditProductDialog({
  open,
  onOpenChange,
  categoryId,
  product,
  onUpdated,
}: EditProductDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  // Initialize form when product changes or dialog opens
  useEffect(() => {
    if (open) {
      setName(product.name)
      setDescription(product.description || '')
    }
  }, [open, product])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Please enter a product name')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/products/${product.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
          }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success('Product updated successfully!')
        onUpdated()
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Failed to update product')
      }
    } catch (error) {
      toast.error('Failed to update product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product details. Use @ to reference brand assets or other products.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Summer Collection Sneakers"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description
                <span className="ml-2 text-xs text-muted-foreground">
                  Type @ to reference assets or products
                </span>
              </Label>
              <ReferencePicker
                value={description}
                onChange={setDescription}
                placeholder="Optional product description... Type @ to reference assets or products"
                disabled={loading}
                rows={4}
              />
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
