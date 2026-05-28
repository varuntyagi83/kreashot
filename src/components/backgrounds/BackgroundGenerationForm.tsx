'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Sparkles, ImageIcon, Check, Palette } from 'lucide-react'
import { toast } from 'sonner'
import { FORMATS } from '@/lib/formats'
import { ReferencePicker } from '@/components/ui/reference-picker'
import { driveImgSrc } from '@/lib/utils'
import posthog from 'posthog-js'

interface ColorWorld {
  label: string   // e.g. "World of Green"
  value: string   // e.g. "World of Green palette"
  colors: string  // e.g. "monochromatic variations of muted grayish-green..."
}

function parseColorWorlds(colorDescription: string | null): ColorWorld[] {
  if (!colorDescription) return []
  const worlds: ColorWorld[] = []
  const lines = colorDescription.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    // Match lines like "- World of Green palette: ..." or "- Collagen Category palette: ..."
    const match = line.match(/^-\s*(.+?)\s*palette:\s*(.+)$/i)
    if (match) {
      worlds.push({
        label: match[1].trim(),
        value: match[1].trim() + ' palette',
        colors: match[2].trim(),
      })
    }
  }
  return worlds
}

interface BrandAsset {
  id: string
  name: string
  asset_type: string
  storageUrl: string
  gdriveFileId: string | null
  metadata?: { file_type?: string }
}

interface Category {
  id: string
  name: string
  slug: string
  look_and_feel: string | null
}

interface GeneratedBackground {
  promptUsed: string
  imageData: string
  mimeType: string
  format: string
  generationTimeMs?: number
}

interface BackgroundGenerationFormProps {
  category: Category
  format?: string // NEW: Format to generate
  onBackgroundsGenerated: (backgrounds: GeneratedBackground[]) => void
  onGeneratingChange: (isGenerating: boolean) => void
}

