/**
 * Collage types for multi-image collage ad builder
 */

export type CollageLayerType = 'image' | 'text' | 'overlay' | 'background'

export interface CollageLayer {
  id: string
  type: CollageLayerType
  name?: string
  x: number // percentage from left (0-100)
  y: number // percentage from top (0-100)
  width: number // percentage of canvas width (0-100)
  height: number // percentage of canvas height (0-100)
  z_index: number
  locked?: boolean

  // Image-specific properties
  source_url?: string // URL of the image (Brand Asset, pipeline asset, or external)
  object_fit?: 'cover' | 'contain' // how the image fills the cell

  // Text-specific properties
  text_content?: string
  font_size?: number
  font_family?: string
  color?: string
  background_color?: string
  text_align?: 'left' | 'center' | 'right'

  // Overlay-specific (same as template overlay)
  // uses source_url above
}

export interface CollageData {
  layers: CollageLayer[]
  background_color: string // hex color for canvas background
}

export interface Collage {
  id: string
  category_id: string
  user_id: string
  name: string
  format: string // '1:1', '16:9', '9:16', '4:5'
  width: number
  height: number
  collage_data: CollageData
  storage_provider?: string
  storage_path?: string
  storage_url?: string
  gdrive_file_id?: string
  created_at: string
  updated_at: string
}
