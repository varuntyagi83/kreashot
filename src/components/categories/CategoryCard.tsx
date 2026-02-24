'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2, Edit, Eye } from 'lucide-react'
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

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="line-clamp-1">{category.name}</CardTitle>
            <CardDescription className="mt-1">
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                @{category.slug}
              </code>
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/categories/${category.id}`} className="cursor-pointer">
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} disabled={deleting} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {category.description}
        </p>

        {category.look_and_feel && (
          <div className="mb-3">
            <p className="text-xs font-medium mb-1">Look & Feel:</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {category.look_and_feel}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="text-xs">
            {category.counts?.products || 0} product{category.counts?.products !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {category.counts?.angled_shots || 0} angled shot{category.counts?.angled_shots !== 1 ? 's' : ''}
          </Badge>
        </div>

        <Link href={`/categories/${category.id}`}>
          <Button variant="outline" size="sm" className="w-full mt-4">
            Open Category
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
