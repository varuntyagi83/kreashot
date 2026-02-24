/**
 * Helper functions for formatting angle names
 */

/**
 * Converts angle_name identifier to display format
 * @example formatAngleNameForDisplay('front') => 'Front'
 * @example formatAngleNameForDisplay('left_30deg') => 'Left 30deg'
 */
export function formatAngleNameForDisplay(angleName: string): string {
  const displayNames: Record<string, string> = {
    'front': 'Front',
    'left_30deg': 'Left 30deg',
    'right_30deg': 'Right 30deg',
    'top_45deg': 'Top 45deg',
    'three_quarter_left': 'Three Quarter Left',
    'three_quarter_right': 'Three Quarter Right',
    'isometric': 'Isometric',
  }

  return displayNames[angleName] || angleName
}

/**
 * Creates a full display name with product prefix
 * @example createDisplayName('Nike Air Max', 'front') => 'Nike Air Max_Front'
 * @example createDisplayName('Apple iPhone', 'left_30deg') => 'Apple iPhone_Left 30deg'
 */
export function createDisplayName(productName: string, angleName: string): string {
  const angleDisplay = formatAngleNameForDisplay(angleName)
  return `${productName}_${angleDisplay}`
}
