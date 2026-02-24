'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, FolderOpen, Palette, Sparkles } from 'lucide-react'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back!</h1>
        <p className="text-muted-foreground mt-1">
          Let's create some amazing ad creatives with AI
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Categories
            </CardTitle>
            <CardDescription>Organize your ad campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">2</div>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Category
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Brand Assets
            </CardTitle>
            <CardDescription>Logos, fonts, and colors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">0</div>
              <Button size="sm" variant="outline">
                Upload Assets
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Generated
            </CardTitle>
            <CardDescription>Total creatives created</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>Follow these steps to create your first ad</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              1
            </div>
            <div>
              <h4 className="font-medium">Upload brand assets</h4>
              <p className="text-sm text-muted-foreground">
                Add your logos, fonts, and brand guidelines
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              2
            </div>
            <div>
              <h4 className="font-medium">Create a category</h4>
              <p className="text-sm text-muted-foreground">
                Organize your products by campaign or category
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              3
            </div>
            <div>
              <h4 className="font-medium">Upload product images</h4>
              <p className="text-sm text-muted-foreground">
                Add product photos to generate variations
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              4
            </div>
            <div>
              <h4 className="font-medium">Generate AI creatives</h4>
              <p className="text-sm text-muted-foreground">
                Let AI create angles, backgrounds, and complete ad compositions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
