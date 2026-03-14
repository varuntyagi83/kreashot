'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookOpen, Layout } from 'lucide-react'
import { GuidelineUploadForm } from '@/components/templates/GuidelineUploadForm'
import { GuidelinesList } from '@/components/templates/GuidelinesList'
import { TemplateWorkspace } from '@/components/templates/TemplateWorkspace'

interface StylesWorkspaceProps {
  categoryId: string
  format?: string
}

export function StylesWorkspace({ categoryId, format = '1:1' }: StylesWorkspaceProps) {
  const [guidelinesKey, setGuidelinesKey] = useState(0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Styles</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage brand guidelines and canvas templates for this category.
        </p>
      </div>

      <Tabs defaultValue="guidelines">
        <TabsList className="h-9 bg-muted/60 rounded-lg">
          <TabsTrigger
            value="guidelines"
            className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm flex items-center gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Guidelines
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="rounded-md text-sm data-[state=active]:bg-white data-[state=active]:text-[#7C5DFA] data-[state=active]:shadow-sm flex items-center gap-1.5"
          >
            <Layout className="h-3.5 w-3.5" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guidelines" className="mt-6 space-y-6">
          <GuidelineUploadForm
            categoryId={categoryId}
            onUploadComplete={() => setGuidelinesKey(k => k + 1)}
          />
          <GuidelinesList key={guidelinesKey} categoryId={categoryId} />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <TemplateWorkspace categoryId={categoryId} format={format} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
