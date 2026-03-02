import { GoogleGenerativeAI } from '@google/generative-ai'
import { ANGLE_VARIATIONS } from './angle-variations'
import type { BrandVoiceProfile } from './brand-voice'
import { formatBrandVoiceForPrompt } from './brand-voice'
import type { CopyType, CopyVariation, CopyKitItem } from './openai'

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
    const model = getGenAI().getGenerativeModel({ model: 'gemini-3.1-pro-preview' })

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

    // Generate angle variations with bounded concurrency (3 at a time) to avoid rate limits
    const CONCURRENCY = 3
    console.log(`Generating ${angles.length} angles (${CONCURRENCY} at a time) for ${aspectRatio} format...`)

    const results: Awaited<ReturnType<typeof generateAngledShots>> = []
    for (let i = 0; i < angles.length; i += CONCURRENCY) {
      const batch = angles.slice(i, i + CONCURRENCY)
      console.log(`  Batch ${Math.floor(i / CONCURRENCY) + 1}: ${batch.map(a => a.name).join(', ')}`)
      const batchResults = await Promise.all(batch.map(async (angle) => {
      console.log(`  → Starting ${angle.name}...`)

      const prompt = `TASK: Re-photograph this product from a COMPLETELY DIFFERENT camera angle.

CAMERA POSITION:
${angle.prompt}

Target view: ${angle.description}
${lookAndFeel ? `\nSTYLE: ${lookAndFeel}` : ''}

The output image MUST show a visually DISTINCT perspective from the input image.
If the input shows the front, and the target is a side view, the front label should NOT be the main visible face.
Generate a high-quality professional product photograph from this exact camera angle.`

      try {
        const requestBody = {
          systemInstruction: {
            parts: [{
              text: `You are a professional product photographer with a camera on a turntable rig.

YOUR JOB: Move the camera to a new position around the product and take a photograph from that new angle.
The product stays on the turntable. You walk around it with your camera.

RULES:
- The product is the SAME product — same shape, same colors, same materials, same brand.
- When viewed from the side or back, the front label naturally becomes hidden — this is CORRECT and EXPECTED.
- Different angles REVEAL different faces of the product (sides, back, top) — each shot should look distinctly different.
- Keep the same clean background and studio lighting style.
- The product stays upright (don't flip it upside down).
- Preserve any text/labels that ARE visible from the new angle — but don't force the front label to appear in every shot.`
            }]
          },
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
            temperature: 0.5,
            topP: 0.95,
            maxOutputTokens: 32768,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: '2K'
            }
          }
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        // Search all parts for image data (Gemini may return text in parts[0] and image in parts[1])
        const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
        if (imagePart) {
          const generatedBase64 = imagePart.inlineData.data
          const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'
          console.log(`  ✅ ${angle.name} done`)
          return {
            angleName: angle.name,
            angleDescription: angle.description,
            promptUsed: prompt,
            imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
            mimeType: generatedMimeType,
          }
        } else {
          console.warn(`  ⚠️  No image for ${angle.name}, using original as fallback`)
          return {
            angleName: angle.name,
            angleDescription: angle.description,
            promptUsed: prompt,
            imageData: productImageData,
            mimeType: productImageMimeType,
          }
        }
      } catch (error) {
        console.error(`  ❌ Error generating ${angle.name}:`, error)
        return {
          angleName: angle.name,
          angleDescription: angle.description,
          promptUsed: prompt,
          imageData: productImageData,
          mimeType: productImageMimeType,
        }
      }
    }))
      results.push(...batchResults)
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
  aspectRatio: string = '1:1',
  imageSize: string = '2K',
  brandGuidelines?: string,
  brandColorDescription?: string // Pre-computed natural-language color description (from DB)
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

    const CONCURRENCY = 3
    console.log(`Generating ${count} ${aspectRatio} backgrounds (${CONCURRENCY} at a time)...`)
    const indices = Array.from({ length: count }, (_, i) => i)
    const results: Awaited<ReturnType<typeof generateBackgrounds>> = []
    for (let b = 0; b < indices.length; b += CONCURRENCY) {
      const batch = indices.slice(b, b + CONCURRENCY)
      const batchResults = await Promise.all(batch.map(async (i) => {
      console.log(`  → Starting background ${i + 1}/${count}...`)

      // Build the background generation prompt
      // Use pre-computed color description if available (saved at upload time in brand_guidelines.color_description)
      const colorDesc = brandColorDescription || ''

      const prompt = `${colorDesc ? `COLOR DIRECTIVE (HIGHEST PRIORITY — read this FIRST):
${colorDesc}
The dominant surface color (wall, backdrop) MUST be this exact color — a confident, clearly visible mid-tone. Not washed out, not pale, not faded, not gray. The hue must be unmistakable and saturated enough to be immediately recognizable.
` : ''}Create a hyper-realistic ${aspectRatio} product photography background — a real photograph, not a render.

Category Style: ${lookAndFeel}

User Request: ${userPrompt}

PHOTOREALISM DIRECTIVES:
- Shot on a high-end DSLR (Canon EOS R5 / Nikon Z9), RAW photo, 8K resolution
- Natural, physically accurate lighting — use soft diffused studio light, ambient window light with gentle shadows, or golden-hour side lighting as appropriate for the scene
- Realistic material textures: visible surface grain on wood, subtle imperfections on concrete, fabric weave on linen, micro-scratches on metal — nothing looks brand-new or computer-generated
- Shallow depth of field where appropriate (f/1.8–f/4) with natural bokeh in the background
- Accurate color science: true-to-life white balance, no oversaturation, no HDR glow
- Subtle lens characteristics: gentle vignetting, minor chromatic aberration at edges — the hallmarks of a real camera lens

ABSOLUTE EXCLUSIONS (negative prompt):
- NO illustration, cartoon, painting, watercolor, sketch, line art
- NO CGI, 3D render, digital art, vector graphics, clip art
- NO artificial/plastic look, uncanny smoothness, or synthetic textures
- NO oversaturated colors, HDR tonemapping artifacts, or neon glow
- NO text, typography, watermarks, logos, or UI elements
- NO products, people, or objects unless the user explicitly requested them

COMPOSITION RULES:
- Background ONLY — clean surface/scene ready for a product to be composited later
- Follow the user's description exactly — do not add unrequested elements
- Leave clear space in the center/foreground for product placement
- Professional e-commerce quality: the image must be indistinguishable from a real studio photograph
- Aspect ratio: ${aspectRatio} (strict)
${colorDesc ? '- Wall/backdrop color is the SINGLE MOST IMPORTANT element — it must match the COLOR DIRECTIVE above' : ''}
${styleReferenceImages && styleReferenceImages.length > 0 ? '- Use the provided reference images as style guidance for colors, mood, and aesthetic' : ''}`

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
          systemInstruction: {
            parts: [{
              text: `You are a world-class commercial product photographer operating in a professional studio.

YOUR CRAFT:
- You shoot with high-end full-frame cameras (Canon EOS R5, Sony A7R V) and premium lenses
- Every image you produce is indistinguishable from a real RAW photograph
- You understand physically accurate lighting: how light wraps around surfaces, how shadows fall naturally, how materials reflect and absorb light
- You never produce anything that looks illustrated, rendered, or digitally generated

QUALITY STANDARD:
- Output must pass as a real photograph to a professional art director
- Textures must be physically accurate: wood grain, fabric weave, stone porosity, metal reflections
- Lighting must be consistent and physically plausible — no floating shadows or impossible reflections
- Colors must be true-to-life with proper white balance — no oversaturation or HDR artifacts`
            }]
          },
          contents: [{
            parts: contentParts
          }],
          generationConfig: {
            temperature: 0.4, // Lower for accurate color/mood matching
            topP: 0.9,
            maxOutputTokens: 32768,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio, // ✅ Enforce aspect ratio
              imageSize: imageSize // ✅ Control output resolution
            }
          }
        }

        // Call Gemini API directly
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`  ❌ Gemini API ${response.status} for ${aspectRatio} bg ${i + 1}:`, errorText.substring(0, 500))
          throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`)
        }

        const data = await response.json()

        // Check for safety/blocked responses
        const candidate = data.candidates?.[0]
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          console.warn(`  ⚠️  Background ${i + 1} finish reason: ${candidate.finishReason}`)
        }

        // Search all parts for image data
        const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData?.data)
        if (imagePart) {
          const generatedBase64 = imagePart.inlineData.data
          const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'
          console.log(`  ✅ Background ${i + 1} done (${aspectRatio})`)
          return {
            promptUsed: prompt,
            imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
            mimeType: generatedMimeType,
          }
        } else {
          const responsePreview = JSON.stringify(data).substring(0, 300)
          console.warn(`  ⚠️  No image in response for ${aspectRatio} background ${i + 1}. Response: ${responsePreview}`)
          throw new Error(`No image generated for ${aspectRatio}`)
        }
      } catch (error) {
        console.error(`  ❌ Error generating ${aspectRatio} background ${i + 1}:`, error instanceof Error ? error.message : error)
        return null
      }
    }))
      results.push(...batchResults.filter((r): r is NonNullable<typeof r> => r !== null))
    }

    if (results.length === 0) {
      throw new Error('All background generation requests failed')
    }

    if (results.length < count) {
      console.warn(`Backgrounds: ${results.length}/${count} succeeded (${count - results.length} failed)`)
    }

    return results
  } catch (error) {
    console.error('Error generating backgrounds:', error)
    throw new Error('Failed to generate backgrounds')
  }
}

/**
 * Re-generate an existing background image in a different aspect ratio.
 * Sends the source image to Gemini as inline_data and asks it to create
 * a variation in the target aspect ratio without changing design details.
 */
export async function regenerateBackgroundInFormat(
  sourceImageData: string,
  sourceMimeType: string,
  targetAspectRatio: string,
  imageSize: string = '2K'
): Promise<{
  promptUsed: string
  imageData: string
  mimeType: string
}> {
  const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || ''
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

  const base64Data = sourceImageData.replace(/^data:image\/\w+;base64,/, '')

  const prompt = `Create a variation of this image in ${targetAspectRatio} aspect ratio without changing any design details or causing distortion. Return a high-quality image.`

  const requestBody = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: sourceMimeType,
            data: base64Data,
          },
        },
        {
          text: prompt,
        },
      ],
    }],
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 32768,
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: targetAspectRatio,
        imageSize,
      },
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  })
  clearTimeout(timeout)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()

  const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
  if (!imagePart) {
    throw new Error('No image generated in response')
  }

  const generatedBase64 = imagePart.inlineData.data
  const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'

  return {
    promptUsed: prompt,
    imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
    mimeType: generatedMimeType,
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

COMPOSITING INSTRUCTIONS:

WHAT YOU SHOULD DO:
✓ ${safeZones && safeZones.length > 0 ? 'POSITION THE PRODUCT WITHIN THE SPECIFIED SAFE ZONE - This is the most important requirement!' : 'Place the product NATURALLY in the background scene'}
✓ ${userPrompt ? `Follow user instruction: ${userPrompt}` : 'Position the product naturally in the scene'}
✓ Match the product's lighting to the background's lighting
✓ Add natural shadows and reflections where the product touches surfaces
✓ Make it look like the product was photographed IN that background, not pasted on
✓ Adjust depth of field to make the composition feel cohesive
✓ Scale the product appropriately for the scene ${safeZones ? '(while keeping it within the safe zone)' : ''}

WHAT YOU MUST NOT DO:
✗ Do NOT change the background model/person's appearance
✗ Do NOT modify the product's colors or design
✗ Do NOT change the core elements of either image
✗ Do NOT add any NEW text that does not already exist on the product — no headlines, taglines, CTAs, slogans, watermarks, captions, or any overlaid copy whatsoever
✗ Do NOT add any typographic elements, titles, or editorial text to the image

NOTE ON ADDED TEXT: This composite is the visual foundation of an ad. Headlines, hooks, and CTAs will be added in a later production stage. Do NOT bake any overlay text into this image.

⚠️ HIGHEST PRIORITY — PRODUCT FIDELITY (READ THIS LAST, REMEMBER IT FIRST):
The product in Image 1 has text printed on its packaging — brand name, product name, ingredient lists, certifications, and other label text. This text is PART OF THE PHYSICAL PRODUCT. It is NOT overlay text. It is NOT a headline or caption.

You MUST reproduce every word, letter, and character visible on the product packaging EXACTLY as shown in Image 1. Do not alter, rearrange, blur, simplify, omit, or re-render any text that is part of the product surface. The label must be pixel-faithful to the input.

If you are unsure whether something is "product text" or "overlay text" — if it appears in Image 1 on the product surface, it is product text and MUST be preserved exactly.

Return a professional, advertisement-quality composite photograph.`

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
      systemInstruction: {
        parts: [{
          text: `You are a professional photo compositor specializing in product photography.

YOUR JOB: Take a product and a background scene and composite them into a single, realistic photograph — as if the product was physically placed and photographed in that scene.

ABSOLUTE RULES:
- The product is SACRED. Every label, every word, every letter, every logo, every color on the product packaging MUST appear in the final composite EXACTLY as it appears in the input image. This includes ingredient lists, brand names, product names, taglines printed on the packaging, barcodes, certification marks — every single visual element on the product surface.
- You are NOT a graphic designer. You do NOT add any text, headlines, captions, watermarks, or typographic elements to the image. Your output is purely photographic — a product sitting in a scene, nothing more.
- The background scene is also fixed. Do not alter people, hands, props, or environmental elements in the background.

Think of yourself as operating a camera, not Photoshop. You photograph what exists — you do not create or destroy visual information on the product.`
        }]
      },
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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // Search all parts for image data
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
    if (imagePart) {
      const generatedBase64 = imagePart.inlineData.data
      const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'

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

// ── Copy generation (Gemini Flash) ───────────────────────────────────────────

function buildCopySystemPrompt(
  lookAndFeel?: string,
  brandGuidelines?: string,
  brandVoice?: BrandVoiceProfile | null
): string {
  let system = `You are an expert copywriter specialising in e-commerce and performance marketing. You write copy that converts.`
  if (lookAndFeel) system += `\n\nBRAND STYLE: ${lookAndFeel}`
  if (brandGuidelines) system += `\n\nBRAND GUIDELINES (from uploaded brand document — follow these closely):\n${brandGuidelines}`
  if (brandVoice) {
    system += `\n\n${formatBrandVoiceForPrompt(brandVoice)}`
    system += `\n\nThe brand voice profile above is the most important context. Every word you write must align with it.`
  }
  system += `\n\nReturn ONLY the copy text itself — no explanations, no labels, no quotes around it.`
  return system
}

function buildCopyUserPrompt(
  brief: string,
  copyType: string,
  tone?: string,
  targetAudience?: string
): string {
  let prompt = `Write a ${copyType} for:\n${brief}\n\n`
  if (tone) prompt += `Tone: ${tone}\n\n`
  if (targetAudience) prompt += `Target Audience: ${targetAudience}\n\n`
  prompt += `Requirements:\n`
  switch (copyType) {
    case 'hook':
      prompt += `- Write a compelling 1-2 sentence hook\n- Grab attention immediately\n- Max 280 characters`; break
    case 'cta':
      prompt += `- Write a strong call-to-action\n- Action-oriented and persuasive\n- Max 50 characters`; break
    case 'headline':
      prompt += `- Write a powerful headline\n- Clear benefit or emotional trigger\n- Max 100 characters`; break
    case 'tagline':
      prompt += `- Write a memorable tagline\n- Concise, catchy, brand-aligned\n- Max 80 characters`; break
    case 'body':
      prompt += `- Write persuasive body copy\n- 2-4 short paragraphs\n- Focus on benefits, not features\n- Max 500 words`; break
  }
  return prompt
}

export async function generateCopyVariationsGemini(
  brief: string,
  copyType: CopyType,
  lookAndFeel: string,
  count: number = 1,
  tone?: string,
  targetAudience?: string,
  brandGuidelines?: string,
  brandVoice?: BrandVoiceProfile | null
): Promise<CopyVariation[]> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: buildCopySystemPrompt(lookAndFeel, brandGuidelines, brandVoice),
  })
  const prompt = buildCopyUserPrompt(brief, copyType, tone, targetAudience)
  const results: CopyVariation[] = []
  for (let i = 0; i < count; i++) {
    const result = await model.generateContent(prompt)
    results.push({ promptUsed: prompt, generatedText: result.response.text() })
  }
  return results
}

