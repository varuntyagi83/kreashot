'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'
import { ProductCard } from './ProductCard'
import { AngledShotsList } from '@/components/angled-shots/AngledShotsList'
import { toast } from 'sonner'
import { ReferencePicker } from '@/components/ui/reference-picker'

interface Product {
  id: string
  name: string
  slug: string
  description: string | null
  created_at: string
}

interface ProductListProps {
  categoryId: string
  format: string
}

export function ProductList({ categoryId, format }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchProducts = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/products`)
      const data = await response.json()
      if (response.ok) setProducts(data.products || [])
      else toast.error(data.error || 'Failed to load products')
    } catch {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [categoryId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Please enter a product name'); return }
    setCreating(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Product created!')
        setName('')
        setDescription('')
        fetchProducts()
      } else {
        toast.error(data.error || 'Failed to create product')
      }
    } catch {
      toast.error('Failed to create product')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex gap-6">
      {/* Left panel: Add product form */}
      <div className="w-72 shrink-0">
        <div className="bg-card rounded-xl shadow-sm border border-border/50 p-5 sticky top-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Add Product</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="product-name" className="text-xs">
                Product Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="product-name"
                placeholder="e.g., Summer Sneakers"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-desc" className="text-xs">Description</Label>
              <ReferencePicker
                value={description}
                onChange={setDescription}
                placeholder="Optional description... Type @ to reference"
                disabled={creating}
                rows={3}
              />
            </div>
            <Button
              type="submit"
              disabled={creating || !name.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-white"
            >
              {creating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" />Add Product</>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Right panel: products + angled shots */}
      <div className="flex-1 min-w-0 space-y-10">
        {/* Products section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Products</h2>
            {!loading && products.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {products.length} product{products.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-square bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-xl">
              <h3 className="text-base font-medium mb-1">No products yet</h3>
              <p className="text-sm text-muted-foreground">
                Use the form on the left to add your first product.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryId={categoryId}
                  format={format}
                  onDeleted={fetchProducts}
                />
              ))}
            </div>
          )}
        </div>

        {/* Angled Shots section (merged from Angled Shots tab) */}
        <AngledShotsList categoryId={categoryId} format={format} />
      </div>
    </div>
  )
}
