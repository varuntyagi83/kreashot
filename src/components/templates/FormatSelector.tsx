'use client'

import { FORMATS } from '@/lib/formats'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FormatSelectorProps {
  value: string
  onChange: (format: string) => void
  disabled?: boolean
}

export function FormatSelector({ value, onChange, disabled = false }: FormatSelectorProps) {
  const formats = Object.values(FORMATS)

  return (
    <div className="flex flex-wrap gap-2">
      {formats.map((format) => (
        <Button
          key={format.format}
          variant={value === format.format ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(format.format)}
          disabled={disabled}
          className={cn(
            'font-mono text-xs',
            value === format.format && 'ring-2 ring-primary'
          )}
        >
          {format.format}
          <span className="ml-2 text-xs opacity-70">
            {format.width}×{format.height}
          </span>
        </Button>
      ))}
    </div>
  )
}
