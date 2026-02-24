'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BackgroundGenerationForm } from './BackgroundGenerationForm'
import { BackgroundPreviewGrid } from './BackgroundPreviewGrid'
import { BackgroundGallery } from './BackgroundGallery'

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

interface BackgroundGenerationWorkspaceProps {
  category: Category
  format?: string // NEW: Format filter
}

export function BackgroundGenerationWorkspace({
  category,
  format = '1:1', // NEW: Default to 1:1
}: BackgroundGenerationWorkspaceProps) {
  const [generatedBackgrounds, setGeneratedBackgrounds] = useState<
    GeneratedBackground[]
  >([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleBackgroundsGenerated = (backgrounds: GeneratedBackground[]) => {
    setGeneratedBackgrounds(backgrounds)
  }

  const handleBackgroundSaved = () => {
    // Refresh the gallery
    setRefreshKey((prev) => prev + 1)
  }

  const handleClearPreviews = () => {
    setGeneratedBackgrounds([])
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Background Generation
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate AI backgrounds for {category.name} using Gemini AI
        </p>
      </div>

      {/* Generation Form */}
      <BackgroundGenerationForm
        category={category}
        format={format}
        onBackgroundsGenerated={handleBackgroundsGenerated}
        onGeneratingChange={setIsGenerating}
      />

      {/* Preview Grid */}
      {generatedBackgrounds.length > 0 && (
        <BackgroundPreviewGrid
          backgrounds={generatedBackgrounds}
          categoryId={category.id}
          categorySlug={category.slug}
          format={format}
          onBackgroundSaved={handleBackgroundSaved}
          onClearAll={handleClearPreviews}
        />
      )}

      {/* Saved Backgrounds */}
      <Tabs defaultValue="gallery" className="w-full">
        <TabsList>
          <TabsTrigger value="gallery">Saved Backgrounds</TabsTrigger>
        </TabsList>
        <TabsContent value="gallery" className="mt-6">
          <BackgroundGallery
            categoryId={category.id}
            format={format}
            refreshTrigger={refreshKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
