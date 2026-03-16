/**
 * Ad layout presets for the Ads workspace.
 * All position/size values are percentages of the canvas (0–100).
 * fontSize is in pixels at a reference canvas width of 1080px.
 * 15 named presets covering common ad layout patterns.
 * Overlays are intentionally omitted — text/logo float on the clean image.
 */

export interface OverlaySpec {
  type: 'strip-bottom' | 'strip-top' | 'strip-center' | 'badge-center' | 'full-darken'
  opacity: number
  height?: number  // % of canvas height
  width?: number   // % of canvas width (badge-center only)
}

export interface LogoSpec {
  x: number    // % of canvas width (left edge of logo)
  y: number    // % of canvas height (top edge of logo)
  size: number // logo width as % of canvas width
}

export interface TextSpec {
  x: number       // % of canvas width (left edge)
  y: number       // % of canvas height (top edge)
  width: number   // % of canvas width
  fontSize: number // px at 1080px reference canvas width
  align: 'left' | 'center' | 'right'
  color: string
  fontWeight?: string
}

export interface AdLayoutPreset {
  id: string
  name: string
  overlay?: OverlaySpec
  logo?: LogoSpec
  headline: TextSpec
  subline?: TextSpec
}

export const AD_LAYOUT_PRESETS: AdLayoutPreset[] = [
  {
    id: 'bottom-strip',
    name: 'Bottom Strip',
    logo: { x: 4, y: 4, size: 10 },
    headline: { x: 5, y: 74, width: 90, fontSize: 52, align: 'left', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 5, y: 86, width: 90, fontSize: 32, align: 'left', color: '#FFFFFF' },
  },
  {
    id: 'center-overlay',
    name: 'Center Text',
    logo: { x: 40, y: 8, size: 20 },
    headline: { x: 10, y: 42, width: 80, fontSize: 60, align: 'center', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 10, y: 60, width: 80, fontSize: 36, align: 'center', color: '#FFFFFF' },
  },
  {
    id: 'top-badge',
    name: 'Top Badge',
    logo: { x: 4, y: 4, size: 10 },
    headline: { x: 20, y: 5, width: 70, fontSize: 42, align: 'left', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 20, y: 13, width: 70, fontSize: 28, align: 'left', color: '#FFFFFF' },
  },
  {
    id: 'top-left-stack',
    name: 'Top Left Stack',
    logo: { x: 4, y: 4, size: 10 },
    headline: { x: 4, y: 18, width: 55, fontSize: 52, align: 'left', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 4, y: 32, width: 55, fontSize: 32, align: 'left', color: '#FFFFFF' },
  },
  {
    id: 'top-right-stack',
    name: 'Top Right Stack',
    logo: { x: 86, y: 4, size: 10 },
    headline: { x: 41, y: 18, width: 55, fontSize: 52, align: 'right', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 41, y: 32, width: 55, fontSize: 32, align: 'right', color: '#FFFFFF' },
  },
  {
    id: 'bottom-right-stack',
    name: 'Bottom Right Stack',
    logo: { x: 86, y: 82, size: 10 },
    headline: { x: 41, y: 62, width: 55, fontSize: 52, align: 'right', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 41, y: 74, width: 55, fontSize: 32, align: 'right', color: '#FFFFFF' },
  },
  {
    id: 'bottom-left-stack',
    name: 'Bottom Left Stack',
    logo: { x: 4, y: 82, size: 10 },
    headline: { x: 4, y: 62, width: 55, fontSize: 52, align: 'left', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 4, y: 74, width: 55, fontSize: 32, align: 'left', color: '#FFFFFF' },
  },
  {
    id: 'top-center',
    name: 'Top Center',
    logo: { x: 42, y: 3, size: 16 },
    headline: { x: 5, y: 22, width: 90, fontSize: 56, align: 'center', color: '#FFFFFF', fontWeight: 'bold' },
  },
  {
    id: 'middle-left',
    name: 'Middle Left',
    logo: { x: 4, y: 4, size: 10 },
    headline: { x: 5, y: 35, width: 55, fontSize: 52, align: 'left', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 5, y: 50, width: 55, fontSize: 32, align: 'left', color: '#FFFFFF' },
  },
  {
    id: 'middle-right',
    name: 'Middle Right',
    logo: { x: 86, y: 4, size: 10 },
    headline: { x: 40, y: 35, width: 55, fontSize: 52, align: 'right', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 40, y: 50, width: 55, fontSize: 32, align: 'right', color: '#FFFFFF' },
  },
  {
    id: 'center-badge',
    name: 'Center Badge',
    headline: { x: 15, y: 37, width: 70, fontSize: 52, align: 'center', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 15, y: 50, width: 70, fontSize: 32, align: 'center', color: '#FFFFFF' },
  },
  {
    id: 'full-darken',
    name: 'Center Classic',
    logo: { x: 40, y: 6, size: 20 },
    headline: { x: 5, y: 40, width: 90, fontSize: 60, align: 'center', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 5, y: 55, width: 90, fontSize: 36, align: 'center', color: '#FFFFFF' },
  },
  {
    id: 'bottom-logo-top-text',
    name: 'Logo Bottom, Text Top',
    logo: { x: 40, y: 82, size: 20 },
    headline: { x: 5, y: 8, width: 90, fontSize: 56, align: 'center', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 5, y: 20, width: 90, fontSize: 34, align: 'center', color: '#FFFFFF' },
  },
  {
    id: 'tl-logo-br-text',
    name: 'TL Logo + BR Text',
    logo: { x: 4, y: 4, size: 12 },
    headline: { x: 35, y: 72, width: 60, fontSize: 48, align: 'right', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 35, y: 84, width: 60, fontSize: 30, align: 'right', color: '#FFFFFF' },
  },
  {
    id: 'tr-logo-bl-text',
    name: 'TR Logo + BL Text',
    logo: { x: 84, y: 4, size: 12 },
    headline: { x: 5, y: 72, width: 60, fontSize: 48, align: 'left', color: '#FFFFFF', fontWeight: 'bold' },
    subline:  { x: 5, y: 84, width: 60, fontSize: 30, align: 'left', color: '#FFFFFF' },
  },
]
