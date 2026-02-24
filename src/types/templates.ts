// Template layer types
export type LayerType = 'background' | 'product' | 'text' | 'logo'

export interface LayerPosition {
  x: number      // Percentage from left (0-100)
  y: number      // Percentage from top (0-100)
  width: number  // Percentage of canvas width (0-100)
  height: number // Percentage of canvas height (0-100)
}

export interface BaseLayer {
  id: string
  type: LayerType
  name: string
  zIndex: number
  position: LayerPosition
  visible?: boolean
}

export interface BackgroundLayer extends BaseLayer {
  type: 'background'
  fill: 'cover' | 'contain' | 'stretch'
}

export interface ProductLayer extends BaseLayer {
  type: 'product'
  alignment?: 'center' | 'left' | 'right' | 'top' | 'bottom'
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  textType: 'headline' | 'hook' | 'cta' | 'body' | 'tagline'
  maxChars?: number
  fontSize?: number
  textAlign?: 'left' | 'center' | 'right'
  color?: string
}

export interface LogoLayer extends BaseLayer {
  type: 'logo'
  padding?: number
  maxWidth?: number
  maxHeight?: number
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

export type TemplateLayer = BackgroundLayer | ProductLayer | TextLayer | LogoLayer

export interface SafeZone {
  id: string
  name: string
  type: 'margin' | 'exclusion'
  position: LayerPosition
}

export interface TemplateData {
  layers: TemplateLayer[]
  safeZones: SafeZone[]
  version: string
}

export interface Template {
  id: string
  category_id: string
  user_id: string
  name: string
  description?: string
  format: string
  width: number
  height: number
  template_data: TemplateData
  storage_provider: string
  storage_path: string
  storage_url: string
  gdrive_file_id?: string
  slug?: string
  created_at: string
  updated_at: string
}
