/**
 * Predefined angle variations for product photography
 * This file can be safely imported by both client and server components
 */

export const ANGLE_VARIATIONS = [
  {
    name: 'front',
    description: 'Front view, straight on',
    prompt: 'Camera is at 0° horizontal orbit, 0° vertical elevation (eye-level). Lens points directly at the front face center. Position the camera directly in front of the product. The front face should be fully visible and centered in the frame.',
  },
  {
    name: 'left_30deg',
    description: 'Left side, 30 degree angle',
    prompt: 'Camera orbits 30° counterclockwise (as seen from above). Elevation stays at eye-level (0° vertical). The front face should STILL BE THE MAIN FOCUS taking up 70-80% of the visible product, with just the left edge becoming slightly visible (20-30%). This is a subtle angle change, not a dramatic rotation.',
  },
  {
    name: 'right_30deg',
    description: 'Right side, 30 degree angle',
    prompt: 'Camera orbits 30° clockwise (as seen from above). Elevation stays at eye-level (0° vertical). The front face should STILL BE THE MAIN FOCUS taking up 70-80% of the visible product, with just the right edge becoming slightly visible (20-30%). This is a subtle angle change, not a dramatic rotation.',
  },
  {
    name: 'top_45deg',
    description: 'Top view, 45 degree angle',
    prompt: 'Camera stays centered (0° horizontal orbit) but elevates to 45° above the horizon, tilting down to keep the product centered in frame. The top surface should be clearly visible, and you can see down onto the product from above.',
  },
  {
    name: 'three_quarter_left',
    description: 'Three-quarter view from left',
    prompt: 'Camera orbits 45° counterclockwise (as seen from above) at eye-level elevation. You should see TWO DISTINCT FACES: the front should take up about 60% of the visible surface, and the left side should take up about 40%. Both faces must be clearly visible. This is a classic product photography angle showing two faces.',
  },
  {
    name: 'three_quarter_right',
    description: 'Three-quarter view from right',
    prompt: 'Camera orbits 45° clockwise (as seen from above) at eye-level elevation. You should see TWO DISTINCT FACES: the front should take up about 60% of the visible surface, and the right side should take up about 40%. Both faces must be clearly visible. This is a classic product photography angle showing two faces.',
  },
  {
    name: 'isometric',
    description: 'Isometric view',
    prompt: 'Camera orbits 30° counterclockwise AND elevates 30° above the horizon. Three surfaces visible simultaneously: front face, left side, and top. This technical drawing style shows three dimensions at once.',
  },
]
