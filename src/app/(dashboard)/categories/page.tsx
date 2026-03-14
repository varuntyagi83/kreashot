'use client'

import { useEffect, useState } from 'react'
import { Plus, FolderOpen } from 'lucide-react'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { CreateCategoryDialog } from '@/components/categories/CreateCategoryDialog'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  slug: string
  description: string
  look_and_feel: string | null
  created_at: string
  counts?: {
    products: number
    angled_shots: number
  }
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      const data = await response.json()

      if (response.ok) {
        setCategories(data.categories || [])
      } else {
        toast.error(data.error || 'Failed to load categories')
      }
    } catch (error) {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleCategoryCreated = () => {
    setCreateDialogOpen(false)
    fetchCategories()
    toast.success('Category created successfully!')
  }

  const handleCategoryDeleted = () => {
    fetchCategories()
    toast.success('Category deleted successfully!')
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-7 w-44 bg-muted rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-72 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-9 w-36 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">All Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your ad campaigns by category
          </p>
        </div>
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-2 bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Category
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-xl p-12 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No categories yet</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Get started by creating your first category to organize your ad campaigns
          </p>
          <button
            onClick={() => setCreateDialogOpen(true)}
            className="inline-flex items-center gap-2 bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Category
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onDeleted={handleCategoryDeleted}
            />
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
