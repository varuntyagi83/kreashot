/**
 * Template types for visual canvas-based template builder
 */

export type LayerType = 'background' | 'product' | 'text' | 'logo'

export type SafeZoneType = 'safe' | 'restricted'

export interface TemplateLayer {
  id: string
  type: LayerType
  name?: string
  x: number // percentage from left
  y: number // percentage from top
  width: number // percentage of canvas width
  height: number // percentage of canvas height
  z_index: number
  locked: boolean

  // Text-specific properties
  font_size?: number
  font_family?: string
  color?: string
  background_color?: string
  text_align?: 'left' | 'center' | 'right'
  max_chars?: number

  // Logo-specific properties
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  padding?: number

  // Product-specific properties
  alignment?: 'center' | 'left' | 'right'
}

export interface SafeZone {
  id: string
  name: string
  x: number // percentage from left
  y: number // percentage from top
  width: number // percentage of canvas width
  height: number // percentage of canvas height
  type: SafeZoneType
  color: string // hex color with alpha
}

export interface TemplateData {
  layers: TemplateLayer[]
  safe_zones: SafeZone[]
  global_settings: {
    background_color: string
    grid_enabled: boolean
    grid_size: number
  }
}

export interface Template {
  id: string
  category_id: string
  user_id: string
  name: string
  description?: string
  format: string // '1:1', '16:9', '9:16', '4:5'
  width: number
  height: number
  template_data: TemplateData
  storage_provider: string
  storage_path: string
  storage_url: string
  gdrive_file_id?: string
  slug?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}
