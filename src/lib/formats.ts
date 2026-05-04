/**
 * Multi-format configuration for Kreashot
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
    platform: 'Square',
  },
  '4:5': {
    name: '4:5',
    format: '4:5',
    width: 1080,
    height: 1350,
    aspectRatio: '4:5',
    description: 'Instagram Portrait',
    platform: 'Portrait',
  },
  '3:4': {
    name: '3:4',
    format: '3:4',
    width: 1080,
    height: 1440,
    aspectRatio: '3:4',
    description: 'Portrait Classic',
    platform: 'Portrait',
  },
  '2:3': {
    name: '2:3',
    format: '2:3',
    width: 1080,
    height: 1620,
    aspectRatio: '2:3',
    description: 'Tall Portrait',
    platform: 'Portrait',
  },
  '9:16': {
    name: '9:16',
    format: '9:16',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    description: 'Stories / Reels',
    platform: 'Stories',
  },
  '16:9': {
    name: '16:9',
    format: '16:9',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    description: 'Widescreen Landscape',
    platform: 'Widescreen',
  },
  '4:3': {
    name: '4:3',
    format: '4:3',
    width: 1440,
    height: 1080,
    aspectRatio: '4:3',
    description: 'Standard Landscape',
    platform: 'Standard',
  },
  '3:2': {
    name: '3:2',
    format: '3:2',
    width: 1500,
    height: 1000,
    aspectRatio: '3:2',
    description: 'Classic Landscape',
    platform: 'Classic',
  },
  '5:4': {
    name: '5:4',
    format: '5:4',
    width: 1350,
    height: 1080,
    aspectRatio: '5:4',
    description: 'Near-Square Landscape',
    platform: 'Landscape',
  },
  '21:9': {
    name: '21:9',
    format: '21:9',
    width: 2520,
    height: 1080,
    aspectRatio: '21:9',
    description: 'Ultrawide Cinematic',
    platform: 'Ultrawide',
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

/**
 * Detect the closest matching format from actual image dimensions.
 * Compares the image's aspect ratio against all known formats
 * and returns the best match.
 */
export function detectFormatFromDimensions(width: number, height: number): string {
  const ratio = width / height

  let bestFormat = '1:1'
  let bestDiff = Infinity

  for (const [key, config] of Object.entries(FORMATS)) {
    const formatRatio = config.width / config.height
    const diff = Math.abs(ratio - formatRatio)
    if (diff < bestDiff) {
      bestDiff = diff
      bestFormat = key
    }
  }

  return bestFormat
}