export async function generateCopyKitGemini(
  brief: string,
  copyTypes: CopyType[],
  tones: string[],
  lookAndFeel: string,
  targetAudience?: string,
  brandGuidelines?: string,
  brandVoice?: BrandVoiceProfile | null
): Promise<CopyKitItem[]> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: buildCopySystemPrompt(lookAndFeel, brandGuidelines, brandVoice),
  })

  const combinations: { copyType: CopyType; tone: string }[] = []
  for (const copyType of copyTypes) {
    for (const tone of tones) {
      combinations.push({ copyType, tone })
    }
  }

  const settled = await Promise.allSettled(
    combinations.map(async ({ copyType, tone }) => {
      const prompt = buildCopyUserPrompt(brief, copyType, tone, targetAudience)
      const result = await model.generateContent(prompt)
      return { copyType, tone, promptUsed: prompt, generatedText: result.response.text() } as CopyKitItem
    })
  )

  const results = settled
    .filter((r): r is PromiseFulfilledResult<CopyKitItem> => r.status === 'fulfilled')
    .map((r) => r.value)

  const failures = settled.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    console.warn(`Copy kit (Gemini): ${failures.length}/${settled.length} combinations failed`)
  }

  if (results.length === 0) {
    const firstFailure = failures[0] as PromiseRejectedResult
    const reason = firstFailure?.reason instanceof Error
      ? firstFailure.reason.message
      : String(firstFailure?.reason ?? 'Unknown error')
    throw new Error(`All copy generation requests failed: ${reason}`)
  }

  return results
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
