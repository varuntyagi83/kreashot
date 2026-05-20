'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
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
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'products'

  return (
    <div className="space-y-1 px-3 py-2">
      {steps.map((step) => {
        const href = `/categories/${categoryId}?tab=${step.id}`
        const isActive =
          pathname === `/categories/${categoryId}` &&
          activeTab === step.id
        const Icon = step.icon

        return (
          <Link
            key={step.id}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-1.5 text-xs transition-colors',
              isActive
                ? 'border-l-2 border-[#C9922A] font-medium'
                : ''
            )}
            style={{
              backgroundColor: isActive ? 'rgba(201,146,42,0.12)' : 'transparent',
              color: isActive ? '#F5F0E8' : '#5C5245',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(201,146,42,0.06)'
                ;(e.currentTarget as HTMLElement).style.color = '#DDD8CE'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = '#5C5245'
              }
            }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{step.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
