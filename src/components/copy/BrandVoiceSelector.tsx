'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mic, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BrandVoiceProfile } from '@/lib/ai/brand-voice'

interface SavedVoice {
  id: string
  name: string
  is_default: boolean
  tone_words: string[]
  personality: string
  created_at: string
}

interface BrandVoiceSelectorProps {
  categoryBrandVoice: BrandVoiceProfile | null
  onSelect: (voiceId: string | null) => void
  selectedVoiceId: string | null
  refreshKey?: number
}

export function BrandVoiceSelector({
  categoryBrandVoice,
  onSelect,
  selectedVoiceId,
  refreshKey = 0,
}: BrandVoiceSelectorProps) {
  const [voices, setVoices] = useState<SavedVoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const res = await fetch('/api/brand-voices')
        const data = await res.json()
        if (res.ok) {
          setVoices(data.voices || [])
          // Auto-select default voice on first load if nothing selected
          if (!selectedVoiceId && data.voices?.length > 0) {
            const defaultVoice = data.voices.find((v: SavedVoice) => v.is_default)
            if (defaultVoice) onSelect(defaultVoice.id)
          }
        }
      } catch {
        /* ignore — dropdown stays empty */
      } finally {
        setLoading(false)
      }
    }
    fetchVoices()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      const res = await fetch(`/api/brand-voices/${voiceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setVoices((prev) => prev.filter((v) => v.id !== voiceId))
      if (selectedVoiceId === voiceId) onSelect(null)
      toast.success('Brand voice deleted')
    } catch {
      toast.error('Failed to delete brand voice')
    }
  }

  const hasCategoryVoice = !!categoryBrandVoice
  const hasLibraryVoices = voices.length > 0

  if (!hasCategoryVoice && !hasLibraryVoices && !loading) return null

  // Determine current display value
  const currentValue = selectedVoiceId || (hasCategoryVoice ? '_category' : '_none')

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">Brand Voice</Label>
      </div>

      <Select value={currentValue} onValueChange={(val) => onSelect(val === '_category' || val === '_none' ? null : val)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select brand voice..." />
        </SelectTrigger>
        <SelectContent>
          {hasCategoryVoice && (
            <SelectItem value="_category">
              <span className="flex items-center gap-2">
                Category Voice
                <span className="text-xs text-muted-foreground">
                  ({(categoryBrandVoice?.tone_words || []).slice(0, 3).join(', ')})
                </span>
              </span>
            </SelectItem>
          )}

          {hasCategoryVoice && hasLibraryVoices && <SelectSeparator />}

          {voices.map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              <span className="flex items-center gap-2">
                {voice.is_default && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                {voice.name}
                <span className="text-xs text-muted-foreground">
                  ({voice.tone_words.slice(0, 3).join(', ')})
                </span>
              </span>
            </SelectItem>
          ))}

          {!hasCategoryVoice && !hasLibraryVoices && (
            <SelectItem value="_none" disabled>
              No brand voices saved yet
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {/* Show selected voice summary */}
      {selectedVoiceId && voices.find((v) => v.id === selectedVoiceId) && (
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {voices
              .find((v) => v.id === selectedVoiceId)!
              .tone_words.map((word) => (
                <Badge key={word} variant="secondary" className="text-xs">
                  {word}
                </Badge>
              ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-destructive hover:text-destructive"
            onClick={(e) => handleDelete(selectedVoiceId, e)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {!selectedVoiceId && hasCategoryVoice && (
        <div className="flex flex-wrap gap-1">
          {(categoryBrandVoice?.tone_words || []).map((word) => (
            <Badge key={word} variant="secondary" className="text-xs">
              {word}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
