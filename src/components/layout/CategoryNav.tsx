'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Package,
  Image,
  Sparkles,
  Camera,
  FileText,
  Megaphone,
  LayoutGrid,
} from 'lucide-react'

interface CategoryNavProps {
  categoryId: string
}

const steps = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'scenes', label: 'Scenes', icon: Image },
  { id: 'styles', label: 'Styles', icon: Sparkles },
  { id: 'photoshoots', label: 'Photoshoots', icon: Camera },
  { id: 'ad-copy', label: 'Ad Copy', icon: FileText },
  { id: 'ads', label: 'Ads', icon: Megaphone },
  { id: 'collage', label: 'Collage', icon: LayoutGrid },
]

export function CategoryNav({ categoryId }: CategoryNavProps) {
  const pathname = usePathname()

  return (
    <div className="space-y-1 px-3 py-2">
      {steps.map((step) => {
        const href = `/categories/${categoryId}?tab=${step.id}`
        const isActive =
          pathname === `/categories/${categoryId}` &&
          (typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('tab') === step.id
            : false)
        const Icon = step.icon

        return (
          <Link
            key={step.id}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground border-l-2 border-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{step.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
