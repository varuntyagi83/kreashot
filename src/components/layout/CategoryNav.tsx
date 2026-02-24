'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Image,
  Rotate3D,
  Paintbrush,
  Layers,
  FileText,
  BookOpen,
  Sparkles,
  Download,
  Package,
} from 'lucide-react'

interface CategoryNavProps {
  categoryId: string
}

const steps = [
  { id: 'assets', label: 'Assets', icon: Image, step: 2 },
  { id: 'angled-shots', label: 'Angled Shots', icon: Rotate3D, step: 3 },
  { id: 'backgrounds', label: 'Backgrounds', icon: Paintbrush, step: 4 },
  { id: 'composites', label: 'Composites', icon: Layers, step: 5 },
  { id: 'copy', label: 'Copy', icon: FileText, step: 6 },
  { id: 'guidelines', label: 'Guidelines', icon: BookOpen, step: 7 },
  { id: 'final-assets', label: 'Final Assets', icon: Sparkles, step: 8 },
  { id: 'ad-export', label: 'Ad Export', icon: Download, step: 9 },
]

export function CategoryNav({ categoryId }: CategoryNavProps) {
  const pathname = usePathname()

  return (
    <div className="space-y-1 px-3 py-2">
      {/* Products Link */}
      <Link
        href={`/categories/${categoryId}`}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          pathname === `/categories/${categoryId}`
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Package className="h-4 w-4" />
        <span className="flex-1">Products</span>
        <span className="text-xs opacity-50">#1</span>
      </Link>

      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pipeline Steps
        </h3>
      </div>
      {steps.map((step) => {
        const href = `/category/${categoryId}/${step.id}`
        const isActive = pathname === href
        const Icon = step.icon

        return (
          <Link
            key={step.id}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{step.label}</span>
            <span className="text-xs opacity-50">#{step.step}</span>
          </Link>
        )
      })}
    </div>
  )
}
