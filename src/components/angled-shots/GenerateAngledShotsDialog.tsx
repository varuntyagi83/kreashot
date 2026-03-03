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
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ANGLE_VARIATIONS } from '@/lib/ai/angle-variations'

interface GenerateAngledShotsDialogProps {
  categoryId: string
  format: string
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
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null)

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
    setProgress({ done: 0, total: ANGLE_VARIATIONS.length, current: '' })

    let saved = 0
    let failed = 0

    try {
      // Generate one angle at a time — each request completes in 20-50s,
      // safely within Railway's proxy timeout instead of one 3-5 min request.
      for (let i = 0; i < ANGLE_VARIATIONS.length; i++) {
        const angle = ANGLE_VARIATIONS[i]
        setProgress({ done: i, total: ANGLE_VARIATIONS.length, current: angle.description })

        try {
          const response = await fetch(
            `/api/categories/${categoryId}/angled-shots/generate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId: selectedProductId,
                productImageId: selectedImageId,
                format,
                angleName: angle.name,
              }),
            }
          )

          const data = await response.json()

          if (!response.ok) {
            console.error(`Failed to generate ${angle.name}:`, data.error)
            failed++
          } else {
            saved++
          }
        } catch (err) {
          console.error(`Error generating ${angle.name}:`, err)
          failed++
        }
      }

      setProgress({ done: ANGLE_VARIATIONS.length, total: ANGLE_VARIATIONS.length, current: '' })

      if (saved > 0) {
        toast.success(`Generated and saved ${saved}/${ANGLE_VARIATIONS.length} angled shots for ${format} format!`)
        onGenerated()
        setOpen(false)
        setSelectedProductId('')
        setSelectedImageId('')
      } else {
        toast.error('All angles failed to generate. Check Railway logs.')
      }

      if (failed > 0 && saved > 0) {
        toast.warning(`${failed} angle(s) failed — the rest were saved successfully.`)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate angled shots')
    } finally {
      setGenerating(false)
      setProgress(null)
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

          {progress ? (
            <div className="rounded-lg bg-muted p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Generating angles...</span>
                <span className="text-muted-foreground">{progress.done}/{progress.total}</span>
              </div>
              <div className="w-full bg-background rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
              {progress.current && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {progress.current}
                </p>
              )}
              {progress.done === progress.total && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  All done!
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              This will generate {ANGLE_VARIATIONS.length} different camera angles of the selected product image optimized
              for <strong>{format}</strong> aspect ratio.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedProductId || !selectedImageId || generating}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
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
