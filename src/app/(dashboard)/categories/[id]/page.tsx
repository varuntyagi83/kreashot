'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Edit } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ProductList } from '@/components/products/ProductList'
import { AngledShotsList } from '@/components/angled-shots/AngledShotsList'
import { BackgroundGenerationWorkspace } from '@/components/backgrounds/BackgroundGenerationWorkspace'
import { CompositeWorkspace } from '@/components/composites/CompositeWorkspace'
import { CopyWorkspace } from '@/components/copy/CopyWorkspace'
import { TemplateWorkspace } from '@/components/templates/TemplateWorkspace'
import { FinalAssetsWorkspace } from '@/components/final-assets/FinalAssetsWorkspace'
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
  const [category, setCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFormat, setSelectedFormat] = useState<string>('1:1') // NEW: Format selection state

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const response = await fetch(`/api/categories/${resolvedParams.id}`)
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
  }, [resolvedParams.id, router])

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-muted rounded mb-6" />
          <div className="h-12 w-full bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (!category) return null

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/categories">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              <code className="bg-muted px-1 py-0.5 rounded">@{category.slug}</code>
            </p>
          </div>
          <Button variant="outline" size="icon">
            <Edit className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-muted-foreground">{category.description}</p>
        {category.look_and_feel && (
          <div className="mt-2 p-3 bg-muted/50 rounded-md">
            <p className="text-sm">
              <span className="font-medium">Look & Feel:</span> {category.look_and_feel}
            </p>
          </div>
        )}
      </div>

      {/* Format Selector - NEW */}
      <div className="mb-6 p-4 bg-muted/30 rounded-lg border">
        <FormatSelector
          selectedFormat={selectedFormat}
          onFormatChange={setSelectedFormat}
        />
      </div>

      <Tabs defaultValue="assets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assets">
            Assets
            {category.counts.products > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.products}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="angled-shots">
            Angled Shots
            {category.counts.angled_shots > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.angled_shots}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="guidelines">
            Guidelines
            {category.counts.guidelines > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.guidelines}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="backgrounds">
            Backgrounds
            {category.counts.backgrounds > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.backgrounds}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="copy">
            Copy
            {category.counts.copy_docs > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.copy_docs}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="composites">
            Composites
            {category.counts.composites > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.composites}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="final-assets">
            Final Assets
            {category.counts.final_assets > 0 && (
              <span className="ml-2 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {category.counts.final_assets}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-4">
          <ProductList categoryId={category.id} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="angled-shots" className="space-y-4">
          <AngledShotsList categoryId={category.id} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="guidelines" className="space-y-4">
          <GuidelineUploadForm
            categoryId={category.id}
            onUploadComplete={() => {
              // Refresh guidelines list
              window.location.reload()
            }}
          />
          <GuidelinesList categoryId={category.id} />
        </TabsContent>

        <TabsContent value="backgrounds" className="space-y-4">
          <BackgroundGenerationWorkspace category={category} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <TemplateWorkspace categoryId={category.id} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="copy" className="space-y-4">
          <CopyWorkspace category={category} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="composites" className="space-y-4">
          <CompositeWorkspace category={category} format={selectedFormat} />
        </TabsContent>

        <TabsContent value="final-assets" className="space-y-4">
          <FinalAssetsWorkspace categoryId={category.id} format={selectedFormat} />
        </TabsContent>


      </Tabs>
    </div>
  )
}
