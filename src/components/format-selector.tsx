'use client'

import { FORMATS, type FormatConfig } from '@/lib/formats'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Info } from 'lucide-react'

interface FormatSelectorProps {
  selectedFormat: string
  onFormatChange: (format: string) => void
  availableFormats?: string[] // Optional: limit to specific formats
  className?: string
}

export function FormatSelector({
  selectedFormat,
  onFormatChange,
  availableFormats,
  className,
}: FormatSelectorProps) {
  const formats = availableFormats
    ? Object.values(FORMATS).filter((f) => availableFormats.includes(f.format))
    : Object.values(FORMATS)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-muted-foreground">Format:</span>
      <span
        className="inline-flex cursor-help text-muted-foreground/70"
        aria-label="What does Format control?"
        title="Sets the working format for new generations and filters each tab to that format. Changing it does not re-run or modify existing assets."
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      <Select value={selectedFormat} onValueChange={onFormatChange}>
        <SelectTrigger className="h-8 w-[160px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {formats.map((formatConfig: FormatConfig) => (
            <SelectItem key={formatConfig.format} value={formatConfig.format}>
              <span className="font-mono font-semibold">{formatConfig.format}</span>
              <span className="ml-2 text-muted-foreground text-xs">({formatConfig.platform})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function FormatBadge({
  format,
  className,
}: {
  format: string
  className?: string
}) {
  const formatConfig = FORMATS[format]
  if (!formatConfig) return null

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs font-medium',
        className
      )}
    >
      <span className="font-mono font-semibold">{formatConfig.format}</span>
      <span className="text-muted-foreground">•</span>
      <span className="text-muted-foreground">
        {formatConfig.width}×{formatConfig.height}
      </span>
      <span className="text-muted-foreground">•</span>
      <span className="text-muted-foreground">{formatConfig.platform}</span>
    </div>
  )
}
