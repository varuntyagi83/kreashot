'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ImageIcon, Sparkles, Loader2, X, CheckCircle2, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { BrandVoiceProfile } from '@/lib/ai/brand-voice'

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
  const [expanded, setExpanded] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [identity, setIdentity] = useState<VisualIdentity | null>(null)
  const [brandVoice, setBrandVoice] = useState<BrandVoiceProfile | null>(null)
  const [images, setImages] = useState<Array<{ base64: string; mimeType: string; name: string }>>([])

  const runExtraction = async (imagesToExtract: Array<{ base64: string; mimeType: string; name: string }>) => {
    if (imagesToExtract.length === 0 || extracting) return
    setExtracting(true)
    try {
      const payload = imagesToExtract.map(({ base64, mimeType }) => ({ base64, mimeType }))

      // Run visual identity + brand voice in parallel
      const [viRes, bvRes] = await Promise.all([
        fetch(`/api/categories/${categoryId}/extract-visual-identity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: payload }),
        }),
        fetch(`/api/categories/${categoryId}/brand-voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'images', images: payload }),
        }),
      ])

      const [viData, bvData] = await Promise.all([viRes.json(), bvRes.json()])

      if (!viRes.ok) throw new Error(viData.error || 'Visual identity extraction failed')

      setIdentity(viData.visual_identity)
      onLookAndFeelUpdated?.(viData.visual_identity.look_and_feel)

      if (bvRes.ok && bvData.brand_voice) {
        setBrandVoice(bvData.brand_voice)
      }

      setExpanded(false)
      toast.success('Brand guidelines extracted and saved!')
    } catch (err: any) {
      toast.error(err.message || 'Failed to extract brand guidelines')
    } finally {
      setExtracting(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 5) {
      toast.error('Maximum 5 images')
      return
    }

    let loaded = 0
    const incoming: Array<{ base64: string; mimeType: string; name: string }> = []

    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        incoming.push({ base64: reader.result as string, mimeType: file.type, name: file.name })
        loaded++
        if (loaded === files.length) {
          const updated = [...images, ...incoming]
          setImages(updated)
          runExtraction(updated)
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleExtract = () => runExtraction(images)

  // ── Result view (collapsed) ──────────────────────────────────────────────────
  if ((identity || brandVoice) && !expanded) {
    return (
      <div className="space-y-4">
        {/* Visual Identity card */}
        {identity && (
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
              <div className="flex flex-wrap gap-1.5">
                {identity.visual_mood?.map((m, i) => (
                  <Badge key={i} variant="outline" className="text-xs capitalize">{m}</Badge>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold mb-1">Look & Feel</p>
                <p className="text-xs text-muted-foreground leading-relaxed italic">"{identity.look_and_feel}"</p>
              </div>
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
              <div>
                <p className="text-xs font-semibold mb-1">Photography Style</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{identity.photography_style}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Brand Voice card */}
        {brandVoice && <BrandVoiceCard voice={brandVoice} onEdit={() => setExpanded(true)} />}
      </div>
    )
  }

  // ── Upload form ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Extract Brand Guidelines</CardTitle>
            </div>
            {(identity || brandVoice) && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(false)}>
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Upload existing ads or brand images. Gemini extracts visual identity (colours, photography, mood)
            and brand voice (personality, tone, messaging) — both saved automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.base64} alt={img.name} className="w-full aspect-square object-cover rounded-md border" />
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
              <><Sparkles className="h-4 w-4 mr-2" />{identity ? 'Re-extract Brand Guidelines' : 'Extract Brand Guidelines'}</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Brand Voice display card ───────────────────────────────────────────────────

function BrandVoiceCard({ voice, onEdit }: { voice: BrandVoiceProfile; onEdit: () => void }) {
  const [showFull, setShowFull] = useState(false)
  const [savingToLibrary, setSavingToLibrary] = useState(false)
  const [libraryName, setLibraryName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [savedToLibrary, setSavedToLibrary] = useState(false)

  const handleSaveToLibrary = async () => {
    if (!libraryName.trim()) { toast.error('Enter a name for this brand voice'); return }
    setSavingToLibrary(true)
    try {
      const res = await fetch('/api/brand-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: libraryName.trim(), profile: voice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSavedToLibrary(true)
      setShowSaveForm(false)
      setLibraryName('')
      toast.success(`"${libraryName.trim()}" saved to library`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save to library')
    } finally {
      setSavingToLibrary(false)
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Brand Voice</CardTitle>
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
              Saved
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowFull(v => !v)}>
              {showFull ? <><ChevronUp className="h-3 w-3 mr-1" />Less</> : <><ChevronDown className="h-3 w-3 mr-1" />Full</>}
            </Button>
            {!savedToLibrary && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setShowSaveForm(v => !v)}>
                <Save className="h-3 w-3 mr-1" />Save to Library
              </Button>
            )}
            {savedToLibrary && (
              <span className="text-xs text-green-600 flex items-center gap-1 px-2">
                <CheckCircle2 className="h-3 w-3" />Saved
              </span>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onEdit}>Edit</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Save to Library inline form */}
        {showSaveForm && (
          <div className="flex gap-2 items-center p-2.5 rounded-lg bg-muted/50 border">
            <Input
              placeholder="Name this brand voice (e.g. Sunday Natural)"
              value={libraryName}
              onChange={e => setLibraryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveToLibrary() }}
              className="h-7 text-xs flex-1"
              disabled={savingToLibrary}
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs px-3" onClick={handleSaveToLibrary} disabled={savingToLibrary || !libraryName.trim()}>
              {savingToLibrary ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowSaveForm(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Tone words */}
        <div className="flex flex-wrap gap-1.5">
          {voice.tone_words?.map((w, i) => (
            <Badge key={i} variant="outline" className="text-xs capitalize">{w}</Badge>
          ))}
        </div>

        {/* Personality */}
        {voice.personality && (
          <div>
            <p className="text-xs font-semibold mb-1">Personality</p>
            <p className="text-xs text-muted-foreground leading-relaxed italic">"{voice.personality}"</p>
          </div>
        )}

        {/* Brand Promise */}
        {voice.brand_promise && (
          <div>
            <p className="text-xs font-semibold mb-1">Brand Promise</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{voice.brand_promise}</p>
          </div>
        )}

        {showFull && (
          <>
            <Separator />

            {/* Language Style + Sentence Structure */}
            <div className="grid grid-cols-2 gap-3">
              {voice.language_style && (
                <div>
                  <p className="text-xs font-semibold mb-1">Language Style</p>
                  <p className="text-xs text-muted-foreground leading-tight">{voice.language_style}</p>
                </div>
              )}
              {voice.sentence_structure && (
                <div>
                  <p className="text-xs font-semibold mb-1">Sentence Structure</p>
                  <p className="text-xs text-muted-foreground leading-tight">{voice.sentence_structure}</p>
                </div>
              )}
            </div>

            {/* Vocabulary + Emotional Register */}
            <div className="grid grid-cols-2 gap-3">
              {voice.vocabulary_level && (
                <div>
                  <p className="text-xs font-semibold mb-1">Vocabulary</p>
                  <p className="text-xs text-muted-foreground leading-tight">{voice.vocabulary_level}</p>
                </div>
              )}
              {voice.emotional_register && (
                <div>
                  <p className="text-xs font-semibold mb-1">Emotional Register</p>
                  <p className="text-xs text-muted-foreground leading-tight">{voice.emotional_register}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Always Do / Never Do */}
            <div className="grid grid-cols-2 gap-3">
              {voice.dos && voice.dos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5 text-green-700 dark:text-green-400">✓ Always Do</p>
                  <ul className="space-y-1">
                    {voice.dos.map((d, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {voice.donts && voice.donts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5 text-red-600 dark:text-red-400">✗ Never Do</p>
                  <ul className="space-y-1">
                    {voice.donts.map((d, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Separator />

            {/* Messaging Pillars + Power Words */}
            <div className="grid grid-cols-2 gap-3">
              {voice.messaging_pillars && voice.messaging_pillars.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5">Messaging Pillars</p>
                  <div className="flex flex-wrap gap-1">
                    {voice.messaging_pillars.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {voice.power_words && voice.power_words.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-1.5">Power Words</p>
                  <div className="flex flex-wrap gap-1">
                    {voice.power_words.map((w, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{w}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Example Hooks */}
            {voice.example_hooks && voice.example_hooks.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5">Example Hooks</p>
                <ul className="space-y-1">
                  {voice.example_hooks.map((h, i) => (
                    <li key={i} className="text-xs text-muted-foreground italic">"{h}"</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Example CTAs */}
            {voice.example_ctas && voice.example_ctas.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5">Example CTAs</p>
                <div className="flex flex-wrap gap-1.5">
                  {voice.example_ctas.map((c, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* On-Brand Phrases */}
            {voice.sample_phrases && voice.sample_phrases.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5">On-Brand Phrases</p>
                <ul className="space-y-1">
                  {voice.sample_phrases.map((p, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• "{p}"</li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            {/* Audience */}
            {voice.audience_insight && (
              <div>
                <p className="text-xs font-semibold mb-1">Audience</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{voice.audience_insight}</p>
              </div>
            )}

            {/* What Makes This Voice Unique */}
            {voice.competitive_differentiation && (
              <div>
                <p className="text-xs font-semibold mb-1">What Makes This Voice Unique</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{voice.competitive_differentiation}</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
