'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

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

  const handleGenerate = async () => {
    if (!userPrompt.trim()) {
      toast.error('Please describe the background you want')
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
            format, // NEW: Include format in request
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
            max={4}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Generate multiple variations to choose from. Each uses AI credits.
          </p>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !userPrompt.trim()}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating {count} Background{count > 1 ? 's' : ''}...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate {count} Background{count > 1 ? 's' : ''}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
