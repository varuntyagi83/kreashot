import { GoogleGenerativeAI } from '@google/generative-ai'
import { ANGLE_VARIATIONS } from './angle-variations'

// Lazy initialization of Gemini AI client
let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || ''
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
    }
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

/**
 * Analyzes a product image to understand its features and context
 */
export async function analyzeProductImage(
  imageData: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  try {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

    // Convert base64 to proper format if needed
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
      {
        text: `Analyze this product image in detail. Describe:
1. What is the product?
2. What are its key visual features (colors, textures, materials)?
3. What is the current viewing angle?
4. What background or setting is it in?
5. What is the product's shape and form?

Provide a concise but detailed description that would help recreate this product from different angles.`,
      },
    ])

    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Error analyzing product image:', error)
    throw new Error('Failed to analyze product image')
  }
}

/**
 * Generates angled shot variations using Gemini 3 Pro Image Preview
 *
 * Uses Gemini's image-to-image generation for better product preservation
 */
export async function generateAngledShots(
  productImageData: string,
  productImageMimeType: string,
  angles: (typeof ANGLE_VARIATIONS)[number][],
  lookAndFeel?: string,
  aspectRatio: string = '1:1' // NEW: Aspect ratio (1:1, 16:9, 9:16, 4:5)
): Promise<
  Array<{
    angleName: string
    angleDescription: string
    promptUsed: string
    imageData: string
    mimeType: string
  }>
> {
  try {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || ''
    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
    }

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

    // Convert base64 image to proper format
    const base64Data = productImageData.replace(/^data:image\/\w+;base64,/, '')

    // Generate each angle variation
    const results = []

    for (const angle of angles) {
      console.log(`Generating ${angle.name} angle for ${aspectRatio} format...`)

      // Create prompt for this specific angle
      const prompt = `Create a variation of this product image showing: ${angle.description}.

ANGLE INSTRUCTION: ${angle.prompt}

${lookAndFeel ? `STYLE: ${lookAndFeel}\n\n` : ''}CRITICAL - DO NOT MODIFY THESE:
✓ Keep ALL text EXACTLY as shown - do not change, rearrange, or create new text
✓ Preserve the exact product design, colors, and materials
✓ Maintain the same product shape and appearance
✓ Keep the same background color and lighting style
✓ Keep all props and surrounding objects in similar positions
✓ The product must maintain its correct orientation (right-side up) - NEVER flip or invert it
✓ Output must be in ${aspectRatio} aspect ratio

ONLY CHANGE THIS:
✗ Rotate the camera angle/viewpoint to: ${angle.description}
✗ Adjust the camera position as described in the angle instruction

Think of this as moving a camera around a stationary product on a turntable. The product stays the same, only your viewing angle changes.

Return a high-quality professional product photograph from the new angle in ${aspectRatio} aspect ratio.`

      try {
        // Build request body using direct REST API format
        const requestBody = {
          contents: [{
            parts: [
              {
                inline_data: {
                  data: base64Data,
                  mime_type: productImageMimeType,
                },
              },
              {
                text: prompt,
              },
            ]
          }],
          generationConfig: {
            temperature: 0.55, // Balanced: enough variation for angles, but preserves product details
            topP: 0.95,
            maxOutputTokens: 32768,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio, // ✅ Enforce aspect ratio
              imageSize: '2K' // ✅ Control output resolution
            }
          }
        }

        // Call Gemini API directly
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        // Extract base64 image from response
        if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
          const generatedBase64 = data.candidates[0].content.parts[0].inlineData.data
          const generatedMimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/jpeg'

          results.push({
            angleName: angle.name,
            angleDescription: angle.description,
            promptUsed: prompt,
            imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
            mimeType: generatedMimeType,
          })

          console.log(`   ✅ ${angle.name} generated successfully in ${aspectRatio} format`)
        } else {
          console.warn(`   ⚠️  No image in response for ${angle.name}, using original as fallback`)
          results.push({
            angleName: angle.name,
            angleDescription: angle.description,
            promptUsed: prompt,
            imageData: productImageData,
            mimeType: productImageMimeType,
          })
        }
      } catch (error) {
        console.error(`   ❌ Error generating ${angle.name}:`, error)
        // Fallback to original image on error
        results.push({
          angleName: angle.name,
          angleDescription: angle.description,
          promptUsed: prompt,
          imageData: productImageData,
          mimeType: productImageMimeType,
        })
      }
    }

    return results
  } catch (error) {
    console.error('Error generating angled shots:', error)
    throw new Error('Failed to generate angled shots')
  }
}

