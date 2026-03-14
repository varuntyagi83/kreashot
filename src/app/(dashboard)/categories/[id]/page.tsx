'use client'

import { use, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Edit2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ProductList } from '@/components/products/ProductList'
import { AngledShotsList } from '@/components/angled-shots/AngledShotsList'
import { BackgroundGenerationWorkspace } from '@/components/backgrounds/BackgroundGenerationWorkspace'
import { CompositeWorkspace } from '@/components/composites/CompositeWorkspace'
import { CopyWorkspace } from '@/components/copy/CopyWorkspace'
import { TemplateWorkspace } from '@/components/templates/TemplateWorkspace'
import { FinalAssetsWorkspace } from '@/components/final-assets/FinalAssetsWorkspace'
import { AdExportWorkspace } from '@/components/ad-export/AdExportWorkspace'
import { CollageWorkspace } from '@/components/collage/CollageWorkspace'
import { FormatSelector } from '@/components/format-selector'
import { GuidelineUploadForm } from '@/components/templates/GuidelineUploadForm'
import { GuidelinesList } from '@/components/templates/GuidelinesList'
import type { BrandVoiceProfile } from '@/lib/ai/brand-voice'

interface CategoryDetailPageProps {
  params: Promise<{ id: string }>
}

interface Category {
  id: string
  name: string
  slug: string
  description: string
  look_and_feel: string | null
  brand_doc_name: string | null
  brand_voice: BrandVoiceProfile | null
  counts: {
    products: number
    angled_shots: number
    backgrounds: number
    composites: number
    copy_docs: number
    guidelines: number
    final_assets: number
  }
}

export default function CategoryDetailPage({ params }: CategoryDetailPageProps) {
  const resolvedParams = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [category, setCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState<string>('1:1')

  const activeTab = searchParams.get('tab') || 'products'

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const response = await fetch(
          `/api/categories/${resolvedParams.id}?format=${selectedFormat}`
        )
        const data = await response.json()

        if (response.ok) {
          setCategory(data.category)
        } else {
          toast.error(data.error || 'Failed to load category')
          router.push('/categories')
        }
      } catch (error) {
        toast.error('Failed to load category')
        router.push('/categories')
      } finally {
        setLoading(false)
      }
    }

    fetchCategory()
  }, [resolvedParams.id, router, selectedFormat])

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-7 w-48 bg-muted rounded mb-4" />
          <div className="h-10 w-full bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (!category) return null

  const totalAds = category.counts.final_assets

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/categories"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground truncate">{category.name}</h1>
          <p className="text-xs text-muted-foreground">@{category.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <FormatSelector
            selectedFormat={selectedFormat}
            onFormatChange={setSelectedFormat}
          />
          <button className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <Edit2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(tab) => router.push(`/categories/${resolvedParams.id}?tab=${tab}`)}
      >
        <TabsList className="h-9 bg-muted/60 rounded-lg mb-6">
          <TabsTrigger value="products" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Products
            {category.counts.products > 0 && (
              <span className="ml-1.5 text-xs bg-black/10 rounded-full px-1.5 py-0.5 leading-none">
                {category.counts.products}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scenes" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Scenes
            {category.counts.backgrounds > 0 && (
              <span className="ml-1.5 text-xs bg-black/10 rounded-full px-1.5 py-0.5 leading-none">
                {category.counts.backgrounds}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="styles" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Styles
            {category.counts.guidelines > 0 && (
              <span className="ml-1.5 text-xs bg-black/10 rounded-full px-1.5 py-0.5 leading-none">
                {category.counts.guidelines}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="photoshoots" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Photoshoots
            {category.counts.composites > 0 && (
              <span className="ml-1.5 text-xs bg-black/10 rounded-full px-1.5 py-0.5 leading-none">
                {category.counts.composites}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ad-copy" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Ad Copy
            {category.counts.copy_docs > 0 && (
              <span className="ml-1.5 text-xs bg-black/10 rounded-full px-1.5 py-0.5 leading-none">
                {category.counts.copy_docs}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ads" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Ads
            {totalAds > 0 && (
              <span className="ml-1.5 text-xs bg-black/10 rounded-full px-1.5 py-0.5 leading-none">
                {totalAds}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="collage" className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm">
            Collage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductList categoryId={category.id} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="scenes">
          <BackgroundGenerationWorkspace category={category} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="styles">
          <div className="space-y-6">
            <GuidelineUploadForm
              categoryId={category.id}
              onUploadComplete={() => window.location.reload()}
            />
            <GuidelinesList categoryId={category.id} />
            <TemplateWorkspace categoryId={category.id} format={selectedFormat} />
          </div>
        </TabsContent>

        <TabsContent value="photoshoots">
          <CompositeWorkspace category={category} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="ad-copy">
          <CopyWorkspace category={category} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="ads">
          <div className="space-y-8">
            <FinalAssetsWorkspace categoryId={category.id} format={selectedFormat} />
            <AdExportWorkspace categoryId={category.id} format={selectedFormat} />
          </div>
        </TabsContent>

        <TabsContent value="collage">
          <CollageWorkspace categoryId={category.id} format={selectedFormat} />
        </TabsContent>

      </Tabs>
    </div>
  )
}
