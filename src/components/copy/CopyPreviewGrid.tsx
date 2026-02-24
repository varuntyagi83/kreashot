'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Save, X, FileText } from 'lucide-react'

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
  hook:     'bg-blue-500',
  headline: 'bg-purple-500',
  tagline:  'bg-green-500',
  cta:      'bg-orange-500',
  body:     'bg-pink-500',
}

const TONE_COLORS: Record<string, string> = {
  professional: 'bg-blue-100 text-blue-800',
  casual:       'bg-green-100 text-green-800',
  playful:      'bg-yellow-100 text-yellow-800',
  urgent:       'bg-red-100 text-red-800',
  empathetic:   'bg-purple-100 text-purple-800',
}

const TYPE_LABELS: Record<string, string> = {
  hook: 'Hook', headline: 'Headline', tagline: 'Tagline', cta: 'CTA', body: 'Body',
}

// Group copies by type for kit mode
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

  const isKitMode = copyType === 'kit'
  const groups = isKitMode ? groupByType(generatedCopies) : null

  // Unique key per card (type+tone combo or index)
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

      // If all saved, clear the preview
      if (savedKeys.size + 1 === generatedCopies.length) {
        onSaveComplete()
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save copy')
    } finally {
      setSavingKey(null)
    }
  }

  const CopyCard = ({ copy, idx }: { copy: GeneratedCopy; idx: number }) => {
    const key = cardKey(copy, idx)
    const isSaved = savedKeys.has(key)
    const isSaving = savingKey === key
    const typeLabel = TYPE_LABELS[copy.copy_type || ''] || copy.copy_type || 'Copy'

    return (
      <Card className={`p-4 space-y-3 transition-opacity ${isSaved ? 'opacity-50' : ''}`}>
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {copy.copy_type && (
            <Badge className={`${TYPE_COLORS[copy.copy_type] || 'bg-gray-500'} text-white text-xs`}>
              {typeLabel}
            </Badge>
          )}
          {copy.tone && (
            <Badge variant="outline" className={`text-xs ${TONE_COLORS[copy.tone] || ''}`}>
              {copy.tone}
            </Badge>
          )}
          {isSaved && (
            <Badge variant="secondary" className="text-xs ml-auto">Saved ✓</Badge>
          )}
        </div>

        {/* Text */}
        <div className="bg-muted/50 rounded-md p-3">
          <p className="text-sm whitespace-pre-wrap">{copy.generated_text}</p>
        </div>
        <p className="text-xs text-muted-foreground">{copy.generated_text.length} characters</p>

        {/* Save row */}
        {!isSaved && (
          <div className="flex gap-2">
            <Input
              placeholder={`Name this ${typeLabel.toLowerCase()}...`}
              value={customNames[key] || ''}
              onChange={(e) => setCustomNames((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={isSaving}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={() => handleSave(key, copy)}
              disabled={isSaving || !customNames[key]?.trim()}
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">
            {isKitMode ? `Copy Kit — ${generatedCopies.length} combinations` : `Generated ${TYPE_LABELS[copyType] || copyType}`}
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onSaveComplete}>
          <X className="h-4 w-4 mr-1" /> Clear All
        </Button>
      </div>

      {/* Kit mode: group by type */}
      {isKitMode && groups ? (
        <div className="space-y-8">
          {Object.entries(groups).map(([type, copies]) => (
            <div key={type} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={`${TYPE_COLORS[type] || 'bg-gray-500'} text-white`}>
                  {TYPE_LABELS[type] || type}
                </Badge>
                <span className="text-sm text-muted-foreground">{copies.length} tone{copies.length > 1 ? 's' : ''}</span>
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
        // Single mode: flat list
        <div className="grid grid-cols-1 gap-4">
          {generatedCopies.map((copy, idx) => (
            <CopyCard key={idx} copy={copy} idx={idx} />
          ))}
        </div>
      )}
    </div>
  )
}
