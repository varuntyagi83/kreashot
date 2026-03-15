'use client'

import { useState } from 'react'
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
  format: string
  generationTimeMs?: number
}

interface BackgroundGenerationWorkspaceProps {
  category: Category
  format?: string
}

export function BackgroundGenerationWorkspace({
  category,
  format = '1:1',
}: BackgroundGenerationWorkspaceProps) {
  const [generatedBackgrounds, setGeneratedBackgrounds] = useState<GeneratedBackground[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="flex gap-6">
      {/* Left panel: Generation form */}
      <div className="w-80 shrink-0">
        <div className="sticky top-4">
          <BackgroundGenerationForm
            category={category}
            format={format}
            onBackgroundsGenerated={setGeneratedBackgrounds}
            onGeneratingChange={() => {}}
          />
        </div>
      </div>

      {/* Right panel: preview + gallery */}
      <div className="flex-1 min-w-0 space-y-6">
        {generatedBackgrounds.length > 0 && (
          <BackgroundPreviewGrid
            backgrounds={generatedBackgrounds}
            categoryId={category.id}
            categorySlug={category.slug}
            format={format}
            onBackgroundSaved={() => setRefreshKey((k) => k + 1)}
            onClearAll={() => setGeneratedBackgrounds([])}
          />
        )}

        <div>
          <h2 className="text-lg font-semibold mb-4">Scenes Library</h2>
          <BackgroundGallery
            categoryId={category.id}
            refreshTrigger={refreshKey}
          />
        </div>
      </div>
    </div>
  )
}
