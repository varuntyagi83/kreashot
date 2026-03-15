'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Search, Plus, RefreshCw } from 'lucide-react'
import { driveImgSrc } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Scene {
  id: string
  name: string
  storage_url: string
  public_url?: string
  gdrive_file_id?: string | null
  format?: string
}

interface SceneLibraryModalProps {
  open: boolean
  onClose: () => void
  categoryId: string
  initialSelected?: Scene[]
  onConfirm: (scenes: Scene[]) => void
}

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'your_scenes', label: 'Your Scenes' },
  { key: 'plain', label: 'Plain Background' },
]

export function SceneLibraryModal({
  open,
  onClose,
  categoryId,
  initialSelected = [],
  onConfirm,
}: SceneLibraryModalProps) {
  const [scenes, setScenes] = useState<Scene[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [selected, setSelected] = useState<Scene[]>(initialSelected)

  useEffect(() => {
    if (open) {
      setSelected(initialSelected)
      fetchScenes()
    }
  }, [open, categoryId])

  const fetchScenes = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/backgrounds`)
      const data = await res.json()
      if (res.ok) setScenes(data.backgrounds || [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  const toggle = (scene: Scene) => {
    setSelected(prev =>
      prev.find(s => s.id === scene.id)
        ? prev.filter(s => s.id !== scene.id)
        : [...prev, scene]
    )
  }

  const filtered = scenes.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const matchTab =
      activeTab === 'all' ||
      activeTab === 'your_scenes' // all saved scenes count as "your scenes"
    return matchSearch && matchTab
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col mx-4 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b">
          <div>
            <h2 className="text-2xl font-bold tracking-tight uppercase">Scene Library</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose scenes from the library to add to your photoshoot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchScenes}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search + sort row */}
        <div className="flex items-center gap-3 px-6 py-3 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search scenes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 border-[#E0E0E0]"
            />
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-1 px-6 py-3 border-b">
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-[#FFFACD] text-[#7C5DFA] border border-[#7C5DFA]/30'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scene grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-7 gap-3">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm font-medium">No scenes found</p>
              <p className="text-xs mt-1">Generate scenes in the Scenes tab first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-3">
              {/* New scene card */}
              <button
                onClick={onClose}
                className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-[#7C5DFA]/40 hover:text-[#7C5DFA] transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs font-medium">New scene</span>
              </button>

              {filtered.map(scene => {
                const isSelected = selected.some(s => s.id === scene.id)
                return (
                  <div key={scene.id} className="relative group aspect-square">
                    <img
                      src={driveImgSrc(scene.public_url || scene.storage_url, scene.gdrive_file_id)}
                      alt={scene.name}
                      className="w-full h-full object-cover rounded-xl"
                    />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/40 transition-all flex flex-col items-center justify-end p-2 opacity-0 group-hover:opacity-100">
                      <p className="text-white text-xs font-medium line-clamp-1 mb-2 text-center">
                        {scene.name}
                      </p>
                      <button
                        onClick={() => toggle(scene)}
                        className={cn(
                          'w-full py-1 rounded-lg text-xs font-semibold transition-colors',
                          isSelected
                            ? 'bg-[#7C5DFA] text-white'
                            : 'bg-[#FFFACD] text-[#7C5DFA] hover:bg-[#7C5DFA] hover:text-white'
                        )}
                      >
                        {isSelected ? 'Selected ✓' : 'Select'}
                      </button>
                    </div>

                    {/* Always-visible selection badge */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 bg-[#7C5DFA] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold pointer-events-none">
                        ✓
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-white">
          <span className="text-sm text-muted-foreground">
            {selected.length === 0 ? 'No scenes selected' : `Selected: ${selected.length} scene${selected.length > 1 ? 's' : ''}`}
          </span>
          <Button
            disabled={selected.length === 0}
            onClick={() => { onConfirm(selected); onClose() }}
            className="bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
          >
            Add to Order
          </Button>
        </div>
      </div>
    </div>
  )
}