export function BackgroundGenerationForm({
  category,
  format = '1:1', // NEW: Default to 1:1
  onBackgroundsGenerated,
  onGeneratingChange,
}: BackgroundGenerationFormProps) {
  const [lookAndFeel, setLookAndFeel] = useState(
    category.look_and_feel || ''
  )
  const [userPrompt, setUserPrompt] = useState('')
  const [count, setCount] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedFormats, setSelectedFormats] = useState<string[]>([format])
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [colorWorlds, setColorWorlds] = useState<ColorWorld[]>([])
  const [selectedColorWorld, setSelectedColorWorld] = useState<string>('all')

  // Keep selectedFormats in sync when parent format changes
  useEffect(() => {
    setSelectedFormats((prev) =>
      prev.includes(format) ? prev : [format, ...prev]
    )
  }, [format])

  // Fetch brand guidelines to get color worlds, and brand assets for style references
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [assetsRes, guidelinesRes] = await Promise.all([
          fetch('/api/brand-assets'),
          fetch('/api/brand-guidelines'),
        ])

        if (assetsRes.ok) {
          const data = await assetsRes.json()
          const imageAssets = (data.assets || []).filter((a: BrandAsset) => {
            const ft = a.metadata?.file_type || ''
            return ft.startsWith('image/')
          })
          setBrandAssets(imageAssets)
        }

        if (guidelinesRes.ok) {
          const data = await guidelinesRes.json()
          const allWorlds: ColorWorld[] = []
          for (const g of data.guidelines || []) {
            allWorlds.push(...parseColorWorlds(g.color_description))
          }
          setColorWorlds(allWorlds)
        }
      } catch {
        // silently fail — these are optional enhancements
      }
    }
    fetchData()
  }, [])

  const totalGenerations = count * selectedFormats.length

  const handleGenerate = async () => {
    if (!userPrompt.trim()) {
      toast.error('Please describe the background you want')
      return
    }

    if (selectedFormats.length === 0) {
      toast.error('Please select at least one format')
      return
    }

    if (totalGenerations > 20) {
      toast.error('Too many combinations. Reduce the count or number of formats (max 20 total).')
      return
    }

    if (!lookAndFeel.trim()) {
      toast.warning(
        'Adding a look & feel helps generate better backgrounds'
      )
    }

    if (!category?.id) {
      toast.error('Category not found. Please refresh the page and try again.')
      return
    }

    setIsGenerating(true)
    onGeneratingChange(true)

    try {
      const response = await fetch(
        `/api/categories/${category.id}/backgrounds/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userPrompt: userPrompt.trim(),
            lookAndFeel: lookAndFeel.trim() || 'Professional product photography',
            count,
            formats: selectedFormats,
            referenceAssetIds: selectedReferenceIds.length > 0 ? selectedReferenceIds : undefined,
            colorWorld: selectedColorWorld !== 'all' ? selectedColorWorld : undefined,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate backgrounds')
      }

      if (!data.backgrounds || data.backgrounds.length === 0) {
        throw new Error('No backgrounds were generated')
      }

      posthog.capture('backgrounds_generated', {
        count: data.backgrounds.length,
        formats: selectedFormats,
        total_combinations: totalGenerations,
        has_style_references: selectedReferenceIds.length > 0,
      })
      if (data.failedFormats?.length > 0) {
        toast.warning(
          `Generated ${data.backgrounds.length} background(s) but ${data.failedFormats.join(', ')} failed. Try generating those formats separately.`
        )
      } else {
        toast.success(
          `Generated ${data.backgrounds.length} background${data.backgrounds.length > 1 ? 's' : ''}!`
        )
      }
      onBackgroundsGenerated(data.backgrounds)
    } catch (error: any) {
      console.error('Error generating backgrounds:', error)
      toast.error(error.message || 'Failed to generate backgrounds')
    } finally {
      setIsGenerating(false)
      onGeneratingChange(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Generate Backgrounds
        </CardTitle>
        <CardDescription>
          Create AI-generated backgrounds using Gemini that match your category's aesthetic
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Look & Feel Input with @ reference support */}
        <div className="space-y-2">
          <Label htmlFor="look-and-feel">
            Look & Feel / Style Direction
            <span className="text-muted-foreground text-sm ml-2">(Recommended)</span>
          </Label>
          <ReferencePicker
            value={lookAndFeel}
            onChange={setLookAndFeel}
            placeholder="Describe the visual style, mood, colors, and aesthetic. Type @ to reference brand guidelines (e.g., '@SundayNatural World of Green')"
            rows={5}
            disabled={isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            Type <code className="bg-muted px-1 py-0.5 rounded">@</code> to reference your brand guidelines, brand assets, or products.
          </p>
          <p className="text-xs text-muted-foreground">
            {lookAndFeel.length}/2000 characters
          </p>
        </div>

        {/* Color World Selector */}
        {colorWorlds.length > 0 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Color Palette
            </Label>
            <Select
              value={selectedColorWorld}
              onValueChange={setSelectedColorWorld}
              disabled={isGenerating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select color palette" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brand colors</SelectItem>
                {colorWorlds.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                    <span className="text-muted-foreground ml-2 text-xs">({w.colors.substring(0, 50)}{w.colors.length > 50 ? '...' : ''})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only the selected palette's colors will guide the image generation
            </p>
          </div>
        )}

        {/* User Prompt Input with @ reference support */}
        <div className="space-y-2">
          <Label htmlFor="user-prompt">
            Background Description
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <ReferencePicker
            value={userPrompt}
            onChange={setUserPrompt}
            placeholder="Describe the background you want. Type @ to reference brand guidelines (e.g., 'World of Green with hand @SundayNatural')"
            rows={3}
            disabled={isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            Type <code className="bg-muted px-1 py-0.5 rounded">@</code> to reference your brand guidelines, brand assets, or products.
          </p>
        </div>

        {/* Count Selector */}
        <div className="space-y-2">
          <Label htmlFor="count">
            Number of Variations: {count}
          </Label>
          <Slider
            id="count"
            value={[count]}
            onValueChange={(value) => setCount(value[0])}
            min={1}
            max={5}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Generate multiple variations to choose from. Each uses AI credits.
          </p>
        </div>

        {/* Format Selection */}
        <div className="space-y-2">
          <Label className="text-xs">Formats to Generate</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.values(FORMATS).map((f) => {
              const isSelected = selectedFormats.includes(f.format)
              return (
                <button
                  key={f.format}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedFormats((prev) => prev.filter((fmt) => fmt !== f.format))
                    } else {
                      setSelectedFormats((prev) => [...prev, f.format])
                    }
                  }}
                  disabled={isGenerating}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors text-xs ${
                    isSelected
                      ? 'border-[#7C5DFA] bg-[#7C5DFA]/5 text-[#7C5DFA]'
                      : 'border-border hover:border-muted-foreground/50 text-foreground'
                  }`}
                >
                  <span className="font-mono font-semibold">{f.format}</span>
                  <span className="text-muted-foreground truncate">{f.platform}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedFormats.length} format{selectedFormats.length !== 1 ? 's' : ''} selected
            &middot; {totalGenerations} total generation{totalGenerations !== 1 ? 's' : ''}
            {totalGenerations > 20 && (
              <span className="text-red-500 ml-1">(max 20)</span>
            )}
          </p>
        </div>

        {/* Style Reference Images */}
        {brandAssets.length > 0 && (
          <div className="space-y-2">
            <Label>
              Style References
              <span className="text-muted-foreground text-sm ml-2">(Optional)</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Select brand assets to guide Gemini's colors, mood, and aesthetic.
            </p>
            <div className="flex flex-wrap gap-2">
              {brandAssets.map((asset) => {
                const isSelected = selectedReferenceIds.includes(asset.id)
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() =>
                      setSelectedReferenceIds((prev) =>
                        isSelected
                          ? prev.filter((id) => id !== asset.id)
                          : prev.length < 4
                            ? [...prev, asset.id]
                            : (toast.info('Max 4 style references'), prev)
                      )
                    }
                    disabled={isGenerating}
                    className={`relative w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    title={asset.name}
                  >
                    <img
                      src={driveImgSrc(asset.storageUrl, asset.gdriveFileId)}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="h-5 w-5 text-primary-foreground drop-shadow" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            {selectedReferenceIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedReferenceIds.length} reference{selectedReferenceIds.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !userPrompt.trim() || selectedFormats.length === 0 || totalGenerations > 20}
          className="w-full bg-[#7C5DFA] hover:bg-[#6A4FD8] text-white"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating {totalGenerations} Background{totalGenerations > 1 ? 's' : ''}...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate {count} Background{count > 1 ? 's' : ''} in {selectedFormats.length} Format{selectedFormats.length > 1 ? 's' : ''}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
