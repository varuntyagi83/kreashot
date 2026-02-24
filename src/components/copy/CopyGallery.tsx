'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2, FileText, Copy } from 'lucide-react'
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
  hook:     'bg-blue-500',
  headline: 'bg-purple-500',
  tagline:  'bg-green-500',
  cta:      'bg-orange-500',
  body:     'bg-pink-500',
}

const TYPE_LABELS: Record<string, string> = {
  hook: 'Hook', headline: 'Headline', tagline: 'Tagline', cta: 'CTA', body: 'Body',
}

const TONE_COLORS: Record<string, string> = {
  professional: 'bg-blue-100 text-blue-800',
  casual:       'bg-green-100 text-green-800',
  playful:      'bg-yellow-100 text-yellow-800',
  urgent:       'bg-red-100 text-red-800',
  empathetic:   'bg-purple-100 text-purple-800',
}

export function CopyGallery({ categoryId, refreshTrigger }: CopyGalleryProps) {
  const [copyDocs, setCopyDocs] = useState<CopyDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Saved Copy</h2>
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => <Card key={i} className="h-32 animate-pulse bg-muted" />)}
        </div>
      </div>
    )
  }

  if (copyDocs.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Saved Copy</h2>
        <div className="text-center py-12 border border-dashed rounded-lg">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No saved copy yet</h3>
          <p className="text-muted-foreground">Generate and save your first copy kit above</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Saved Copy</h2>
        <p className="text-sm text-muted-foreground">{copyDocs.length} items</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {copyDocs.map((doc) => (
          <Card key={doc.id} className="p-5 space-y-3 group">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                {/* Type + Tone + Date badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${TYPE_COLORS[doc.copy_type] || 'bg-gray-500'} text-white text-xs`}>
                    {TYPE_LABELS[doc.copy_type] || doc.copy_type}
                  </Badge>
                  {doc.tone && (
                    <Badge variant="outline" className={`text-xs ${TONE_COLORS[doc.tone] || ''}`}>
                      {doc.tone}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Text */}
                <div className="bg-muted/50 rounded-md p-3">
                  <p className="text-sm whitespace-pre-wrap">{doc.generated_text}</p>
                </div>
                <p className="text-xs text-muted-foreground">{doc.generated_text.length} characters</p>
              </div>

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleCopyToClipboard(doc.generated_text)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={deletingId === doc.id}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleDelete(doc.id, doc.generated_text)}
                      className="text-red-600 focus:text-red-600"
                      disabled={deletingId === doc.id}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
