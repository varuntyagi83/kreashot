'use client'

import { FORMATS, type FormatConfig } from '@/lib/formats'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  // Filter formats if availableFormats is provided
  const formats = availableFormats
    ? Object.values(FORMATS).filter((f) => availableFormats.includes(f.format))
    : Object.values(FORMATS)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-muted-foreground">Format:</span>
      <div className="flex gap-2">
        {formats.map((formatConfig: FormatConfig) => (
          <Button
            key={formatConfig.format}
            variant={selectedFormat === formatConfig.format ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFormatChange(formatConfig.format)}
            className="min-w-[80px]"
          >
            <span className="font-mono font-semibold">{formatConfig.format}</span>
            <span className="ml-2 text-xs opacity-70">{formatConfig.platform}</span>
          </Button>
        ))}
      </div>
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
