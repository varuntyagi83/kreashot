'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { FORMATS } from '@/lib/formats'

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

  // Keep selectedFormats in sync when parent format changes
  useEffect(() => {
    setSelectedFormats((prev) =>
      prev.includes(format) ? prev : [format, ...prev]
    )
  }, [format])

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

      toast.success(
        `Generated ${data.backgrounds.length} background${data.backgrounds.length > 1 ? 's' : ''}!`
      )
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
        {/* Look & Feel Input */}
        <div className="space-y-2">
          <Label htmlFor="look-and-feel">
            Look & Feel / Style Direction
            <span className="text-muted-foreground text-sm ml-2">(Recommended)</span>
          </Label>
          <Textarea
            id="look-and-feel"
            value={lookAndFeel}
            onChange={(e) => setLookAndFeel(e.target.value)}
            placeholder="Describe the visual style, mood, colors, and aesthetic for backgrounds (e.g., 'Fresh, organic, green aesthetic with natural lighting')"
            rows={3}
            maxLength={500}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {lookAndFeel.length}/500 characters
          </p>
        </div>

        {/* User Prompt Input */}
        <div className="space-y-2">
          <Label htmlFor="user-prompt">
            Background Description
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <Textarea
            id="user-prompt"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Describe the specific background you want (e.g., 'Hand in front of multiple shades of green mood boxes')"
            rows={3}
            maxLength={300}
            className="resize-none"
            required
          />
          <p className="text-xs text-muted-foreground">
            {userPrompt.length}/300 characters
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
          <Label>Formats to Generate</Label>
          <div className="grid grid-cols-2 gap-3">
            {Object.values(FORMATS).map((f) => (
              <div key={f.format} className="flex items-center gap-2">
                <Checkbox
                  id={`format-${f.format}`}
                  checked={selectedFormats.includes(f.format)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedFormats((prev) => [...prev, f.format])
                    } else {
                      setSelectedFormats((prev) =>
                        prev.filter((fmt) => fmt !== f.format)
                      )
                    }
                  }}
                  disabled={isGenerating}
                />
                <label
                  htmlFor={`format-${f.format}`}
                  className="text-sm cursor-pointer flex items-center gap-2"
                >
                  <span className="font-mono font-semibold">{f.format}</span>
                  <span className="text-xs text-muted-foreground">{f.description}</span>
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedFormats.length} format{selectedFormats.length !== 1 ? 's' : ''} selected
            &middot; {totalGenerations} total generation{totalGenerations !== 1 ? 's' : ''}
            {totalGenerations > 20 && (
              <span className="text-red-500 ml-1">(max 20)</span>
            )}
          </p>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !userPrompt.trim() || selectedFormats.length === 0 || totalGenerations > 20}
          className="w-full"
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
