'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Save, X, Sparkles, Copy, CheckCheck } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface GeneratedCopy {
  copy_type?: string
  tone?: string
  prompt_used: string
  generated_text: string
}

interface CopyPreviewGridProps {
  categoryId: string
  generatedCopies: GeneratedCopy[]
  brief: string
  copyType: string  // 'kit' or a single type
  onSaveComplete: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function groupByType(copies: GeneratedCopy[]): Record<string, GeneratedCopy[]> {
  const groups: Record<string, GeneratedCopy[]> = {}
  for (const copy of copies) {
    const key = copy.copy_type || 'other'
    if (!groups[key]) groups[key] = []
    groups[key].push(copy)
  }
  return groups
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopyPreviewGrid({
  categoryId,
  generatedCopies,
  brief,
  copyType,
  onSaveComplete,
}: CopyPreviewGridProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const isKitMode = copyType === 'kit'
  const groups = isKitMode ? groupByType(generatedCopies) : null

  const cardKey = (copy: GeneratedCopy, idx: number) =>
    copy.copy_type && copy.tone ? `${copy.copy_type}-${copy.tone}` : String(idx)

  const handleSave = async (key: string, copy: GeneratedCopy) => {
    const name = customNames[key]
    if (!name || !name.trim()) {
      toast.error('Please enter a name for this copy')
      return
    }

    setSavingKey(key)
    try {
      const response = await fetch(`/api/categories/${categoryId}/copy-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          originalText: brief,
          generatedText: copy.generated_text,
          copyType: copy.copy_type || copyType,
          tone: copy.tone || undefined,
          language: 'en',
          promptUsed: copy.prompt_used,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to save copy')

      toast.success('Saved!')
      setSavedKeys((prev) => new Set([...prev, key]))

      if (savedKeys.size + 1 === generatedCopies.length) {
        onSaveComplete()
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save copy')
    } finally {
      setSavingKey(null)
    }
  }

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const CopyCard = ({ copy, idx }: { copy: GeneratedCopy; idx: number }) => {
    const key = cardKey(copy, idx)
    const isSaved = savedKeys.has(key)
    const isSaving = savingKey === key
    const typeLabel = TYPE_LABELS[copy.copy_type || ''] || copy.copy_type || 'Copy'

    return (
      <div className={`group bg-card rounded-xl shadow-sm border border p-4 space-y-3 transition-opacity ${isSaved ? 'opacity-60' : ''}`}>
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {copy.copy_type && (
              <Badge className={`text-[10px] font-medium border-0 px-2 py-0.5 ${TYPE_COLORS[copy.copy_type] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                {typeLabel}
              </Badge>
            )}
            {copy.tone && (
              <Badge variant="outline" className="text-[10px] border text-muted-foreground px-2 py-0.5">
                {copy.tone}
              </Badge>
            )}
            {isSaved && (
              <Badge className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-0 px-2 py-0.5">
                Saved ✓
              </Badge>
            )}
          </div>
          <button
            onClick={() => handleCopy(key, copy.generated_text)}
            className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-primary transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          >
            {copiedKey === key
              ? <CheckCheck className="h-3.5 w-3.5 text-green-500" />
              : <Copy className="h-3.5 w-3.5" />
            }
          </button>
        </div>

        {/* Text */}
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {copy.generated_text}
        </p>

        <p className="text-[10px] text-muted-foreground/60">{copy.generated_text.length} characters</p>

        {/* Save row */}
        {!isSaved && (
          <div className="flex gap-2 pt-1 border-t border">
            <Input
              placeholder={`Name this ${typeLabel.toLowerCase()}...`}
              value={customNames[key] || ''}
              onChange={(e) => setCustomNames((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={isSaving}
              className="h-7 text-xs border-input focus:border-primary rounded-lg"
            />
            <Button
              size="sm"
              className="h-7 px-3 shrink-0 bg-primary hover:bg-primary/90 text-white text-xs rounded-lg"
              onClick={() => handleSave(key, copy)}
              disabled={isSaving || !customNames[key]?.trim()}
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            {isKitMode
              ? `Generated — ${generatedCopies.length} combinations`
              : `Generated ${TYPE_LABELS[copyType] || copyType}`}
          </h2>
        </div>
        <button
          onClick={onSaveComplete}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      {/* Kit mode: group by type */}
      {isKitMode && groups ? (
        <div className="space-y-6">
          {Object.entries(groups).map(([type, copies]) => (
            <div key={type} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={`text-xs border-0 ${TYPE_COLORS[type] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                  {TYPE_LABELS[type] || type}
                </Badge>
                <span className="text-xs text-muted-foreground">{copies.length} tone{copies.length > 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {copies.map((copy, idx) => (
                  <CopyCard
                    key={cardKey(copy, idx)}
                    copy={copy}
                    idx={generatedCopies.indexOf(copy)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {generatedCopies.map((copy, idx) => (
            <CopyCard key={idx} copy={copy} idx={idx} />
          ))}
        </div>
      )}
    </div>
  )
}
