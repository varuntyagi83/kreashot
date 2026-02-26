'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileText, Upload, Trash2, Loader2, Star } from 'lucide-react'
import { toast } from 'sonner'

interface Guideline {
  id: string
  name: string
  source_file_name: string | null
  text_preview: string
  text_length: number
  is_default: boolean
  created_at: string
}

export function BrandGuidelinesManager() {
  const [guidelines, setGuidelines] = useState<Guideline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchGuidelines = async () => {
    try {
      const res = await fetch('/api/brand-guidelines')
      if (!res.ok) return
      const data = await res.json()
      setGuidelines(data.guidelines || [])
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchGuidelines()
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10MB')
      return
    }

    setSelectedFile(file)
    // Auto-fill name from filename (without extension)
    if (!uploadName) {
      setUploadName(file.name.replace(/\.pdf$/i, ''))
    }
    setShowUploadForm(true)
  }

  const handleUpload = async () => {
    if (!selectedFile || !uploadName.trim()) {
      toast.error('Please provide a name and select a PDF file')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('name', uploadName.trim())

      const res = await fetch('/api/brand-guidelines', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload guidelines')
      }

      toast.success(`Guidelines "${data.guideline.name}" saved (${data.guideline.text_length} chars extracted)`)
      setShowUploadForm(false)
      setUploadName('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchGuidelines()
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload guidelines')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/brand-guidelines/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      toast.success(`"${name}" deleted`)
      setGuidelines((prev) => prev.filter((g) => g.id !== id))
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete guideline')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Brand Guidelines Library
        </CardTitle>
        <CardDescription>
          Upload brand guideline PDFs. Type <code className="text-xs bg-muted px-1 py-0.5 rounded">@</code> in the prompt below to reference them when generating backgrounds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Section */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!showUploadForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload PDF
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="guideline-name" className="text-xs">Guideline Name</Label>
                <Input
                  id="guideline-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g., Sunday Natural Design Guide"
                  className="h-9"
                />
              </div>
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={isUploading || !uploadName.trim()}
                className="h-9"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowUploadForm(false)
                  setUploadName('')
                  setSelectedFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="h-9"
              >
                Cancel
              </Button>
            </div>
          )}

          {selectedFile && showUploadForm && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
            </p>
          )}
        </div>

        {/* Guidelines List */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading guidelines...
          </div>
        ) : guidelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No brand guidelines saved yet. Upload a PDF to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {guidelines.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 p-2 border rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm truncate">{g.name}</p>
                    {g.is_default && (
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {g.source_file_name || 'PDF'} &middot; {g.text_length.toLocaleString()} chars
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(g.id, g.name)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
