'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Sparkles, Upload, X, FileText, Loader2 } from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────

const COPY_TYPES = [
  { id: 'hook',     label: 'Hook',     description: 'Attention-grabbing opener' },
  { id: 'headline', label: 'Headline', description: 'Powerful title' },
  { id: 'cta',      label: 'CTA',      description: 'Call-to-action' },
  { id: 'body',     label: 'Body',     description: 'Persuasive copy' },
  { id: 'tagline',  label: 'Tagline',  description: 'Brand slogan' },
]

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'casual',       label: 'Casual' },
  { id: 'playful',      label: 'Playful' },
  { id: 'urgent',       label: 'Urgent' },
  { id: 'empathetic',   label: 'Empathetic' },
  { id: 'educational',  label: 'Educational' },
  { id: 'promotional',  label: 'Promotional' },
  { id: 'seasonal',     label: 'Seasonal' },
]

// ── Props ────────────────────────────────────────────────────────────────────

interface CopyGenerationFormProps {
  categoryId: string
  lookAndFeel: string
  brandDocName?: string | null
  brandVoiceId?: string | null
  onGenerate: (copies: any[], brief: string, copyType: string) => void
  isGenerating: boolean
  setIsGenerating: (value: boolean) => void
  onBrandDocChange?: (name: string | null) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function CopyGenerationForm({
  categoryId,
  lookAndFeel,
  brandDocName,
  brandVoiceId,
  onGenerate,
  isGenerating,
  setIsGenerating,
  onBrandDocChange,
}: CopyGenerationFormProps) {
  const [brief, setBrief] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['hook', 'headline', 'cta'])
  const [selectedTones, setSelectedTones] = useState<string[]>(['professional', 'playful'])
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [currentBrandDoc, setCurrentBrandDoc] = useState<string | null>(brandDocName ?? null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const generatingRef = useRef(false)

  const totalCombinations = selectedTypes.length * selectedTones.length

  // ── Toggles ───────────────────────────────────────────────────────────────

  const toggleType = (id: string) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const toggleTone = (id: string) => {
    setSelectedTones((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  // ── PDF upload ────────────────────────────────────────────────────────────

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/categories/${categoryId}/brand-docs`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to upload PDF')

      setCurrentBrandDoc(file.name)
      onBrandDocChange?.(file.name)
      toast.success(`Brand guidelines uploaded: ${file.name}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload brand guidelines')
    } finally {
      setUploadingPdf(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveBrandDoc = async () => {
    try {
      await fetch(`/api/categories/${categoryId}/brand-docs`, { method: 'DELETE' })
      setCurrentBrandDoc(null)
      onBrandDocChange?.(null)
      toast.success('Brand guidelines removed')
    } catch {
      toast.error('Failed to remove brand guidelines')
    }
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (generatingRef.current) return
    generatingRef.current = true

    if (!brief.trim()) { toast.error('Please enter a brief'); generatingRef.current = false; return }
    if (selectedTypes.length === 0) { toast.error('Select at least one copy type'); generatingRef.current = false; return }
    if (selectedTones.length === 0) { toast.error('Select at least one tone'); generatingRef.current = false; return }

    setIsGenerating(true)
    try {
      const response = await fetch(`/api/categories/${categoryId}/copy-docs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'kit',
          brief,
          copyTypes: selectedTypes,
          tones: selectedTones,
          targetAudience: targetAudience.trim() || undefined,
          brandVoiceId: brandVoiceId || undefined,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate copy')

      toast.success(`Generated ${data.results.length} copy combinations!`)
      onGenerate(data.results, brief, 'kit')
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate copy')
    } finally {
      setIsGenerating(false)
      generatingRef.current = false
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-2 pt-1">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Generate Copy Kit</h3>
      </div>

      {/* Style guide pill */}
      {lookAndFeel && (
        <div className="bg-background rounded-lg px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Style:</span> {lookAndFeel}
        </div>
      )}

      {/* Brand Guidelines PDF */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Brand Guidelines PDF</Label>
        {currentBrandDoc ? (
          <div className="flex items-center gap-2 border border-input rounded-lg px-3 py-2 bg-card">
            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs flex-1 truncate text-foreground">{currentBrandDoc}</span>
            <Badge className="text-[10px] bg-primary/10 text-primary border-0 shrink-0 px-1.5">Active</Badge>
            <button
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              onClick={handleRemoveBrandDoc}
              disabled={isGenerating}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />
            <button
              className="w-full border border-dashed border rounded-lg py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf || isGenerating}
            >
              {uploadingPdf
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Parsing PDF...</>
                : <><Upload className="h-3.5 w-3.5" />Upload Brand Guidelines PDF</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Brief */}
      <div className="space-y-1.5">
        <Label htmlFor="brief" className="text-xs font-medium text-muted-foreground">
          Product Brief <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="brief"
          placeholder="e.g., Vitamin C Gummies — fun, chewable, 1000mg, for adults who hate swallowing pills"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={isGenerating}
          className="text-xs resize-none border-input focus:border-primary rounded-lg bg-card"
        />
        <p className="text-[10px] text-muted-foreground text-right">{brief.length}/500</p>
      </div>

      {/* Copy Types */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Copy Types <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-1.5">
          {COPY_TYPES.map((type) => {
            const selected = selectedTypes.includes(type.id)
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => !isGenerating && toggleType(type.id)}
                disabled={isGenerating}
                className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all text-xs ${
                  selected
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border bg-card text-muted-foreground hover:border-[#C8C8C6]'
                } disabled:opacity-50`}
              >
                <span className="font-medium">{type.label}</span>
                <span className={`text-[10px] leading-tight ${selected ? 'text-primary/70' : 'text-muted-foreground'}`}>
                  {type.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Campaign Tone */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Campaign Tone <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {TONES.map((tone) => {
            const selected = selectedTones.includes(tone.id)
            return (
              <button
                key={tone.id}
                type="button"
                onClick={() => !isGenerating && toggleTone(tone.id)}
                disabled={isGenerating}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  selected
                    ? 'bg-primary text-white border-primary'
                    : 'border-input bg-card text-muted-foreground hover:border-primary hover:text-primary'
                } disabled:opacity-50`}
              >
                {tone.label}
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Each tone generates a separate version of every copy type.
        </p>
      </div>

      {/* Target Audience */}
      <div className="space-y-1.5">
        <Label htmlFor="audience" className="text-xs font-medium text-muted-foreground">
          Target Audience <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="audience"
          placeholder="e.g., Health-conscious adults 25–45 who want convenient daily supplements"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          rows={2}
          maxLength={200}
          disabled={isGenerating}
          className="text-xs resize-none border-input focus:border-primary rounded-lg bg-card"
        />
      </div>

      {/* Summary + Generate */}
      <div className="pt-2 border-t border space-y-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{selectedTypes.length} types × {selectedTones.length} tones</span>
          <span className="font-semibold text-foreground">{totalCombinations} combinations</span>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={
            isGenerating ||
            !brief.trim() ||
            selectedTypes.length === 0 ||
            selectedTones.length === 0
          }
          className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg h-9 text-sm font-medium"
        >
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating {totalCombinations}...</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Generate {totalCombinations} Combinations</>
          )}
        </Button>
      </div>
    </div>
  )
}
