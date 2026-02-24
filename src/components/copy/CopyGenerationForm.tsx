'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
  { id: 'professional', label: 'Professional', color: 'bg-blue-500' },
  { id: 'casual',       label: 'Casual',       color: 'bg-green-500' },
  { id: 'playful',      label: 'Playful',      color: 'bg-yellow-500' },
  { id: 'urgent',       label: 'Urgent',       color: 'bg-red-500' },
  { id: 'empathetic',   label: 'Empathetic',   color: 'bg-purple-500' },
]

// ── Props ────────────────────────────────────────────────────────────────────

interface CopyGenerationFormProps {
  categoryId: string
  lookAndFeel: string
  brandDocName?: string | null
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
    if (!brief.trim()) { toast.error('Please enter a brief'); return }
    if (selectedTypes.length === 0) { toast.error('Select at least one copy type'); return }
    if (selectedTones.length === 0) { toast.error('Select at least one tone'); return }

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
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="border rounded-lg p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Generate Copy Kit</h2>
      </div>

      {/* Style guide pill */}
      {lookAndFeel && (
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <span className="text-muted-foreground"><strong>Style:</strong> {lookAndFeel}</span>
        </div>
      )}

      {/* Brand Guidelines PDF */}
      <div className="space-y-2">
        <Label>Brand Guidelines PDF (Optional)</Label>
        {currentBrandDoc ? (
          <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/30">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm flex-1 truncate">{currentBrandDoc}</span>
            <Badge variant="secondary" className="text-xs shrink-0">Active</Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={handleRemoveBrandDoc}
              disabled={isGenerating}
            >
              <X className="h-3 w-3" />
            </Button>
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
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf || isGenerating}
            >
              {uploadingPdf
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing PDF...</>
                : <><Upload className="h-4 w-4 mr-2" />Upload Brand Guidelines PDF</>
              }
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              Upload your brand PDF so the AI stays on-brand. Text is extracted and used as context. Max 10MB.
            </p>
          </div>
        )}
      </div>

      {/* Brief */}
      <div className="space-y-2">
        <Label htmlFor="brief">
          Product Brief <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="brief"
          placeholder="e.g., Vitamin C Gummies for daily immunity boost — fun, chewable, 1000mg per serving, for adults who hate swallowing pills"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          maxLength={500}
          disabled={isGenerating}
        />
        <p className="text-xs text-muted-foreground">{brief.length}/500 characters</p>
      </div>

      {/* Copy Types checklist */}
      <div className="space-y-3">
        <Label>
          Copy Types <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COPY_TYPES.map((type) => (
            <div
              key={type.id}
              onClick={() => !isGenerating && toggleType(type.id)}
              className={`flex items-start gap-2 border rounded-md p-3 cursor-pointer transition-colors select-none ${
                selectedTypes.includes(type.id)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/30'
              } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Checkbox
                checked={selectedTypes.includes(type.id)}
                className="mt-0.5 pointer-events-none"
                onCheckedChange={() => {}}
              />
              <div>
                <p className="text-sm font-medium leading-none">{type.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tones */}
      <div className="space-y-3">
        <Label>
          Tones <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((tone) => {
            const isSelected = selectedTones.includes(tone.id)
            return (
              <button
                key={tone.id}
                type="button"
                onClick={() => !isGenerating && toggleTone(tone.id)}
                disabled={isGenerating}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  isSelected
                    ? `${tone.color} text-white border-transparent`
                    : 'border-border bg-transparent hover:bg-muted/30 text-foreground'
                }`}
              >
                {tone.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Each selected tone generates a separate version of every copy type.
        </p>
      </div>

      {/* Target Audience */}
      <div className="space-y-2">
        <Label htmlFor="audience">Target Audience (Optional)</Label>
        <Textarea
          id="audience"
          placeholder="e.g., Health-conscious adults 25–45 who want convenient daily supplements"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          rows={2}
          maxLength={200}
          disabled={isGenerating}
        />
      </div>

      {/* Summary + Generate */}
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {selectedTypes.length} types × {selectedTones.length} tones
          </span>
          <span className="font-semibold">
            {totalCombinations} combinations
          </span>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={
            isGenerating ||
            !brief.trim() ||
            selectedTypes.length === 0 ||
            selectedTones.length === 0
          }
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating {totalCombinations} combinations...</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Generate {totalCombinations} Combinations</>
          )}
        </Button>
      </div>
    </div>
  )
}
