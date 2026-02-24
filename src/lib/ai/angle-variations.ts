/**
 * Predefined angle variations for product photography
 * This file can be safely imported by both client and server components
 */

export const ANGLE_VARIATIONS = [
  {
    name: 'front',
    description: 'Front view, straight on',
    prompt: 'Position the camera directly in front of the product. The front face should be fully visible and centered in the frame.',
  },
  {
    name: 'left_30deg',
    description: 'Left side, 30 degree angle',
    prompt: 'Move the camera SLIGHTLY to the left (about 30 degrees from center). The front face should STILL BE THE MAIN FOCUS taking up 70-80% of the visible product, with just the left edge becoming slightly visible (20-30%). This is a subtle angle change, not a dramatic rotation.',
  },
  {
    name: 'right_30deg',
    description: 'Right side, 30 degree angle',
    prompt: 'Move the camera SLIGHTLY to the right (about 30 degrees from center). The front face should STILL BE THE MAIN FOCUS taking up 70-80% of the visible product, with just the right edge becoming slightly visible (20-30%). This is a subtle angle change, not a dramatic rotation.',
  },
  {
    name: 'top_45deg',
    description: 'Top view, 45 degree angle',
    prompt: 'Move the camera position to look down at the product from a 45-degree elevated angle. The top surface should be clearly visible, and you can see down onto the product from above.',
  },
  {
    name: 'three_quarter_left',
    description: 'Three-quarter view from left',
    prompt: 'Move the camera about 45 degrees counterclockwise around the product - you should see TWO DISTINCT FACES: the front should take up about 60% of the visible surface, and the left side should take up about 40%. Both faces must be clearly visible. This is a classic product photography angle showing two faces equally.',
  },
  {
    name: 'three_quarter_right',
    description: 'Three-quarter view from right',
    prompt: 'Move the camera about 45 degrees clockwise around the product - you should see TWO DISTINCT FACES: the front should take up about 60% of the visible surface, and the right side should take up about 40%. Both faces must be clearly visible. This is a classic product photography angle showing two faces equally.',
  },
  {
    name: 'isometric',
    description: 'Isometric view',
    prompt: 'Create an isometric view (30-degree angle) showing the front and left side equally, with a slight elevated camera angle to also see the top. This technical drawing style shows three dimensions simultaneously.',
  },
]
