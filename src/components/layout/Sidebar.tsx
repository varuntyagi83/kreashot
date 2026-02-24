'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { CategoryNav } from './CategoryNav'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Palette,
  FolderOpen,
} from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { selectedCategoryId, setSelectedCategory } = useAppStore()
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      const data = await response.json()

      if (response.ok) {
        setCategories(data.categories || [])
      }
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (categoryId: string) => {
    const isCurrentlyExpanded = expandedCategories.includes(categoryId)

    setExpandedCategories((prev) =>
      isCurrentlyExpanded
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    )
    setSelectedCategory(categoryId)

    // Navigate based on expand/collapse state
    if (isCurrentlyExpanded) {
      // When collapsing, go back to all categories view
      router.push('/categories')
    } else {
      // When expanding, navigate to the category's products page
      router.push(`/categories/${categoryId}`)
    }
  }

  const isBrandAssetsActive = pathname === '/brand-assets'
  const isCategoriesActive = pathname === '/categories'

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      <ScrollArea className="flex-1">
        <div className="space-y-4 py-4">
          {/* Categories Overview */}
          <div className="px-3 py-2">
            <Link
              href="/categories"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isCategoriesActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="flex-1 font-medium">All Categories</span>
            </Link>
          </div>

          <Separator />

          {/* Brand Assets Section */}
          <div className="px-3 py-2">
            <Link
              href="/brand-assets"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isBrandAssetsActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Palette className="h-4 w-4" />
              <span className="flex-1 font-medium">Brand Assets</span>
              <Badge variant="secondary" className="text-xs">
                Global
              </Badge>
            </Link>
          </div>

          <Separator />

          {/* Categories Section */}
          <div className="px-3">
            <div className="flex items-center justify-between px-3 py-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Categories
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => router.push('/categories')}
                title="View all categories"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {loading ? (
                <div className="space-y-2 px-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-9 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : categories.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No categories yet
                </div>
              ) : (
                categories.map((category) => {
                const isExpanded = expandedCategories.includes(category.id)
                const isSelected = selectedCategoryId === category.id

                  return (
                    <div key={category.id} className="space-y-1">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                          isSelected
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <FolderOpen className="h-4 w-4" />
                        <span className="flex-1 text-left">{category.name}</span>
                      </button>
                      {isExpanded && <CategoryNav categoryId={category.id} />}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
