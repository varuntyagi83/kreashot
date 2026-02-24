'use client'

import { useState } from 'react'
import { CopyGenerationForm } from './CopyGenerationForm'
import { CopyPreviewGrid } from './CopyPreviewGrid'
import { CopyGallery } from './CopyGallery'
import { BrandVoiceExtractor } from './BrandVoiceExtractor'
import type { BrandVoiceProfile } from '@/lib/ai/brand-voice'

interface GeneratedCopy {
  copy_type?: string
  tone?: string
  prompt_used: string
  generated_text: string
}

interface CopyWorkspaceProps {
  category: {
    id: string
    name: string
    slug: string
    look_and_feel: string | null
    brand_doc_name?: string | null
    brand_voice?: BrandVoiceProfile | null
  }
  format: string
}

export function CopyWorkspace({ category, format }: CopyWorkspaceProps) {
  const [generatedCopies, setGeneratedCopies] = useState<GeneratedCopy[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [currentBrief, setCurrentBrief] = useState('')
  const [currentCopyType, setCurrentCopyType] = useState('kit')
  const [brandVoice, setBrandVoice] = useState<BrandVoiceProfile | null>(
    category.brand_voice ?? null
  )

  const handleGenerate = (copies: GeneratedCopy[], brief: string, copyType: string) => {
    setGeneratedCopies(copies)
    setCurrentBrief(brief)
    setCurrentCopyType(copyType)
  }

  const handleSaveComplete = () => {
    setGeneratedCopies([])
    setCurrentBrief('')
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="space-y-6">
      {/* Brand Voice Extractor — shown above the generation form */}
      <BrandVoiceExtractor
        categoryId={category.id}
        lookAndFeel={category.look_and_feel || undefined}
        initialProfile={brandVoice}
        onProfileChange={setBrandVoice}
      />

      <CopyGenerationForm
        categoryId={category.id}
        lookAndFeel={category.look_and_feel || ''}
        brandDocName={category.brand_doc_name}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        setIsGenerating={setIsGenerating}
      />

      {generatedCopies.length > 0 && (
        <CopyPreviewGrid
          categoryId={category.id}
          generatedCopies={generatedCopies}
          brief={currentBrief}
          copyType={currentCopyType}
          onSaveComplete={handleSaveComplete}
        />
      )}

      <CopyGallery categoryId={category.id} refreshTrigger={refreshKey} />
    </div>
  )
}
