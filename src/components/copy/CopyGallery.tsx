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
  hook:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  headline: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  tagline:  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  cta:      'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  body:     'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
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
          <h2 className="text-base font-semibold text-foreground">Saved Copy</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-card shadow-sm animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (copyDocs.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Saved Copy</h2>
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border rounded-xl bg-card text-center">
          <FileText className="h-10 w-10 text-muted-foreground/60 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No saved copy yet</p>
          <p className="text-xs text-muted-foreground mt-1">Generate and save your first copy kit using the panel on the left</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Saved Copy</h2>
        <span className="text-xs text-muted-foreground">{copyDocs.length} items</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {copyDocs.map((doc) => (
          <div
            key={doc.id}
            className="group bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow border border p-4 space-y-3"
          >
            {/* Top row: badges + actions */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge className={`text-[10px] font-medium border-0 px-2 py-0.5 ${TYPE_COLORS[doc.copy_type] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                  {TYPE_LABELS[doc.copy_type] || doc.copy_type}
                </Badge>
                {doc.tone && (
                  <Badge variant="outline" className="text-[10px] border text-muted-foreground px-2 py-0.5">
                    {doc.tone}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleCopyToClipboard(doc.id, doc.generated_text)}
                  className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors"
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
                      className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      disabled={deletingId === doc.id}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem
                      onClick={() => handleDelete(doc.id, doc.generated_text)}
                      className="text-destructive focus:text-destructive text-xs"
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
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
              {doc.generated_text}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 pt-1 border-t border">
              <span>{doc.generated_text.length} chars</span>
              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
