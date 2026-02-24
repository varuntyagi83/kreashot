'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductImageUpload } from './ProductImageUpload'
import { ProductImageGallery } from './ProductImageGallery'

interface ManageProductImagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categoryId: string
  productId: string
  productName: string
  format: string // Aspect ratio (1:1, 4:5, 9:16, 16:9)
}

export function ManageProductImagesDialog({
  open,
  onOpenChange,
  categoryId,
  productId,
  productName,
  format,
}: ManageProductImagesDialogProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleUploadComplete = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Images - {productName}</DialogTitle>
          <DialogDescription>
            Upload and manage product images. The first uploaded image will be set as
            primary by default.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="gallery" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="gallery" className="mt-6">
            <ProductImageGallery
              categoryId={categoryId}
              productId={productId}
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          <TabsContent value="upload" className="mt-6">
            <ProductImageUpload
              categoryId={categoryId}
              productId={productId}
              format={format}
              onUploadComplete={handleUploadComplete}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