/**
 * Generate backgrounds matching category style using Gemini
 * For Phase 3: Background Generation (updated for multi-format support)
 */
export async function generateBackgrounds(
  userPrompt: string,
  lookAndFeel: string,
  count: number = 1,
  styleReferenceImages?: Array<{ data: string; mimeType: string }>,
  aspectRatio: string = '1:1', // NEW: Aspect ratio (1:1, 16:9, 9:16, 4:5)
  imageSize: string = '2K' // NEW: Image size (2K, 4K)
): Promise<
  Array<{
    promptUsed: string
    imageData: string
    mimeType: string
  }>
> {
  try {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || ''
    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
    }

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'
    const results = []

    for (let i = 0; i < count; i++) {
      console.log(`Generating ${aspectRatio} background ${i + 1}/${count}...`)

      // Build the background generation prompt
      const prompt = `Generate a high-quality product photography background in ${aspectRatio} aspect ratio with the following characteristics:

Category Style: ${lookAndFeel}
User Request: ${userPrompt}

CRITICAL INSTRUCTIONS:
- This is ONLY a background — no products, no text, no logos, no watermarks
- The background should complement a product that will be composited on top later
- Leave clear space in the center/foreground for a product to be placed
- Match the lighting style to the category aesthetic
- Professional, studio-quality output suitable for e-commerce
- Aspect ratio: ${aspectRatio} (strictly enforced)
- The scene should feel natural and inviting
- Consider depth of field, lighting, and composition
- Make it visually appealing and aligned with modern product photography trends

${styleReferenceImages && styleReferenceImages.length > 0 ? 'Use the provided reference images as style guidance for colors, mood, and aesthetic.' : ''}

Return a professional product photography background.`

      try {
        const contentParts: any[] = []

        // Add style reference images if provided
        if (styleReferenceImages && styleReferenceImages.length > 0) {
          for (const refImage of styleReferenceImages) {
            const base64Data = refImage.data.replace(/^data:image\/\w+;base64,/, '')
            contentParts.push({
              inline_data: {
                data: base64Data,
                mime_type: refImage.mimeType,
              },
            })
          }
        }

        // Add the text prompt
        contentParts.push({ text: prompt })

        // Build request body using direct REST API format
        const requestBody = {
          contents: [{
            parts: contentParts
          }],
          generationConfig: {
            temperature: 0.7, // Higher for creative backgrounds
            topP: 0.95,
            maxOutputTokens: 32768,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio, // ✅ Enforce aspect ratio
              imageSize: imageSize // ✅ Control output resolution
            }
          }
        }

        // Call Gemini API directly
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        // Extract base64 image from response
        if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
          const generatedBase64 = data.candidates[0].content.parts[0].inlineData.data
          const generatedMimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/jpeg'

          results.push({
            promptUsed: prompt,
            imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
            mimeType: generatedMimeType,
          })

          console.log(`   ✅ ${aspectRatio} background ${i + 1} generated successfully`)
        } else {
          console.warn(`   ⚠️  No image in response for background ${i + 1}`)
          throw new Error('No image generated in response')
        }
      } catch (error) {
        console.error(`   ❌ Error generating ${aspectRatio} background ${i + 1}:`, error)
        throw error
      }
    }

    return results
  } catch (error) {
    console.error('Error generating backgrounds:', error)
    throw new Error('Failed to generate backgrounds')
  }
}

