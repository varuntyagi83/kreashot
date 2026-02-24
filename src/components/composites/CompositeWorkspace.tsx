'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CompositeGenerationForm } from './CompositeGenerationForm'
import { CompositePreviewGrid } from './CompositePreviewGrid'
import { CompositeGallery } from './CompositeGallery'

interface Category {
  id: string
  name: string
  slug: string
  look_and_feel: string | null
}

interface CompositeWorkspaceProps {
  category: Category
  format?: string
}

export interface GeneratedComposite {
  angledShotId: string
  angledShotName: string
  backgroundId: string
  backgroundName: string
  image_base64: string
  image_mime_type: string
  prompt_used: string
}

export function CompositeWorkspace({ category, format = '1:1' }: CompositeWorkspaceProps) {
  const [generatedComposites, setGeneratedComposites] = useState<
    GeneratedComposite[]
  >([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleCompositesGenerated = (composites: GeneratedComposite[]) => {
    setGeneratedComposites(composites)
    setIsGenerating(false)
  }

  const handleCompositeSaved = () => {
    // Refresh the gallery
    setRefreshKey((prev) => prev + 1)
  }

  const handleClearAll = () => {
    setGeneratedComposites([])
  }

  return (
    <div className="space-y-6">
      {/* Generation Form */}
      <CompositeGenerationForm
        category={category}
        format={format}
        onCompositesGenerated={handleCompositesGenerated}
        isGenerating={isGenerating}
        setIsGenerating={setIsGenerating}
      />

      {/* Preview Grid - Only show if we have generated composites */}
      {generatedComposites.length > 0 && (
        <CompositePreviewGrid
          composites={generatedComposites}
          categoryId={category.id}
          categorySlug={category.slug}
          format={format}
          onCompositeSaved={handleCompositeSaved}
          onClearAll={handleClearAll}
        />
      )}

      {/* Saved Composites Gallery */}
      <Tabs defaultValue="gallery" className="w-full">
        <TabsList>
          <TabsTrigger value="gallery">Saved Composites</TabsTrigger>
        </TabsList>
        <TabsContent value="gallery" className="mt-6">
          <CompositeGallery
            categoryId={category.id}
            format={format}
            refreshTrigger={refreshKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
