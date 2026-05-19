'use client'

import { useState, useEffect } from 'react'
import { Package, Image as ImageIcon, ExternalLink, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ParsedReference {
  type: 'text' | 'reference'
  content: string
  referenceType?: 'brand-asset' | 'product' | 'guideline'
  referenceId?: string
  referenceName?: string
}

interface ReferenceDetails {
  id: string
  type: 'brand-asset' | 'product' | 'guideline'
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
        referenceType: match[2] as 'brand-asset' | 'product' | 'guideline',
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

  // Fetch reference details via API
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
          try {
            const res = await fetch(`/api/brand-assets/${ref.referenceId}`)
            if (res.ok) {
              const { asset } = await res.json()
              newReferences.set(key, {
                id: asset.id,
                type: 'brand-asset',
                name: asset.name || asset.fileName,
                preview: asset.storageUrl,
                isImage: (asset.mimeType || '').startsWith('image/'),
              })
            }
          } catch {
            // Non-fatal
          }
        } else if (ref.referenceType === 'product') {
          try {
            const res = await fetch(`/api/products/${ref.referenceId}`)
            if (res.ok) {
              const { product } = await res.json()
              newReferences.set(key, {
                id: product.id,
                type: 'product',
                name: product.name,
                categoryName: product.category?.name,
                categoryId: product.categoryId,
              })
            }
          } catch {
            // Non-fatal
          }
        } else if (ref.referenceType === 'guideline') {
          try {
            const res = await fetch(`/api/brand-guidelines/${ref.referenceId}`)
            if (res.ok) {
              const { guideline } = await res.json()
              newReferences.set(key, {
                id: guideline.id,
                type: 'guideline',
                name: guideline.name,
              })
            }
          } catch {
            // Non-fatal
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
              {part.referenceType === 'guideline' ? (
                <FileText className="h-3 w-3" />
              ) : part.referenceType === 'brand-asset' ? (
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
              {ref.type === 'guideline' ? (
                <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
              ) : ref.type === 'brand-asset' && ref.isImage && ref.preview ? (
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
                  {ref.type === 'guideline'
                    ? 'Brand Guidelines'
                    : ref.type === 'brand-asset'
                      ? 'Brand Asset'
                      : `Product in ${ref.categoryName}`}
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
