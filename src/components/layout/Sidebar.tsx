'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { CategoryNav } from './CategoryNav'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Palette,
  FolderOpen,
  Shield,
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [pathname])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL
        if (superAdminEmail && d.email === superAdminEmail) {
          setIsSuperAdmin(true)
        } else if (d.isSuperAdmin) {
          setIsSuperAdmin(true)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const match = pathname.match(/\/categories\/([^/?]+)/)
    if (match) {
      const categoryId = match[1]
      setExpandedCategories((prev) =>
        prev.includes(categoryId) ? prev : [...prev, categoryId]
      )
      setSelectedCategory(categoryId)
    }
  }, [pathname, setSelectedCategory])

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      const data = await response.json()
      if (response.ok) setCategories(data.categories || [])
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (categoryId: string) => {
    const isCurrentlyExpanded = expandedCategories.includes(categoryId)
    setExpandedCategories((prev) =>
      isCurrentlyExpanded ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    )
    setSelectedCategory(categoryId)
    router.push(isCurrentlyExpanded ? '/categories' : `/categories/${categoryId}`)
  }

  const isBrandAssetsActive = pathname === '/brand-assets'
  const isCategoriesActive = pathname === '/categories'
  const isAdminActive = pathname === '/admin'

  const navItem = (
    href: string,
    active: boolean,
    icon: React.ReactNode,
    label: string,
    onClick?: () => void
  ) => (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-[rgba(201,146,42,0.15)] text-[#F5F0E8] border-l-2 border-[#C9922A] font-medium'
          : 'text-[#7A6E62] hover:bg-[rgba(201,146,42,0.08)] hover:text-[#DDD8CE]'
      )}
    >
      {icon}
      <span className="flex-1 font-medium">{label}</span>
    </Link>
  )

  return (
    <div className="flex h-full w-[220px] flex-col" style={{ backgroundColor: '#1A1208' }}>

      {/* Wordmark */}
      <div className="flex items-center px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Link href="/">
          <Image
            src="/kreashot-wordmark-light.png"
            alt="Kreashot"
            width={110}
            height={21}
            priority
          />
        </Link>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 py-4 px-3">

          {/* Primary nav */}
          {navItem('/categories', isCategoriesActive, <FolderOpen className="h-4 w-4 shrink-0" />, 'All Categories')}
          {navItem('/brand-assets', isBrandAssetsActive, <Palette className="h-4 w-4 shrink-0" />, 'Brand Kit')}
          {isSuperAdmin && navItem('/admin', isAdminActive, <Shield className="h-4 w-4 shrink-0" />, 'Admin')}

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

          {/* Categories section */}
          <div className="flex items-center justify-between px-3 py-2">
            <h3 style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5C5245' }}>
              Categories
            </h3>
            <button
              onClick={() => router.push('/categories')}
              title="New category"
              className="h-5 w-5 rounded flex items-center justify-center transition-colors"
              style={{ color: '#5C5245' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#C9922A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#5C5245')}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {loading ? (
              <div className="space-y-2 px-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="px-3 py-3 text-center" style={{ fontSize: '12px', color: '#5C5245' }}>
                No categories yet
              </p>
            ) : (
              categories.map((category) => {
                const isExpanded = expandedCategories.includes(category.id)
                const isSelected = selectedCategoryId === category.id

                return (
                  <div key={category.id} className="space-y-0.5">
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                        isSelected
                          ? 'border-l-2 border-[#C9922A] font-medium'
                          : ''
                      )}
                      style={{
                        backgroundColor: isSelected ? 'rgba(201,146,42,0.12)' : 'transparent',
                        color: isSelected ? '#F5F0E8' : '#7A6E62',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'rgba(201,146,42,0.06)'
                          e.currentTarget.style.color = '#DDD8CE'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = '#7A6E62'
                        }
                      }}
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 text-left truncate">{category.name}</span>
                    </button>
                    {isExpanded && <CategoryNav categoryId={category.id} />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom: brand tag */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 16px' }}>
        <p style={{ fontSize: '11px', color: '#5C5245' }}>© 2026 Kreashot</p>
      </div>
    </div>
  )
}
