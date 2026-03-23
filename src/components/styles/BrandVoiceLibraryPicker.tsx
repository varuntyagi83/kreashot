'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { BookOpen, Loader2, CheckCircle2 } from 'lucide-react'

interface SavedVoice {
  id: string
  name: string
  is_default: boolean
  tone_words: string[]
  personality: string
}

interface BrandVoiceLibraryPickerProps {
  categoryId: string
  currentVoiceApplied?: boolean
}

export function BrandVoiceLibraryPicker({ categoryId, currentVoiceApplied }: BrandVoiceLibraryPickerProps) {
  const [voices, setVoices] = useState<SavedVoice[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/brand-voices')
      .then(r => r.json())
      .then(d => { if (d.voices) setVoices(d.voices) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleApply = async () => {
    if (!selectedId) return
    setApplying(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/brand-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'library', voiceId: selectedId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to apply')
      setApplied(true)
      const voiceName = voices.find(v => v.id === selectedId)?.name || 'Brand voice'
      toast.success(`"${voiceName}" applied to this category`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply brand voice')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return null
  if (voices.length === 0) return null

  const selectedVoice = voices.find(v => v.id === selectedId)

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Apply from Library</CardTitle>
          {applied && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />Applied
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Apply a saved brand voice from your library to this category.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex gap-2">
          <Select value={selectedId} onValueChange={v => { setSelectedId(v); setApplied(false) }}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Select a brand voice…" />
            </SelectTrigger>
            <SelectContent>
              {voices.map(v => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.name}
                  {v.is_default && <span className="ml-1 text-muted-foreground">(default)</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs px-3"
            onClick={handleApply}
            disabled={!selectedId || applying}
          >
            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
          </Button>
        </div>

        {selectedVoice && (
          <div className="flex flex-wrap gap-1">
            {selectedVoice.tone_words.map((w, i) => (
              <Badge key={i} variant="outline" className="text-xs capitalize">{w}</Badge>
            ))}
            {selectedVoice.personality && (
              <p className="w-full text-xs text-muted-foreground italic mt-1">"{selectedVoice.personality.slice(0, 120)}{selectedVoice.personality.length > 120 ? '…' : ''}"</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