/**
 * Generate composite image by combining product and background
 * For Phase 4: Format-aware composite generation
 *
 * This creates a natural-looking composite where:
 * - Product appearance is preserved (labels, branding, colors)
 * - Background scene/model is preserved
 * - Gemini intelligently places product in scene with natural lighting/shadows
 * - Supports multiple aspect ratios (1:1, 16:9, 9:16, 4:5)
 */
export async function generateComposite(
  productImageData: string,
  productImageMimeType: string,
  backgroundImageData: string,
  backgroundImageMimeType: string,
  userPrompt?: string,
  lookAndFeel?: string,
  safeZones?: Array<{
    id: string
    name: string
    x: number
    y: number
    width: number
    height: number
    type: 'safe' | 'restricted'
  }>,
  canvasWidth: number = 1080, // NEW: Canvas width (default 1:1)
  canvasHeight: number = 1080 // NEW: Canvas height (default 1:1)
): Promise<{
  promptUsed: string
  imageData: string
  mimeType: string
}> {
  try {
    // Calculate aspect ratio from canvas dimensions
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
    const divisor = gcd(canvasWidth, canvasHeight)
    const aspectRatio = `${canvasWidth / divisor}:${canvasHeight / divisor}`

    console.log(`Generating composite with Gemini (${canvasWidth}x${canvasHeight}, aspect ratio: ${aspectRatio})...`)

    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || ''
    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
    }

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

    // Build safe zone instructions if provided
    let safeZoneInstructions = ''
    if (safeZones && safeZones.length > 0) {
      const productSafeZone = safeZones.find(z => z.type === 'safe' && z.name.toLowerCase().includes('product'))
      const restrictedZones = safeZones.filter(z => z.type === 'restricted')

      if (productSafeZone) {
        // Calculate pixel values based on canvas dimensions
        const leftPx = Math.round((productSafeZone.x / 100) * canvasWidth)
        const topPx = Math.round((productSafeZone.y / 100) * canvasHeight)
        const widthPx = Math.round((productSafeZone.width / 100) * canvasWidth)
        const heightPx = Math.round((productSafeZone.height / 100) * canvasHeight)

        safeZoneInstructions += `\n🎯 PRODUCT PLACEMENT ZONE (CRITICAL):
Position the product within these coordinates on a ${canvasWidth}x${canvasHeight} canvas:
- Left edge: ${productSafeZone.x}% from left (${leftPx}px)
- Top edge: ${productSafeZone.y}% from top (${topPx}px)
- Width: ${productSafeZone.width}% (${widthPx}px)
- Height: ${productSafeZone.height}% (${heightPx}px)

The ENTIRE product must fit within this zone. Do not let any part of the product extend outside these boundaries.\n`
      }

      if (restrictedZones.length > 0) {
        safeZoneInstructions += `\n⚠️ RESTRICTED ZONES (DO NOT PLACE PRODUCT HERE):
The following areas are restricted - do NOT place the product in these zones:\n`
        restrictedZones.forEach(zone => {
          safeZoneInstructions += `- ${zone.name}: ${zone.x}% to ${zone.x + zone.width}% from left, ${zone.y}% to ${zone.y + zone.height}% from top\n`
        })
      }

      safeZoneInstructions += '\nThese zones are defined by brand guidelines and MUST be respected for compliance.\n'
    }

    // Build the composite generation prompt
    const prompt = `Compose these two images into a single professional product photograph:

Image 1 (Product): This is the product that needs to be placed in the scene.
Image 2 (Background): This is the background scene/environment.

${userPrompt ? `USER INSTRUCTION: ${userPrompt}\n\n` : ''}${lookAndFeel ? `STYLE GUIDELINE: ${lookAndFeel}\n\n` : ''}${safeZoneInstructions}

CRITICAL INSTRUCTIONS:

PRESERVE EXACTLY (DO NOT CHANGE):
✓ Product appearance: Keep the EXACT labels, text, branding, colors, and shape
✓ Product design: Maintain all visual details of the product exactly as shown
✓ Background scene: Keep models, hands, props, and scene elements unchanged
✓ Background setting: Preserve the environment, mood boxes, objects as-is

WHAT YOU SHOULD DO:
✓ ${safeZones && safeZones.length > 0 ? 'POSITION THE PRODUCT WITHIN THE SPECIFIED SAFE ZONE - This is the most important requirement!' : 'Place the product NATURALLY in the background scene'}
✓ ${userPrompt ? `Follow user instruction: ${userPrompt}` : 'Position the product naturally in the scene'}
✓ Match the product's lighting to the background's lighting
✓ Add natural shadows and reflections where the product touches surfaces
✓ Make it look like the product was photographed IN that background, not pasted on
✓ Adjust depth of field to make the composition feel cohesive
✓ Scale the product appropriately for the scene ${safeZones ? '(while keeping it within the safe zone)' : ''}

WHAT YOU MUST NOT DO:
✗ Do NOT alter the product's labels, text, or branding
✗ Do NOT change the background model/person's appearance
✗ Do NOT modify the product's colors or design
✗ Do NOT add new text, logos, or watermarks of any kind
✗ Do NOT change the core elements of either image
✗ Do NOT add headlines, taglines, CTAs, slogans, or any copy whatsoever
✗ Do NOT render any words, letters, or typographic elements on the image

IMPORTANT — THIS IS A TEXT-FREE VISUAL COMPOSITE:
This image is the visual foundation of an ad. All copy (headlines, hooks, CTAs, body text) will be added separately in a later stage by a dedicated compositing tool. Adding text here would permanently bake it into pixels, making it impossible to edit or A/B test later. The composite MUST be clean — product on background, nothing else.

Think of this as taking a real product and photographing it in the background scene with professional lighting and composition. The product and background are real and fixed—you're just creating the photograph.

Return a professional, advertisement-quality composite image with NO text of any kind.`

    // Prepare content parts with both images
    const contentParts: any[] = []

    // Add product image
    const productBase64 = productImageData.replace(/^data:image\/\w+;base64,/, '')
    contentParts.push({
      inline_data: {
        data: productBase64,
        mime_type: productImageMimeType,
      },
    })

    // Add background image
    const backgroundBase64 = backgroundImageData.replace(/^data:image\/\w+;base64,/, '')
    contentParts.push({
      inline_data: {
        data: backgroundBase64,
        mime_type: backgroundImageMimeType,
      },
    })

    // Add the text prompt
    contentParts.push({ text: prompt })

    // Build request body using direct REST API format
    const requestBody = {
      contents: [{
        parts: contentParts
      }],
      generationConfig: {
        temperature: 0.4, // Lower temperature for precise compositing
        topP: 0.9,
        maxOutputTokens: 32768,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio, // ✅ Enforce aspect ratio (calculated from canvas dimensions)
          imageSize: '2K' // ✅ Control output resolution
        }
      }
    }

    // Call Gemini API directly
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // Extract base64 image from response
    if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const generatedBase64 = data.candidates[0].content.parts[0].inlineData.data
      const generatedMimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/jpeg'

      console.log(`   ✅ ${aspectRatio} composite generated successfully`)

      return {
        promptUsed: prompt,
        imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
        mimeType: generatedMimeType,
      }
    } else {
      throw new Error('No image in composite response')
    }
  } catch (error) {
    console.error('Error generating composite:', error)
    throw new Error('Failed to generate composite')
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function generateImage(
  prompt: string,
  referenceImages?: { data: string; mimeType: string; role: string }[]
): Promise<{ images: { data: string; mimeType: string }[]; text: string }> {
  // Use the reference image if provided
  if (referenceImages && referenceImages.length > 0) {
    const refImage = referenceImages[0]
    const analysis = await analyzeProductImage(refImage.data, refImage.mimeType)

    return {
      images: [
        {
          data: refImage.data, // Placeholder
          mimeType: refImage.mimeType,
        },
      ],
      text: analysis,
    }
  }

  throw new Error('Image generation requires reference images')
}
