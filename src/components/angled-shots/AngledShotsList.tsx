'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCcw, Sparkles } from 'lucide-react'
import { AngledShotCard } from './AngledShotCard'
import { GenerateAngledShotsDialog } from './GenerateAngledShotsDialog'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AngledShot {
  id: string
  angle_name: string
  angle_description: string
  display_name: string // Product-prefixed display name
  prompt_used: string | null
  storage_path: string
  storage_url: string
  created_at: string
  public_url: string
  product: {
    id: string
    name: string
    slug: string
  }
  product_image: {
    id: string
    file_name: string
  }
}

interface Product {
  id: string
  name: string
  slug: string
}

interface AngledShotsListProps {
  categoryId: string
  format?: string // NEW: Format filter
}

export function AngledShotsList({ categoryId, format }: AngledShotsListProps) {
  const [angledShots, setAngledShots] = useState<AngledShot[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProductId, setSelectedProductId] = useState<string>('all')

  const fetchAngledShots = async (productId?: string) => {
    try {
      // Build URL with optional productId and format filters
      const params = new URLSearchParams()
      if (productId) params.append('productId', productId)
      if (format) params.append('format', format)

      const url = `/api/categories/${categoryId}/angled-shots${params.toString() ? `?${params.toString()}` : ''}`

      const response = await fetch(url)
      const data = await response.json()

      if (response.ok) {
        setAngledShots(data.angledShots || [])
      } else {
        toast.error(data.error || 'Failed to load angled shots')
      }
    } catch (error) {
      toast.error('Failed to load angled shots')
    } finally {
      setLoading(false)
    }
  }

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

  useEffect(() => {
    fetchProducts()
    fetchAngledShots()
  }, [categoryId, format]) // NEW: Added format to dependencies

  const handleProductFilter = (productId: string) => {
    setSelectedProductId(productId)
    setLoading(true)
    if (productId === 'all') {
      fetchAngledShots()
    } else {
      fetchAngledShots(productId)
    }
  }

  const handleRefresh = () => {
    setLoading(true)
    if (selectedProductId === 'all') {
      fetchAngledShots()
    } else {
      fetchAngledShots(selectedProductId)
    }
  }

  const handleDeleted = () => {
    handleRefresh()
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-80 bg-muted rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Angled Shots</h2>
          <p className="text-muted-foreground">
            AI-generated angle variations for {format || '1:1'} format
          </p>
        </div>
        <div className="flex items-center gap-3">
          {products.length > 0 && (
            <Select value={selectedProductId} onValueChange={handleProductFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <GenerateAngledShotsDialog
            categoryId={categoryId}
            format={format || '1:1'}
            onGenerated={handleRefresh}
          />
        </div>
      </div>

      {angledShots.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">No angled shots for {format || '1:1'} format yet</h3>
          <p className="text-muted-foreground mb-4 max-w-md mx-auto">
            Generate AI-powered angle variations of your product images.
            Each generation creates 7 different camera angles optimized for {format || '1:1'} aspect ratio.
          </p>
          <GenerateAngledShotsDialog
            categoryId={categoryId}
            format={format || '1:1'}
            onGenerated={handleRefresh}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {angledShots.map((angledShot) => (
              <AngledShotCard
                key={angledShot.id}
                angledShot={angledShot}
                categoryId={categoryId}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Showing {angledShots.length} angled shot{angledShots.length !== 1 ? 's' : ''}
            {selectedProductId !== 'all' && ' for selected product'}
          </div>
        </>
      )}
    </div>
  )
}
