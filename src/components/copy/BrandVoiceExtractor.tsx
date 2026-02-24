'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Mic2,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  MessageSquare,
  FileText,
  Loader2,
  X,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import type { BrandVoiceProfile } from '@/lib/ai/brand-voice'

interface BrandVoiceExtractorProps {
  categoryId: string
  lookAndFeel?: string
  initialProfile?: BrandVoiceProfile | null
  onProfileChange?: (profile: BrandVoiceProfile | null) => void
}

// ── Q&A questions ─────────────────────────────────────────────────────────────

const QA_QUESTIONS = [
  {
    id: 'personality',
    question: 'Describe your brand as if it were a person — what are its 3–5 personality traits?',
    placeholder: 'e.g., Confident, warm, science-backed, slightly playful, no-nonsense',
  },
  {
    id: 'audience',
    question: 'Who is your ideal customer and what do they care about most?',
    placeholder: 'e.g., Health-conscious adults 25–45 who want simple, effective solutions without the fluff',
  },
  {
    id: 'feeling',
    question: 'What feeling should someone have after reading your copy?',
    placeholder: 'e.g., Motivated, reassured, excited, like they just got great advice from a friend',
  },
  {
    id: 'reference',
    question: 'What brands or voices does yours sound like? (e.g., "like Apple but warmer")',
    placeholder: "e.g., Like Nike's confidence but softer — or like Glossier: approachable and direct",
  },
  {
    id: 'never',
    question: 'What should your brand NEVER sound like or say?',
    placeholder: 'e.g., Never fear-monger, no jargon, never overly corporate or cold, no clickbait',
  },
  {
    id: 'sample',
    question: 'Paste 1–2 examples of copy you love (yours or any brand)',
    placeholder: 'e.g., "Just do it." / "Because you\'re worth it." — or paste actual ads you admire',
  },
]

// ── Tone colour map ───────────────────────────────────────────────────────────

const TONE_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-green-100 text-green-800',
  'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',
  'bg-yellow-100 text-yellow-800',
]

// ── Component ─────────────────────────────────────────────────────────────────

