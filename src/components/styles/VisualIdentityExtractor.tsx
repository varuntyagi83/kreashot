'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ImageIcon, Sparkles, Loader2, X, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'

interface VisualIdentity {
  look_and_feel: string
  color_palette: string
  typography_style: string
  photography_style: string
  visual_mood: string[]
  design_principles: string
}

interface VisualIdentityExtractorProps {
  categoryId: string
  onLookAndFeelUpdated?: (value: string) => void
}

export function VisualIdentityExtractor({ categoryId, onLookAndFeelUpdated }: VisualIdentityExtractorProps) {
  const [expanded, setExpanded] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [identity, setIdentity] = useState<VisualIdentity | null>(null)
  const [images, setImages] = useState<Array<{ base64: string; mimeType: string; name: string }>>([])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 5) {
      toast.error('Maximum 5 images')
      return
    }
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setImages((prev) => [
          ...prev,
          { base64: reader.result as string, mimeType: file.type, name: file.name },
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleExtract = async () => {
    if (images.length === 0 || extracting) return
    setExtracting(true)
    try {
      const res = await fetch(`/api/categories/${categoryId}/extract-visual-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: images.map(({ base64, mimeType }) => ({ base64, mimeType })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')
      setIdentity(data.visual_identity)
      onLookAndFeelUpdated?.(data.visual_identity.look_and_feel)
      setExpanded(false)
      toast.success('Visual identity extracted and look & feel updated!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to extract visual identity')
    } finally {
      setExtracting(false)
    }
  }

  // Collapsed with result
  if (identity && !expanded) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Visual Identity</CardTitle>
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                Extracted
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded(true)}>
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Mood badges */}
          <div className="flex flex-wrap gap-1.5">
            {identity.visual_mood?.map((m, i) => (
              <Badge key={i} variant="outline" className="text-xs capitalize">{m}</Badge>
            ))}
          </div>
          {/* Look & feel */}
          <div>
            <p className="text-xs font-semibold mb-1">Look & Feel</p>
            <p className="text-xs text-muted-foreground leading-relaxed italic">"{identity.look_and_feel}"</p>
          </div>
          {/* Color + Typography */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold mb-1">Colors</p>
              <p className="text-xs text-muted-foreground leading-tight">{identity.color_palette}</p>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">Typography</p>
              <p className="text-xs text-muted-foreground leading-tight">{identity.typography_style}</p>
            </div>
          </div>
          {/* Photography */}
          <div>
            <p className="text-xs font-semibold mb-1">Photography Style</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{identity.photography_style}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Collapsed without result — compact prompt
  if (!identity && !expanded) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-dashed bg-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>Extract visual identity from brand images</span>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-primary font-medium hover:underline"
        >
          Extract →
        </button>
      </div>
    )
  }

  // Expanded form
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Extract Visual Identity</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(false)}>
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Upload existing ads or brand images. Gemini analyses colours, typography, photography
          style, and mood — then updates your category's Look & Feel automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Image grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.base64}
                  alt={img.name}
                  className="w-full aspect-square object-cover rounded-md border"
                />
                <button
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload zone */}
        {images.length < 5 && (
          <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 cursor-pointer hover:bg-muted/30 transition-colors">
            <ImageIcon className="h-7 w-7 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Upload brand images or ads</p>
            <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP — up to 5 images</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={handleImageUpload}
              disabled={extracting}
            />
          </label>
        )}

        <Button onClick={handleExtract} disabled={extracting || images.length === 0} className="w-full">
          {extracting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing brand images...</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Extract Visual Identity</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
