'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Sparkles, Download, Trash2, Image as ImageIcon } from 'lucide-react'
import { ANGLE_VARIATIONS } from '@/lib/ai/angle-variations'

interface Product {
  id: string
  name: string
  slug: string
}

interface ProductImage {
  id: string
  file_name: string
  file_path: string
  is_primary: boolean
  public_url?: string
}

interface GeneratedAngle {
  angleName: string
  angleDescription: string
  promptUsed: string
  imageData: string
  mimeType: string
}

interface SavedAngledShot {
  id: string
  angle_name: string
  angle_description: string
  prompt_used: string
  storage_path: string
  public_url: string
  created_at: string
  product: { id: string; name: string }
  product_image: { id: string; file_name: string }
}

export function AngledShotsPage({ categoryId }: { categoryId: string }) {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>('')
  const [productImages, setProductImages] = useState<ProductImage[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string>('')
  const [selectedAngles, setSelectedAngles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedAngles, setGeneratedAngles] = useState<GeneratedAngle[]>([])
  const [savedAngles, setSavedAngles] = useState<SavedAngledShot[]>([])
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const supabase = createClient()

  useEffect(() => {
    fetchProducts()
    fetchSavedAngles()
  }, [categoryId])

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
      } else {
        toast.error(data.error || 'Failed to load products')
      }
    } catch (error) {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const fetchProductImages = async (productId: string) => {
    try {
      const { data: images } = await supabase
        .from('product_images')
        .select('id, file_name, file_path, is_primary')
        .eq('product_id', productId)
        .order('is_primary', { ascending: false })

      if (images && images.length > 0) {
        const imagesWithUrls = images.map((img) => {
          const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(img.file_path)
          return { ...img, public_url: publicUrl }
        })
        setProductImages(imagesWithUrls)
        setSelectedImageId(imagesWithUrls[0].id) // Auto-select first image
      } else {
        setProductImages([])
        setSelectedImageId('')
      }
    } catch (error) {
      console.error('Error fetching product images:', error)
      toast.error('Failed to load product images')
    }
  }

  const fetchSavedAngles = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/angled-shots`)
      const data = await response.json()

      if (response.ok) {
        setSavedAngles(data.angledShots || [])
      }
    } catch (error) {
      console.error('Error fetching saved angles:', error)
    }
  }

  const handleGenerateAngles = async () => {
    if (!selectedProductId || !selectedImageId) {
      toast.error('Please select a product and image')
      return
    }

    if (selectedAngles.length === 0) {
      toast.error('Please select at least one angle to generate')
      return
    }

    setGenerating(true)
    setGeneratedAngles([])

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/angled-shots/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: selectedProductId,
            productImageId: selectedImageId,
            selectedAngles,
          }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        setGeneratedAngles(data.previewData || [])
        toast.success(`Generated ${data.generatedShots.length} angled shots!`)
      } else {
        toast.error(data.error || 'Failed to generate angled shots')
      }
    } catch (error) {
      console.error('Error generating angles:', error)
      toast.error('Failed to generate angled shots')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveAngle = async (angle: GeneratedAngle) => {
    if (!selectedProductId || !selectedImageId) return

    setSaving((prev) => new Set(prev).add(angle.angleName))

    try {
      const response = await fetch(
        `/api/categories/${categoryId}/angled-shots`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: selectedProductId,
            productImageId: selectedImageId,
            angleName: angle.angleName,
            angleDescription: angle.angleDescription,
            promptUsed: angle.promptUsed,
            imageData: angle.imageData,
            mimeType: angle.mimeType,
          }),
        }
      )

      const data = await response.json()

      if (response.ok) {
        toast.success(`Saved ${angle.angleDescription}`)
        fetchSavedAngles()
        // Remove from generated list
        setGeneratedAngles((prev) =>
          prev.filter((a) => a.angleName !== angle.angleName)
        )
      } else {
        toast.error(data.error || 'Failed to save angle')
      }
    } catch (error) {
      console.error('Error saving angle:', error)
      toast.error('Failed to save angle')
    } finally {
      setSaving((prev) => {
        const newSet = new Set(prev)
        newSet.delete(angle.angleName)
        return newSet
      })
    }
  }

  const handleDeleteAngle = async (angleId: string) => {
    try {
      const response = await fetch(
        `/api/categories/${categoryId}/angled-shots/${angleId}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        toast.success('Angled shot deleted')
        fetchSavedAngles()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete angle')
      }
    } catch (error) {
      toast.error('Failed to delete angle')
    }
  }

  const toggleAngle = (angleName: string) => {
    setSelectedAngles((prev) =>
      prev.includes(angleName)
        ? prev.filter((a) => a !== angleName)
        : [...prev, angleName]
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Angled Shots</h1>
        <p className="text-muted-foreground mt-1">
          Generate AI-powered angle variations of your product images
        </p>
      </div>

      {/* Product Selection */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Product</label>
              <Select
                value={selectedProductId}
                onValueChange={setSelectedProductId}
              >
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
                        {img.is_primary && (
                          <Badge variant="secondary" className="ml-2">
                            Primary
                          </Badge>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Image Preview */}
          {selectedImageId && productImages.length > 0 && (
            <div className="mt-4">
              <label className="text-sm font-medium mb-2 block">
                Source Image Preview
              </label>
              <div className="relative w-48 h-48 border rounded-lg overflow-hidden">
                <img
                  src={
                    productImages.find((img) => img.id === selectedImageId)
                      ?.public_url
                  }
                  alt="Selected product"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Angle Selection */}
      {selectedProductId && selectedImageId && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-3 block">
                Select Angles to Generate
              </label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ANGLE_VARIATIONS.map((angle) => (
                  <div
                    key={angle.name}
                    className="flex items-start space-x-3 border rounded-lg p-3 hover:bg-accent cursor-pointer"
                    onClick={() => toggleAngle(angle.name)}
                  >
                    <Checkbox
                      checked={selectedAngles.includes(angle.name)}
                      onCheckedChange={() => toggleAngle(angle.name)}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {angle.description}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {angle.prompt.substring(0, 50)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerateAngles}
              disabled={generating || selectedAngles.length === 0}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating {selectedAngles.length} angles...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate {selectedAngles.length} Angled{' '}
                  {selectedAngles.length === 1 ? 'Shot' : 'Shots'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generated Angles Preview */}
      {generatedAngles.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Generated Previews</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {generatedAngles.map((angle) => (
              <Card key={angle.angleName}>
                <CardContent className="p-4 space-y-3">
                  <div className="relative aspect-square border rounded-lg overflow-hidden bg-muted">
                    <img
                      src={angle.imageData}
                      alt={angle.angleDescription}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium">{angle.angleDescription}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {angle.promptUsed}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleSaveAngle(angle)}
                    disabled={saving.has(angle.angleName)}
                    className="w-full"
                    size="sm"
                  >
                    {saving.has(angle.angleName) ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-3 w-3" />
                        Save
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Saved Angled Shots Gallery */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Saved Angled Shots</h2>
        {savedAngles.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No angled shots yet. Generate some to get started!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {savedAngles.map((angle) => (
              <Card key={angle.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="relative aspect-square border rounded-lg overflow-hidden">
                    <img
                      src={angle.public_url}
                      alt={angle.angle_description}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">
                      {angle.angle_description}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {angle.product.name}
                    </p>
                  </div>
                  <Button
                    onClick={() => handleDeleteAngle(angle.id)}
                    variant="destructive"
                    size="sm"
                    className="w-full"
                  >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
