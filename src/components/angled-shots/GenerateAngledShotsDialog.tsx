'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface GenerateAngledShotsDialogProps {
  categoryId: string
  format: string // Current aspect ratio
  onGenerated: () => void
}

interface Product {
  id: string
  name: string
}

interface ProductImage {
  id: string
  file_name: string
  is_primary: boolean
}

export function GenerateAngledShotsDialog({
  categoryId,
  format,
  onGenerated,
}: GenerateAngledShotsDialogProps) {
  const [open, setOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (open) {
      fetchProducts()
    }
  }, [open, categoryId])

  useEffect(() => {
    if (selectedProductId) {
      fetchProductImages(selectedProductId)
    } else {
      setProductImages([])
      setSelectedImageId('')
    }
  }, [selectedProductId])

  const fetchProducts = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/products`)
      const data = await response.json()
      if (response.ok) {
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('Failed to load products:', error)
    }
  }

  const fetchProductImages = async (productId: string) => {
    try {
      const { data: images } = await supabase
        .from('product_images')
        .select('id, file_name, is_primary')
        .eq('product_id', productId)
        .order('is_primary', { ascending: false })

      if (images && images.length > 0) {
        setProductImages(images)
        setSelectedImageId(images[0].id)
      }
    } catch (error) {
      console.error('Error fetching product images:', error)
    }
  }

  const handleGenerate = async () => {
    if (!selectedProductId || !selectedImageId) {
      toast.error('Please select a product and image')
      return
    }

    setGenerating(true)

    try {
      // Generate angled shots
      const generateResponse = await fetch(
        `/api/categories/${categoryId}/angled-shots/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: selectedProductId,
            productImageId: selectedImageId,
            format, // Pass current aspect ratio
          }),
        }
      )

      const generateData = await generateResponse.json()

      if (!generateResponse.ok) {
        toast.error(generateData.error || 'Failed to generate angled shots')
        setGenerating(false)
        return
      }

      const generatedShots = generateData.previewData || []
      toast.success(`Generated ${generatedShots.length} angled shots!`)

      // Automatically save all generated shots
      setSaving(true)
      setGenerating(false)

      const savePromises = generatedShots.map(async (shot: any) => {
        const saveResponse = await fetch(
          `/api/categories/${categoryId}/angled-shots`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: selectedProductId,
              productImageId: selectedImageId,
              angleName: shot.angleName,
              angleDescription: shot.angleDescription,
              promptUsed: shot.promptUsed,
              imageData: shot.imageData,
              mimeType: shot.mimeType,
              format, // Include format
            }),
          }
        )

        if (!saveResponse.ok) {
          throw new Error(`Failed to save ${shot.angleDescription}`)
        }
      })

      await Promise.all(savePromises)

      toast.success(`Saved ${generatedShots.length} angled shots for ${format} format!`)
      onGenerated()
      setOpen(false)
      setSelectedProductId('')
      setSelectedImageId('')
    } catch (error) {
      console.error('Error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to process angled shots')
    } finally {
      setGenerating(false)
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Sparkles className="h-4 w-4 mr-2" />
          Generate Angled Shots
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generate Angled Shots</DialogTitle>
          <DialogDescription>
            Generate AI-powered angle variations for {format} format
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Product</label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a product..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProductId && productImages.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Image</label>
              <Select value={selectedImageId} onValueChange={setSelectedImageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an image..." />
                </SelectTrigger>
                <SelectContent>
                  {productImages.map((img) => (
                    <SelectItem key={img.id} value={img.id}>
                      {img.file_name}
                      {img.is_primary && ' (Primary)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            This will generate 7 different camera angles of the selected product image optimized
            for <strong>{format}</strong> aspect ratio.
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={generating || saving}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedProductId || !selectedImageId || generating || saving}
          >
            {generating || saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {generating ? 'Generating...' : 'Saving...'}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate & Save
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