export function BrandVoiceExtractor({
  categoryId,
  lookAndFeel,
  initialProfile,
  onProfileChange,
}: BrandVoiceExtractorProps) {
  const [profile, setProfile] = useState<BrandVoiceProfile | null>(initialProfile ?? null)
  const [expanded, setExpanded] = useState(!initialProfile)
  const [extracting, setExtracting] = useState(false)
  const [activeTab, setActiveTab] = useState<'qa' | 'text' | 'images'>('qa')

  // Q&A state
  const [qaAnswers, setQaAnswers] = useState<Record<string, string>>({})

  // Text samples state
  const [textSamples, setTextSamples] = useState<string[]>([''])

  // Image state
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ base64: string; mimeType: string; name: string }>
  >([])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    setExtracting(true)
    try {
      let body: any = { method: activeTab, lookAndFeel }

      if (activeTab === 'qa') {
        const answers = QA_QUESTIONS.map((q) => ({
          question: q.question,
          answer: qaAnswers[q.id] || '',
        }))
        body.answers = answers
      } else if (activeTab === 'text') {
        body.samples = textSamples.filter((s) => s.trim())
      } else if (activeTab === 'images') {
        body.images = uploadedImages.map(({ base64, mimeType }) => ({ base64, mimeType }))
      }

      const response = await fetch(`/api/categories/${categoryId}/brand-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to extract brand voice')

      setProfile(data.brand_voice)
      onProfileChange?.(data.brand_voice)
      setExpanded(false)
      toast.success('Brand voice profile extracted and saved!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to extract brand voice')
    } finally {
      setExtracting(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('Clear the brand voice profile? This cannot be undone.')) return
    try {
      await fetch(`/api/categories/${categoryId}/brand-voice`, { method: 'DELETE' })
      setProfile(null)
      onProfileChange?.(null)
      setExpanded(true)
      toast.success('Brand voice profile cleared')
    } catch {
      toast.error('Failed to clear profile')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (uploadedImages.length + files.length > 5) {
      toast.error('Maximum 5 images')
      return
    }
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setUploadedImages((prev) => [
          ...prev,
          { base64: reader.result as string, mimeType: file.type, name: file.name },
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const canExtract = () => {
    if (activeTab === 'qa') return Object.values(qaAnswers).some((a) => a.trim())
    if (activeTab === 'text') return textSamples.some((s) => s.trim())
    if (activeTab === 'images') return uploadedImages.length > 0
    return false
  }

  const methodLabel = (m: string) => ({ text: 'Text Samples', qa: 'Q&A', images: 'Images' }[m] || m)

  // ── Profile summary card ───────────────────────────────────────────────────

  if (profile && !expanded) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Brand Voice</CardTitle>
              <Badge variant="secondary" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                Active
              </Badge>
              <span className="text-xs text-muted-foreground">
                via {methodLabel(profile.extracted_from)}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setExpanded(true)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive"
                onClick={handleClear}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">

          {/* Tone words */}
          <div className="flex flex-wrap gap-1.5">
            {profile.tone_words.map((word, i) => (
              <Badge key={word} className={`text-xs ${TONE_COLORS[i % TONE_COLORS.length]}`}>
                {word}
              </Badge>
            ))}
          </div>

          {/* Personality */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">Personality</p>
            <p className="text-xs text-muted-foreground italic leading-relaxed">"{profile.personality}"</p>
          </div>

          {/* Brand promise */}
          {profile.brand_promise && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Brand Promise</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{profile.brand_promise}</p>
            </div>
          )}

          {/* Language style */}
          {profile.language_style && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Language Style</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{profile.language_style}</p>
            </div>
          )}

          {/* Sentence structure + Vocabulary level */}
          <div className="grid grid-cols-2 gap-3">
            {profile.sentence_structure && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Sentence Structure</p>
                <p className="text-xs text-muted-foreground leading-tight">{profile.sentence_structure}</p>
              </div>
            )}
            {profile.vocabulary_level && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Vocabulary</p>
                <p className="text-xs text-muted-foreground leading-tight">{profile.vocabulary_level}</p>
              </div>
            )}
          </div>

          {/* Emotional register */}
          {profile.emotional_register && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Emotional Register</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{profile.emotional_register}</p>
            </div>
          )}

          {/* Dos + Donts */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold text-green-700 mb-1.5">✓ Always Do</p>
              {profile.dos.map((d, i) => (
                <p key={i} className="text-muted-foreground leading-snug mb-0.5">• {d}</p>
              ))}
            </div>
            <div>
              <p className="font-semibold text-red-600 mb-1.5">✗ Never Do</p>
              {profile.donts.map((d, i) => (
                <p key={i} className="text-muted-foreground leading-snug mb-0.5">• {d}</p>
              ))}
            </div>
          </div>

          {/* Messaging pillars */}
          {profile.messaging_pillars?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Messaging Pillars</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.messaging_pillars.map((pillar, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal">
                    {pillar}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Power words */}
          {profile.power_words?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Power Words</p>
              <div className="flex flex-wrap gap-1">
                {profile.power_words.map((word, i) => (
                  <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Example hooks */}
          {profile.example_hooks?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Example Hooks</p>
              {profile.example_hooks.map((hook, i) => (
                <p key={i} className="text-xs text-muted-foreground italic leading-snug mb-1">
                  "{hook}"
                </p>
              ))}
            </div>
          )}

          {/* Example CTAs */}
          {profile.example_ctas?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Example CTAs</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.example_ctas.map((cta, i) => (
                  <Badge key={i} className="text-xs bg-primary/10 text-primary border-primary/20">
                    {cta}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* On-brand sample phrases */}
          {profile.sample_phrases?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">On-Brand Phrases</p>
              {profile.sample_phrases.map((phrase, i) => (
                <p key={i} className="text-xs text-muted-foreground leading-snug mb-0.5">
                  • "{phrase}"
                </p>
              ))}
            </div>
          )}

          {/* Audience insight */}
          {profile.audience_insight && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Audience</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{profile.audience_insight}</p>
            </div>
          )}

          {/* Competitive differentiation */}
          {profile.competitive_differentiation && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">What Makes This Voice Unique</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{profile.competitive_differentiation}</p>
            </div>
          )}

        </CardContent>
      </Card>
    )
  }

  // ── Extractor form ─────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic2 className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Extract Brand Voice</CardTitle>
          </div>
          {profile && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The AI analyses your inputs and builds a brand voice profile that guides every piece of copy generated.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="qa" className="text-xs">
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Answer Questions
            </TabsTrigger>
            <TabsTrigger value="text" className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Paste Text
            </TabsTrigger>
            <TabsTrigger value="images" className="text-xs">
              <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
              Upload Ads
            </TabsTrigger>
          </TabsList>

          {/* ── Q&A tab ─────────────────────────────────────────────────── */}
          <TabsContent value="qa" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Answer as many questions as you like — the more detail, the sharper the profile.
            </p>
            {QA_QUESTIONS.map((q) => (
              <div key={q.id} className="space-y-1.5">
                <Label className="text-xs font-medium">{q.question}</Label>
                <Textarea
                  placeholder={q.placeholder}
                  value={qaAnswers[q.id] || ''}
                  onChange={(e) =>
                    setQaAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                  rows={2}
                  className="text-sm resize-none"
                  disabled={extracting}
                />
              </div>
            ))}
          </TabsContent>

          {/* ── Text samples tab ─────────────────────────────────────────── */}
          <TabsContent value="text" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Paste existing copy — social posts, emails, website copy, ads — and the AI will extract
              your voice from what you've already written.
            </p>
            {textSamples.map((sample, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Sample {idx + 1}</Label>
                  {textSamples.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        setTextSamples((prev) => prev.filter((_, i) => i !== idx))
                      }
                      disabled={extracting}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <Textarea
                  placeholder="Paste a piece of copy here..."
                  value={sample}
                  onChange={(e) =>
                    setTextSamples((prev) =>
                      prev.map((s, i) => (i === idx ? e.target.value : s))
                    )
                  }
                  rows={3}
                  className="text-sm"
                  disabled={extracting}
                />
              </div>
            ))}
            {textSamples.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={() => setTextSamples((prev) => [...prev, ''])}
                disabled={extracting}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add another sample
              </Button>
            )}
          </TabsContent>

          {/* ── Images tab ───────────────────────────────────────────────── */}
          <TabsContent value="images" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              Upload existing ads or branded visuals. Gemini analyses the visual language, any
              visible copy, emotional tone, and personality they project.
            </p>

            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {uploadedImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.base64}
                      alt={img.name}
                      className="w-full aspect-square object-cover rounded-md border"
                    />
                    <button
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() =>
                        setUploadedImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-xs text-muted-foreground truncate mt-1">{img.name}</p>
                  </div>
                ))}
              </div>
            )}

            {uploadedImages.length < 5 && (
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/30 transition-colors">
                <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Click to upload ads or brand images</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, WEBP — max 5 images
                </p>
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
          </TabsContent>
        </Tabs>

        {/* Extract button */}
        <Button
          onClick={handleExtract}
          disabled={extracting || !canExtract()}
          className="w-full"
        >
          {extracting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting brand voice...</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Extract Brand Voice</>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
