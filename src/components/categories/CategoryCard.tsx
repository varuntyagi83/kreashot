'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'

interface CategoryCardProps {
  category: {
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
  onDeleted: () => void
}

const GRADIENTS = [
  'from-violet-400 to-purple-600',
  'from-sky-400 to-blue-600',
  'from-emerald-400 to-teal-600',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-500',
]

function pickGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

export function CategoryCard({ category, onDeleted }: CategoryCardProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${category.name}"? This will delete all associated data.`)) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        onDeleted()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete category')
      }
    } catch (error) {
      toast.error('Failed to delete category')
    } finally {
      setDeleting(false)
    }
  }

  const gradient = pickGradient(category.name)
  const initial = category.name.charAt(0).toUpperCase()
  const productCount = category.counts?.products || 0

  return (
    <div className="bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow border-0 cursor-pointer overflow-hidden">
      {/* Thumbnail */}
      <div className={`h-28 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <span className="text-4xl font-bold text-white opacity-20 select-none">{initial}</span>
      </div>

      {/* Body */}
      <div className="p-4">
        <p className="text-sm font-semibold text-foreground line-clamp-1">{category.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">@{category.slug}</p>
        <span className="bg-muted text-muted-foreground text-xs rounded-full px-2 py-0.5 mt-2 inline-block">
          {productCount} product{productCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Actions row */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete category"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Link
          href={`/categories/${category.id}`}
          className="text-[#7C5DFA] text-sm font-medium hover:underline"
        >
          Open →
        </Link>
      </div>
    </div>
  )
}
