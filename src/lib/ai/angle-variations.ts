/**
 * Predefined angle variations for product photography
 * This file can be safely imported by both client and server components
 *
 * Each prompt describes the VISUAL RESULT (what the viewer sees),
 * not abstract degrees — this gives Gemini a clearer target image.
 */

export const ANGLE_VARIATIONS = [
  {
    name: 'front',
    description: 'Front view, straight on',
    prompt: `Photograph the product from DIRECTLY IN FRONT at eye level.
The camera is perfectly centered — the product's front label/face fills the frame.
The viewer sees only the front surface. No side, top, or back is visible.
This is a classic "hero shot" — clean, symmetrical, front-facing.`,
  },
  {
    name: 'left_side',
    description: 'Left side view',
    prompt: `Photograph the product from the LEFT SIDE — the camera has moved 90° to the left.
The viewer is now looking at the LEFT SIDE of the product. The front label is NO LONGER visible.
You can see the side surface, the side edge, and possibly the cap/top from a side angle.
This is a completely different view from the front — imagine walking around the product to its left.`,
  },
  {
    name: 'right_side',
    description: 'Right side view',
    prompt: `Photograph the product from the RIGHT SIDE — the camera has moved 90° to the right.
The viewer is now looking at the RIGHT SIDE of the product. The front label is NO LONGER visible.
You can see the side surface, the side edge, and possibly the cap/top from a side angle.
This is a completely different view from the front — imagine walking around the product to its right.`,
  },
  {
    name: 'top_down',
    description: 'Top-down overhead view',
    prompt: `Photograph the product from DIRECTLY ABOVE — a bird's-eye / top-down shot.
The camera is positioned overhead looking straight down at the product.
The viewer sees the TOP of the product — the cap, lid, or top surface.
The front label should NOT be visible (or only barely visible at the edges).
The product appears circular or from above. This is a flat-lay perspective.`,
  },
  {
    name: 'three_quarter_left',
    description: 'Three-quarter view from front-left',
    prompt: `Photograph the product from a THREE-QUARTER ANGLE from the front-left.
The camera is positioned at roughly 45° to the left and slightly elevated.
The viewer sees TWO distinct faces: the front label AND the left side.
About 60% front face visible, 40% left side visible.
This is the classic "hero 3/4 shot" commonly used in e-commerce product photography.`,
  },
  {
    name: 'three_quarter_right',
    description: 'Three-quarter view from front-right',
    prompt: `Photograph the product from a THREE-QUARTER ANGLE from the front-right.
The camera is positioned at roughly 45° to the right and slightly elevated.
The viewer sees TWO distinct faces: the front label AND the right side.
About 60% front face visible, 40% right side visible.
This is the classic "hero 3/4 shot" commonly used in e-commerce product photography.`,
  },
  {
    name: 'back',
    description: 'Back view showing rear label/info',
    prompt: `Photograph the product from the BACK — the camera is behind the product.
The viewer sees the REAR of the product: the back label, ingredients list, nutritional info, or barcode.
The front label is NOT visible at all.
Imagine you picked up the product and turned it around 180° — that's what the viewer sees.`,
  },
]
