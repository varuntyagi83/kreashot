'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { GeneratedComposite } from './CompositeWorkspace'

interface Category {
  id: string
  name: string
  slug: string
  look_and_feel: string | null
}

interface AngledShot {
  id: string
  name: string
  angle_name: string
  storage_url: string
}

interface Background {
  id: string
  name: string
  storage_url: string
}

interface CompositeGenerationFormProps {
  category: Category
  format: string
  onCompositesGenerated: (composites: GeneratedComposite[]) => void
  isGenerating: boolean
  setIsGenerating: (generating: boolean) => void
}

export function CompositeGenerationForm({
  category,
  format,
  onCompositesGenerated,
  isGenerating,
  setIsGenerating,
}: CompositeGenerationFormProps) {
  const [mode, setMode] = useState<'all_combinations' | 'selected'>(
    'selected'
  )
  const [userPrompt, setUserPrompt] = useState('')

  // For selected mode
  const [angledShots, setAngledShots] = useState<AngledShot[]>([])
  const [backgrounds, setBackgrounds] = useState<Background[]>([])
  const [selectedShots, setSelectedShots] = useState<string[]>([])
  const [selectedBackgrounds, setSelectedBackgrounds] = useState<string[]>([])

  const [loadingAssets, setLoadingAssets] = useState(true)

  // Fetch available angled shots and backgrounds
  useEffect(() => {
    const fetchAssets = async () => {
      setLoadingAssets(true)
      try {
        // Fetch angled shots filtered by format
        const shotsResponse = await fetch(
          `/api/categories/${category.id}/angled-shots?format=${format}`
        )
        if (shotsResponse.ok) {
          const shotsData = await shotsResponse.json()
          setAngledShots(shotsData.angledShots || [])
        }

        // Fetch backgrounds filtered by format
        const backgroundsResponse = await fetch(
          `/api/categories/${category.id}/backgrounds?format=${format}`
        )
        if (backgroundsResponse.ok) {
          const backgroundsData = await backgroundsResponse.json()
          setBackgrounds(backgroundsData.backgrounds || [])
        }
      } catch (error) {
        console.error('Error fetching assets:', error)
        toast.error('Failed to load assets')
      } finally {
        setLoadingAssets(false)
      }
    }

    fetchAssets()
  }, [category.id, format])

  const handleGenerate = async () => {
    // Validation
    if (mode === 'selected' && (selectedShots.length === 0 || selectedBackgrounds.length === 0)) {
      toast.error('Please select at least one angled shot and one background')
      return
    }

    const totalCombinations =
      mode === 'all_combinations'
        ? angledShots.length * backgrounds.length
        : selectedShots.length * selectedBackgrounds.length

    if (totalCombinations === 0) {
      toast.error('No combinations to generate')
      return
    }

    // Warn if too many
    if (totalCombinations > 20) {
      const confirmed = confirm(
        `This will generate ${totalCombinations} composites. This may take several minutes. Continue?`
      )
      if (!confirmed) return
    }

    setIsGenerating(true)

    try {
      const requestBody =
        mode === 'all_combinations'
          ? {
              mode: 'all_combinations',
              userPrompt: userPrompt.trim() || undefined,
              format,
            }
          : {
              mode: 'selected',
              pairs: selectedShots.flatMap((shotId) =>
                selectedBackgrounds.map((bgId) => ({
                  angledShotId: shotId,
                  backgroundId: bgId,
                }))
              ),
              userPrompt: userPrompt.trim() || undefined,
              format,
            }

      const response = await fetch(
        `/api/categories/${category.id}/composites/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate composites')
      }

      toast.success(`Generated ${data.results.length} composites!`)
      onCompositesGenerated(data.results)
    } catch (error: any) {
      console.error('Error generating composites:', error)
      toast.error(error.message || 'Failed to generate composites')
      setIsGenerating(false)
    }
  }

  const totalCombinations =
    mode === 'all_combinations'
      ? angledShots.length * backgrounds.length
      : selectedShots.length * selectedBackgrounds.length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Generate Composites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <div className="space-y-2">
          <Label htmlFor="mode">Generation Mode</Label>
          <Select
            value={mode}
            onValueChange={(value: any) => setMode(value)}
            disabled={isGenerating}
          >
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selected">
                Select Specific Pairs (Recommended)
              </SelectItem>
              <SelectItem value="all_combinations">
                All Combinations
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User Prompt (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="user-prompt">
            Placement Instructions (Optional)
          </Label>
          <Textarea
            id="user-prompt"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="e.g., Place the product in the model's hands, Position the bottle on the left side of the background"
            maxLength={200}
            rows={2}
            disabled={isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            {userPrompt.length}/200 characters
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            ⚠️ Composites are text-free visuals — headlines, hooks, and CTAs are added in the <strong>Final Ad</strong> stage.
          </p>
        </div>

        {loadingAssets ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading available assets...
          </div>
        ) : (
          <>
            {/* Asset Selection - Only show for selected mode */}
            {mode === 'selected' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Angled Shots Selection */}
                <div className="space-y-3">
                  <Label>Select Angled Shots ({selectedShots.length})</Label>
                  <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                    {angledShots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No angled shots available
                      </p>
                    ) : (
                      angledShots.map((shot) => (
                        <div key={shot.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`shot-${shot.id}`}
                            checked={selectedShots.includes(shot.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedShots([...selectedShots, shot.id])
                              } else {
                                setSelectedShots(
                                  selectedShots.filter((id) => id !== shot.id)
                                )
                              }
                            }}
                            disabled={isGenerating}
                          />
                          <label
                            htmlFor={`shot-${shot.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <div className="font-medium">{shot.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {shot.angle_name}
                            </div>
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Backgrounds Selection */}
                <div className="space-y-3">
                  <Label>
                    Select Backgrounds ({selectedBackgrounds.length})
                  </Label>
                  <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                    {backgrounds.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No backgrounds available
                      </p>
                    ) : (
                      backgrounds.map((bg) => (
                        <div key={bg.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`bg-${bg.id}`}
                            checked={selectedBackgrounds.includes(bg.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBackgrounds([
                                  ...selectedBackgrounds,
                                  bg.id,
                                ])
                              } else {
                                setSelectedBackgrounds(
                                  selectedBackgrounds.filter(
                                    (id) => id !== bg.id
                                  )
                                )
                              }
                            }}
                            disabled={isGenerating}
                          />
                          <label
                            htmlFor={`bg-${bg.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {bg.name}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Combination Count */}
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center gap-2">
                {totalCombinations > 20 && (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
                <p className="text-sm font-medium">
                  {mode === 'all_combinations' ? (
                    <>
                      This will generate{' '}
                      <span className="font-bold">
                        {angledShots.length} shots × {backgrounds.length}{' '}
                        backgrounds = {totalCombinations} composites
                      </span>
                    </>
                  ) : (
                    <>
                      Selected:{' '}
                      <span className="font-bold">
                        {selectedShots.length} shots × {selectedBackgrounds.length}{' '}
                        backgrounds = {totalCombinations} composites
                      </span>
                    </>
                  )}
                </p>
              </div>
              {totalCombinations > 20 && (
                <p className="text-xs text-muted-foreground mt-2">
                  ⚠️ Large batches may take several minutes to complete
                </p>
              )}
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={
                isGenerating ||
                totalCombinations === 0 ||
                totalCombinations > 50
              }
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating {totalCombinations} Composites...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate {totalCombinations} Composites
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
