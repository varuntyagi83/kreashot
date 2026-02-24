/**
 * Multi-format configuration for AdForge
 * Supports 1:1, 16:9, 9:16, and 4:5 aspect ratios
 */

export interface FormatConfig {
  name: string
  format: string
  width: number
  height: number
  aspectRatio: string
  description: string
  platform: string
}

export const FORMATS: Record<string, FormatConfig> = {
  '1:1': {
    name: '1:1',
    format: '1:1',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    description: 'Instagram Square Post',
    platform: 'Instagram',
  },
  '16:9': {
    name: '16:9',
    format: '16:9',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    description: 'Facebook/YouTube Landscape',
    platform: 'Facebook',
  },
  '9:16': {
    name: '9:16',
    format: '9:16',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    description: 'Instagram/TikTok Stories',
    platform: 'Stories',
  },
  '4:5': {
    name: '4:5',
    format: '4:5',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    description: 'Instagram Portrait',
    platform: 'Instagram',
  },
}

export const FORMAT_LIST = Object.values(FORMATS)

export function getFormatConfig(format: string): FormatConfig {
  return FORMATS[format] || FORMATS['1:1']
}

export function getFormatDimensions(format: string): { width: number; height: number } {
  const config = getFormatConfig(format)
  return { width: config.width, height: config.height }
}

/**
 * Convert format to folder-safe name
 * Database: 1:1, 16:9, 9:16, 4:5 (with colons)
 * Folders: 1x1, 16x9, 9x16, 4x5 (with x)
 */
export function formatToFolderName(format: string): string {
  return format.replace(':', 'x')
}

/**
 * Convert folder name to format
 * Folder: 1x1, 16x9, 9x16, 4x5
 * Format: 1:1, 16:9, 9:16, 4:5
 */
export function folderNameToFormat(folderName: string): string {
  return folderName.replace('x', ':')
}
