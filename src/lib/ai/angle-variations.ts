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
    prompt: `Photograph the product from the LEFT FRONT SIDE — the camera has moved 30° to the left.
The viewer is now looking at the FRONT LEFT side of the product. The front label is STILL visible.
You can see the front surface, the left side edge, and possibly the cap top from a slight angled view.
This is a slightly different view from the front — imagine walking around the product a little to its left, not fully to the side.`,
  },
  {
    name: 'right_side',
    description: 'Right side view',
    prompt: `Photograph the product from the RIGHT SIDE — the camera has moved 30° to the right.
The viewer is now looking at the FRONT RIGHT SIDE of the product. The front label is STILL visible.
You can see the front surface, the right side edge, and possibly the cap top from a slight angled view.
This is a slightly different view from the front — imagine walking around the product a little to its right, not fully to the side.`,
  },
  {
    name: 'top_down',
    description: 'Top-down overhead view',
    prompt: `Photograph the product from a HIGH FRONT TOP ANGLE — the camera is positioned above the product, tilted downward at it.
The viewer is now looking at the TOP and FRONT of the product at the same time. The cap is clearly visible, and the front label is STILL visible.
You can see the top surface, the upper front of the bottle, and part of the front label from an elevated angle.
This is not a flat lay and not a directly overhead shot — imagine raising the camera above the product and tilting it down toward the front, while keeping the branding visible.`,
  },
  {
    name: 'top_45deg',
    description: 'Top view at 45 degree angle',
    prompt: `Photograph the product from ABOVE at a 45° angle — the camera is elevated and tilted downward toward the product.
The viewer is now looking at the TOP and FRONT of the product at the same time. The cap is visible, and the front label is STILL visible.
You can see the top surface, the upper front of the bottle, and a slight side edge from a diagonal overhead view.
This is a moderately elevated product shot — imagine lifting the camera above the product and tilting it downward, while still keeping the branding and front label clearly visible.`,
  },
  {
    name: 'isometric',
    description: 'Isometric view',
    prompt: `Photograph the product in an ISOMETRIC perspective — equal angles so no single face dominates.
The camera is positioned so the viewer sees three faces of the product (e.g. front, side, and top) in a balanced, technical illustration style.
Clean, geometric product shot often used for icons and UI.`,
  },
  {
    name: 'three_quarter_left',
    description: 'Three-quarter view from front-left',
    prompt: `Photograph the product from the FRONT LEFT THREE-QUARTER ANGLE — the camera is positioned about 45° to the left and slightly elevated.
The viewer is now looking at the FRONT and LEFT side of the product at the same time. The front label is STILL visible and readable, and the left side surface is also visible.
You can see most of the front face, part of the left side, and possibly a small portion of the cap top from this angled view.
This is a classic hero product shot — imagine moving around the product slightly to its left and a little higher than eye level, while keeping the branding, text, and logo clearly visible and unchanged.`,
  },
  {
    name: 'three_quarter_right',
    description: 'Three-quarter view from front-right',
    prompt: `Photograph the product from the FRONT RIGHT THREE-QUARTER ANGLE — the camera is positioned about 45° to the right and slightly elevated.
The viewer is now looking at the FRONT and RIGHT side of the product at the same time. The front label is STILL visible and readable, and the right side surface is also visible.
You can see most of the front face, part of the right side, and possibly a small portion of the cap top from this angled view.
This is a classic hero product shot — imagine moving around the product slightly to its right and a little higher than eye level, while keeping the branding, text, and logo clearly visible and unchanged.`,
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
