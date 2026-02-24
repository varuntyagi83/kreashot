'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Package, Image as ImageIcon } from 'lucide-react'

interface Reference {
  id: string
  type: 'brand-asset' | 'product'
  name: string
  preview?: string
  isImage?: boolean
  categoryName?: string
  categoryId?: string
}

interface ReferencePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  rows?: number
}

export function ReferencePicker({
  value,
  onChange,
  placeholder = 'Type @ to reference assets or products...',
  className,
  disabled,
  rows = 4,
}: ReferencePickerProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Reference[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Detect @ mentions and extract search query
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const text = value
    const pos = cursorPosition

    // Find the @ symbol before cursor
    const textBeforeCursor = text.substring(0, pos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex === -1) {
      setShowSuggestions(false)
      return
    }

    // Check if there's a space between @ and cursor
    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1)
    if (textAfterAt.includes(' ')) {
      setShowSuggestions(false)
      return
    }

    // Extract search query
    const query = textAfterAt
    setSearchQuery(query)
    setShowSuggestions(true)

    // Fetch suggestions
    fetchSuggestions(query)
  }, [value, cursorPosition])

  const fetchSuggestions = async (query: string) => {
    try {
      const response = await fetch(`/api/references/search?q=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.results || [])
        setSelectedIndex(0)
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error)
    }
  }

  const insertReference = (reference: Reference) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const text = value
    const pos = cursorPosition

    // Find the @ symbol before cursor
    const textBeforeCursor = text.substring(0, pos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex === -1) return

    // Replace @query with @[name](type:id)
    const beforeAt = text.substring(0, lastAtIndex)
    const afterCursor = text.substring(pos)
    const referenceText = `@[${reference.name}](${reference.type}:${reference.id})`
    const newText = beforeAt + referenceText + ' ' + afterCursor
    const newCursorPos = beforeAt.length + referenceText.length + 1

    onChange(newText)
    setShowSuggestions(false)
    setSuggestions([])

    // Set cursor position after insertion
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      setCursorPosition(newCursorPos)
    }, 0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (suggestions[selectedIndex]) {
        insertReference(suggestions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleChange = (newValue: string) => {
    onChange(newValue)
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart)
    }
  }

  const handleClick = () => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart)
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        placeholder={placeholder}
        className={cn('font-mono text-sm', className)}
        disabled={disabled}
        rows={rows}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-w-md bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.id}`}
              type="button"
              className={cn(
                'w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-center gap-3',
                index === selectedIndex && 'bg-accent'
              )}
              onClick={() => insertReference(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {suggestion.type === 'brand-asset' && suggestion.isImage && suggestion.preview ? (
                <img
                  src={suggestion.preview}
                  alt={suggestion.name}
                  className="w-10 h-10 object-cover rounded"
                />
              ) : suggestion.type === 'brand-asset' ? (
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{suggestion.name}</p>
                <p className="text-xs text-muted-foreground">
                  {suggestion.type === 'brand-asset' ? 'Brand Asset' : `Product in ${suggestion.categoryName}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
