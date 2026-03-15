'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Search, Plus } from 'lucide-react'
import { driveImgSrc } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ProductShot {
  id: string
  display_name: string
  angle_name: string
  storage_url: string
  public_url?: string
  gdrive_file_id?: string | null
  product?: { id: string; name: string }
}

interface SelectProductImagesModalProps {
  open: boolean
  onClose: () => void
  categoryId: string
  initialSelected?: ProductShot[]
  onConfirm: (products: ProductShot[]) => void
}

export function SelectProductImagesModal({
  open,
  onClose,
  categoryId,
  initialSelected = [],
  onConfirm,
}: SelectProductImagesModalProps) {
  const [products, setProducts] = useState<ProductShot[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ProductShot[]>(initialSelected)

  useEffect(() => {
    if (open) {
      setSelected(initialSelected)
      fetchProducts()
    }
  }, [open, categoryId])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/angled-shots`)
      const data = await res.json()
      if (res.ok) setProducts(data.angledShots || [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  const toggle = (shot: ProductShot) => {
    setSelected(prev =>
      prev.find(p => p.id === shot.id)
        ? prev.filter(p => p.id !== shot.id)
        : [...prev, shot]
    )
  }

  const filtered = products.filter(p => {
    const label = (p.display_name || p.angle_name || p.product?.name || '').toLowerCase()
    return !search || label.includes(search.toLowerCase())
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">Select Product Images</h2>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-[#7C5DFA] text-[#7C5DFA] hover:bg-[#7C5DFA]/5"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add product
            </Button>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by product title or angle..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 border-[#E0E0E0]"
            />
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm font-medium">No product shots found</p>
              <p className="text-xs mt-1">Generate angled shots in the Products tab first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filtered.map(shot => {
                const isSelected = selected.some(p => p.id === shot.id)
                const label = shot.display_name || shot.angle_name
                return (
                  <button
                    key={shot.id}
                    onClick={() => toggle(shot)}
                    className={cn(
                      'relative rounded-xl overflow-hidden border-2 transition-all text-left',
                      isSelected
                        ? 'border-[#7C5DFA] ring-2 ring-[#7C5DFA]/20'
                        : 'border-transparent hover:border-muted-foreground/30'
                    )}
                  >
                    {/* Image */}
                    <div className="aspect-square bg-muted">
                      <img
                        src={driveImgSrc(shot.public_url || shot.storage_url, shot.gdrive_file_id)}
                        alt={label}
                        className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>

                    {/* Selected badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-[#7C5DFA] text-white rounded-full px-2 py-0.5 text-xs font-semibold">
                        Selected
                      </div>
                    )}

                    {/* Name label */}
                    <div className="p-2">
                      <p className="text-xs font-medium line-clamp-1">{label}</p>
                      {shot.product && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{shot.product.name}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom sticky bar */}
        {selected.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-white">
            <div className="flex items-center gap-3">
              {/* Selected thumbnails strip */}
              <div className="flex -space-x-2">
                {selected.slice(0, 5).map(p => (
                  <div key={p.id} className="w-8 h-8 rounded-full border-2 border-white overflow-hidden bg-muted">
                    <img
                      src={driveImgSrc(p.public_url || p.storage_url, p.gdrive_file_id)}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                Selected: {selected.length} image{selected.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected([])}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Deselect all
              </button>
              <Button
                onClick={() => { onConfirm(selected); onClose() }}
                className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
              >
                Confirm Selection
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
