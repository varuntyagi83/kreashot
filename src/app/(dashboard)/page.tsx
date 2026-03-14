'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { CreateCategoryDialog } from '@/components/categories/CreateCategoryDialog'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
  description: string
  look_and_feel: string | null
  created_at: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryCount, setCategoryCount] = useState<number | null>(null)
  const [productCount, setProductCount] = useState<number | null>(null)
  const [photoshootCount, setPhotoshootCount] = useState<number | null>(null)
  const [adsGeneratedCount, setAdsGeneratedCount] = useState<number | null>(null)
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.ok) {
        const data = await res.json()
        const cats: Category[] = data.categories || []
        setCategories(cats)
        setCategoryCount(cats.length)

        let products = 0
        let photoshoots = 0
        let ads = 0
        const perCatProducts: Record<string, number> = {}

        for (const cat of cats) {
          try {
            const [prodRes, compRes, finalRes] = await Promise.all([
              fetch(`/api/categories/${cat.id}/products`),
              fetch(`/api/categories/${cat.id}/composites`),
              fetch(`/api/categories/${cat.id}/final-assets`),
            ])

            if (prodRes.ok) {
              const d = await prodRes.json()
              const count = (d.products || []).length
              products += count
              perCatProducts[cat.id] = count
            } else {
              perCatProducts[cat.id] = 0
            }

            if (compRes.ok) {
              const d = await compRes.json()
              photoshoots += (d.composites || []).length
            }

            if (finalRes.ok) {
              const d = await finalRes.json()
              ads += (d.finalAssets || d.assets || []).length
            }
          } catch {
            perCatProducts[cat.id] = 0
          }
        }

        setProductCount(products)
        setPhotoshootCount(photoshoots)
        setAdsGeneratedCount(ads)
        setProductCounts(perCatProducts)
      }
    } catch {
      setCategoryCount(0)
      setProductCount(0)
      setPhotoshootCount(0)
      setAdsGeneratedCount(0)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleCategoryCreated = () => {
    setCreateDialogOpen(false)
    fetchData()
    toast.success('Category created successfully!')
  }

  const stats = [
    { label: 'Categories', value: categoryCount },
    { label: 'Products', value: productCount },
    { label: 'Photoshoots', value: photoshootCount },
    { label: 'Ads Generated', value: adsGeneratedCount },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Top Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card rounded-xl shadow-sm px-6 py-5"
          >
            <div className="text-4xl font-semibold text-foreground">
              {stat.value ?? '—'}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-foreground">Your Categories</h2>
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Category
        </Button>
      </div>

      {/* Categories Grid */}
      {categories.length === 0 ? (
        <div className="col-span-4 border-2 border-dashed border-muted rounded-xl flex flex-col items-center justify-center py-16 gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground">
            Create your first category
          </p>
          <p className="text-sm text-muted-foreground">
            Organize your products into categories to start generating ads
          </p>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="mt-2 bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Category
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col p-5 cursor-pointer"
              onClick={() => router.push(`/categories/${cat.id}`)}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="font-semibold text-foreground leading-tight">
                  {cat.name}
                </span>
                {productCounts[cat.id] !== undefined && (
                  <span className="bg-black/10 text-foreground text-xs rounded-full px-2 py-0.5 ml-2 shrink-0">
                    {productCounts[cat.id]} products
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground mb-4">
                {cat.slug}
              </span>
              <div className="mt-auto">
                <button
                  className="text-sm font-medium text-[#7C5DFA] hover:text-[#6A4FD8] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    router.push(`/categories/${cat.id}`)
                  }}
                >
                  Open →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleCategoryCreated}
      />
    </div>
  )
}
