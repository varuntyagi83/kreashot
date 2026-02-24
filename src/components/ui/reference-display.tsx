'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Package, Image as ImageIcon, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ParsedReference {
  type: 'text' | 'reference'
  content: string
  referenceType?: 'brand-asset' | 'product'
  referenceId?: string
  referenceName?: string
}

interface ReferenceDetails {
  id: string
  type: 'brand-asset' | 'product'
  name: string
  preview?: string
  isImage?: boolean
  categoryName?: string
  categoryId?: string
}

interface ReferenceDisplayProps {
  text: string
  className?: string
}

export function ReferenceDisplay({ text, className }: ReferenceDisplayProps) {
  const [references, setReferences] = useState<Map<string, ReferenceDetails>>(new Map())
  const supabase = createClient()

  // Parse text to extract references
  const parseReferences = (text: string): ParsedReference[] => {
    const regex = /@\[([^\]]+)\]\(([^:]+):([^)]+)\)/g
    const parts: ParsedReference[] = []
    let lastIndex = 0
    let match

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index),
        })
      }

      // Add the reference
      parts.push({
        type: 'reference',
        content: match[0],
        referenceName: match[1],
        referenceType: match[2] as 'brand-asset' | 'product',
        referenceId: match[3],
      })

      lastIndex = regex.lastIndex
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex),
      })
    }

    return parts
  }

  // Fetch reference details
  useEffect(() => {
    const parts = parseReferences(text)
    const referencesToFetch = parts.filter((p) => p.type === 'reference')

    if (referencesToFetch.length === 0) return

    const fetchReferences = async () => {
      const newReferences = new Map<string, ReferenceDetails>()

      for (const ref of referencesToFetch) {
        if (!ref.referenceId || !ref.referenceType) continue

        const key = `${ref.referenceType}:${ref.referenceId}`

        if (ref.referenceType === 'brand-asset') {
          const { data } = await supabase
            .from('brand_assets')
            .select('id, file_name, file_path, mime_type, storage_url, storage_path')
            .eq('id', ref.referenceId)
            .single()

          if (data) {
            // Use stored storage_url if available, otherwise generate from Supabase Storage
            const preview = data.storage_url ||
              supabase.storage.from('brand-assets').getPublicUrl(data.storage_path || data.file_path).data.publicUrl

            newReferences.set(key, {
              id: data.id,
              type: 'brand-asset',
              name: data.file_name,
              preview,
              isImage: data.mime_type.startsWith('image/'),
            })
          }
        } else if (ref.referenceType === 'product') {
          const { data } = await supabase
            .from('products')
            .select('id, name, category:categories!inner(id, name)')
            .eq('id', ref.referenceId)
            .single()

          if (data) {
            const productData = data as any
            newReferences.set(key, {
              id: productData.id,
              type: 'product',
              name: productData.name,
              categoryName: productData.category.name,
              categoryId: productData.category.id,
            })
          }
        }
      }

      setReferences(newReferences)
    }

    fetchReferences()
  }, [text])

  const parts = parseReferences(text)

  if (parts.every((p) => p.type === 'text')) {
    // No references, just display as plain text
    return <p className={cn('text-sm text-muted-foreground whitespace-pre-wrap', className)}>{text}</p>
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return <span key={index}>{part.content}</span>
          }

          const key = `${part.referenceType}:${part.referenceId}`
          const details = references.get(key)

          return (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium"
              title={details?.name || part.referenceName}
            >
              {part.referenceType === 'brand-asset' ? (
                <ImageIcon className="h-3 w-3" />
              ) : (
                <Package className="h-3 w-3" />
              )}
              {details?.name || part.referenceName}
            </span>
          )
        })}
      </div>

      {/* Visual previews of references */}
      {references.size > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {Array.from(references.values()).map((ref) => (
            <div
              key={`${ref.type}-${ref.id}`}
              className="flex items-center gap-2 p-2 border rounded-md hover:bg-accent transition-colors cursor-pointer text-xs"
            >
              {ref.type === 'brand-asset' && ref.isImage && ref.preview ? (
                <img
                  src={ref.preview}
                  alt={ref.name}
                  className="w-12 h-12 object-cover rounded"
                />
              ) : ref.type === 'brand-asset' ? (
                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                  <Package className="h-6 w-6 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{ref.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ref.type === 'brand-asset' ? 'Brand Asset' : `Product in ${ref.categoryName}`}
                </p>
              </div>

              {ref.type === 'product' && ref.categoryId && (
                <a
                  href={`/categories/${ref.categoryId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-background rounded"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
