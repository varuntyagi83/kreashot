'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileText, Copy, Trash2, MoreVertical, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

interface CopyDoc {
  id: string
  original_text: string
  generated_text: string
  copy_type: string
  tone: string | null
  language: string
  created_at: string
  prompt_used: string | null
}

interface CopyGalleryProps {
  categoryId: string
  refreshTrigger?: number
}

const TYPE_COLORS: Record<string, string> = {
  hook:     'bg-blue-100 text-blue-700',
  headline: 'bg-purple-100 text-purple-700',
  tagline:  'bg-emerald-100 text-emerald-700',
  cta:      'bg-orange-100 text-orange-700',
  body:     'bg-pink-100 text-pink-700',
}

const TYPE_LABELS: Record<string, string> = {
  hook: 'Hook', headline: 'Headline', tagline: 'Tagline', cta: 'CTA', body: 'Body',
}

export function CopyGallery({ categoryId, refreshTrigger }: CopyGalleryProps) {
  const [copyDocs, setCopyDocs] = useState<CopyDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchCopyDocs = async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/copy-docs`)
      const data = await response.json()
      if (response.ok) {
        setCopyDocs(data.copy_docs || [])
      } else {
        toast.error(data.error || 'Failed to load copy docs')
      }
    } catch {
      toast.error('Failed to load copy docs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCopyDocs() }, [categoryId, refreshTrigger])

  const handleDelete = async (id: string, generatedText: string) => {
    const preview = generatedText.substring(0, 50) + '...'
    if (!confirm(`Delete "${preview}"? This action cannot be undone.`)) return

    setDeletingId(id)
    try {
      const response = await fetch(`/api/categories/${categoryId}/copy-docs/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (response.ok) {
        toast.success('Copy deleted')
        fetchCopyDocs()
      } else {
        toast.error(data.error || 'Failed to delete copy')
      }
    } catch {
      toast.error('Failed to delete copy')
    } finally {
      setDeletingId(null)
    }
  }

  const handleCopyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#1A1A1A]">Saved Copy</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white shadow-sm animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (copyDocs.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Saved Copy</h2>
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[#D0D0D0] rounded-xl bg-white text-center">
          <FileText className="h-10 w-10 text-[#C0C0C0] mb-3" />
          <p className="text-sm font-medium text-[#555]">No saved copy yet</p>
          <p className="text-xs text-[#999] mt-1">Generate and save your first copy kit using the panel on the left</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#1A1A1A]">Saved Copy</h2>
        <span className="text-xs text-[#999]">{copyDocs.length} items</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {copyDocs.map((doc) => (
          <div
            key={doc.id}
            className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-[#F0EFEC] p-4 space-y-3"
          >
            {/* Top row: badges + actions */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className={`text-[10px] font-medium border-0 px-2 py-0.5 ${TYPE_COLORS[doc.copy_type] || 'bg-gray-100 text-gray-600'}`}>
                  {TYPE_LABELS[doc.copy_type] || doc.copy_type}
                </Badge>
                {doc.tone && (
                  <Badge variant="outline" className="text-[10px] border-[#E8E8E6] text-[#777] px-2 py-0.5">
                    {doc.tone}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleCopyToClipboard(doc.id, doc.generated_text)}
                  className="p-1.5 rounded-lg hover:bg-[#F5F5F3] text-[#999] hover:text-[#7C5DFA] transition-colors"
                  title="Copy to clipboard"
                >
                  {copiedId === doc.id
                    ? <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                    : <Copy className="h-3.5 w-3.5" />
                  }
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 rounded-lg hover:bg-[#F5F5F3] text-[#999] hover:text-[#555] transition-colors"
                      disabled={deletingId === doc.id}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem
                      onClick={() => handleDelete(doc.id, doc.generated_text)}
                      className="text-[#E63946] focus:text-[#E63946] text-xs"
                      disabled={deletingId === doc.id}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Copy text */}
            <p className="text-sm text-[#333] leading-relaxed whitespace-pre-wrap line-clamp-4">
              {doc.generated_text}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between text-[10px] text-[#BBB] pt-1 border-t border-[#F5F5F3]">
              <span>{doc.generated_text.length} chars</span>
              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
