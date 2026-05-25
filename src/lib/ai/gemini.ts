import { GoogleGenerativeAI } from '@google/generative-ai'
import { ANGLE_VARIATIONS } from './angle-variations'
import type { BrandVoiceProfile } from './brand-voice'
import { formatBrandVoiceForPrompt } from './brand-voice'
import type { CopyType, CopyVariation, CopyKitItem } from './openai'
import { sanitizeForPrompt } from './sanitize'

// Image generation (angled shots, backgrounds, composites, reformat) uses REST API to
// generativelanguage.googleapis.com .../generateContent — intentionally not the SDK —
// to preserve image quality and aspect-ratio control across formats (1:1, 16:9, 9:16, 4:5).

const GEMINI_RETRY_STATUSES = [429, 503]
const GEMINI_RETRY_ATTEMPTS = 3
const GEMINI_RETRY_INITIAL_MS = 2000

/**
 * Call Gemini REST API with retry on 429 (rate limit) and 503 (unavailable).
 * Exponential backoff: 2s, 4s, 8s.
 */
async function fetchGeminiWithRetry(
  url: string,
  options: RequestInit,
  apiKey: string
): Promise<Response> {
  let lastResponse: Response | null = null
  for (let attempt = 1; attempt <= GEMINI_RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90_000)
    const mergedOptions: RequestInit = { ...options, signal: options.signal ?? controller.signal }
    let res: Response
    try {
      res = await fetch(url, mergedOptions)
    } finally {
      clearTimeout(timeoutId)
    }
    lastResponse = res
    if (res.ok || !GEMINI_RETRY_STATUSES.includes(res.status)) {
      return res
    }
    if (attempt === GEMINI_RETRY_ATTEMPTS) {
      return res
    }
    const delayMs = GEMINI_RETRY_INITIAL_MS * Math.pow(2, attempt - 1)
    console.warn(`Gemini API ${res.status}, retry ${attempt}/${GEMINI_RETRY_ATTEMPTS} in ${delayMs}ms`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  return lastResponse!
}

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
    /** True when the API failed or returned no image; original product image was used instead. */
    fallbackToOriginal?: boolean
  }>
> {
  try {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || ''
    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
    }

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent'

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

      const safePrompt = sanitizeForPrompt(lookAndFeel || '')
      const prompt = `TASK: Re-photograph this product from a COMPLETELY DIFFERENT camera angle.

ONLY THE CAMERA ANGLE CHANGES. Nothing else.
- Do NOT change the background — keep the exact same background (color, texture, style) as the input image.
- Do NOT modify, add, or remove any logo on the product — logos stay exactly as they are.
- Do NOT modify, add, or remove any text on the product — all labels, text, and copy must be reproduced exactly as in the input (same characters, font, placement). If a face is not visible from the new angle, do not invent text there.
- Do NOT change lighting style, colors, or materials — only the viewpoint (camera position) changes.
You are moving the camera around a fixed scene. The product, background, logo, and all text are unchanged.

CAMERA POSITION:
${angle.prompt}

Target view: ${angle.description}
${safePrompt ? `\nSTYLE: ${safePrompt}` : ''}

The output MUST show a visually distinct perspective (different camera angle only). If the input shows the front and the target is a side view, the front label may be partly or fully out of view — that is correct. Generate a high-quality professional product photograph from this exact camera angle.`

      try {
        const requestBody = {
          systemInstruction: {
            parts: [{
              text: `You are a professional product photographer with a camera on a turntable rig.

YOUR ONLY JOB: Move the camera to a new position and take a photograph from that new angle. Nothing else may change.

STRICT RULES — ONLY CAMERA ANGLE CHANGES:
- BACKGROUND: Do NOT change the background. Keep the exact same background as the input (same color, same texture, same style). No new backgrounds, no gradients, no added shadows or scenery.
- LOGO: Do NOT modify, add, or remove any logo on the product. Logos must stay exactly as in the input.
- PRODUCT TEXT: Do NOT alter, add, or remove any text on the product. All labels, copy, and text must be reproduced exactly as in the original — same characters, same font, same placement. If you cannot read it from the new angle, keep it blurred or out of view; never guess or invent text.
- PRODUCT: Same product — same shape, colors, materials, brand. No changes.
- LIGHTING: Preserve the same lighting style as the input. Do not add or change lighting effects.
- The product stays on the turntable; you only move the camera. When the camera moves to the side or back, the front label may be partly or fully hidden — that is correct. Different angles reveal different faces; do not force the front label into shots where it would naturally be hidden.`
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
              imageSize: '4K'
            }
          }
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)

        const response = await fetchGeminiWithRetry(
          `${GEMINI_API_URL}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': GEMINI_API_KEY,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          },
          GEMINI_API_KEY
        )
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
        }

        const data = await response.json()

        // Search all parts for image data (Gemini may return text in parts[0] and image in parts[1])
        const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
        if (imagePart) {
          const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'
          const generatedBase64 = imagePart.inlineData.data
          console.log(`  ✅ ${angle.name} done`)
          return {
            angleName: angle.name,
            angleDescription: angle.description,
            promptUsed: prompt,
            imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
            mimeType: generatedMimeType,
            fallbackToOriginal: false,
          }
        } else {
          console.warn(`  ⚠️  No image for ${angle.name}, using original as fallback`)
          return {
            angleName: angle.name,
            angleDescription: angle.description,
            promptUsed: prompt,
            imageData: productImageData,
            mimeType: productImageMimeType,
            fallbackToOriginal: true,
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
          fallbackToOriginal: true,
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
 *
 * CHANGELOG (shadow/light integration pass):
 * - Added requestsWindowLight detection flag for hard directional shadow mode
 * - Replaced generic lighting directive with conditional: soft editorial vs hard window-light
 * - Added SURFACE ARCHITECTURE block for compositing-ready L-cove backgrounds
 * - Temperature raised 0.4 → 0.6 for non-flat backgrounds (more shadow geometry latitude)
 * - System prompt appended with shadow geometry priority directive
 */
export async function generateBackgrounds(
  userPrompt: string,
  lookAndFeel: string,
  count: number = 1,
  styleReferenceImages?: Array<{ data: string; mimeType: string }>,
  aspectRatio: string = '1:1',
  imageSize: string = '4K',
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

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent'

    const safeLookAndFeel = sanitizeForPrompt(lookAndFeel || '')
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
      const safeUserPrompt = sanitizeForPrompt(userPrompt || '')

      // Detect flat/solid color requests — these must bypass all photorealism/shadow directives
      const isFlatColor = /\b(solid|flat|plain|no[- ]texture|no[- ]shadow|no[- ]gradient|uniform|pure\s+color)\b/i.test(safeUserPrompt)

      // Detect when the user explicitly requests people, faces, or models in the scene
      const requestsPeople = /\b(female|male|woman|man|girl|boy|person|people|model|face|portrait|human|child|kid|baby|lady|gentleman|couple|group)\b/i.test(safeUserPrompt)

      // Detect editorial window-light / hard directional shadow requests
      // Triggers hard-edged geometric shadow mode instead of soft Rembrandt lighting
      const requestsWindowLight = /\b(window|sunlight|sun|shadow|dapple|dappled|geometric|hard\s+light|direct\s+light|natural\s+light|afternoon|morning\s+light)\b/i.test(safeUserPrompt)

      // Conditional lighting directive — the core quality split
      const lightingDirective = requestsWindowLight
        ? `LIGHTING — HARD DIRECTIONAL SUNLIGHT (editorial window-light style):
- The primary light source is DIRECT SUNLIGHT entering through a window or opening, coming from one consistent side (upper-left or upper-right — pick one and commit to it for the entire scene)
- This creates HARD-EDGED shadows with crisp, well-defined edges — not soft, not feathered, not diffused. Think midday sun through a window frame, not a softbox or studio strobe
- TWO SHADOW TYPES must coexist in the scene: (1) STRUCTURED GEOMETRIC SHADOWS — window frame bars, architectural lines, or grid elements casting clean rectangular shadow patterns across the wall and surface; (2) ORGANIC SHADOW PATTERNS — leaf, branch, or plant silhouettes casting dappled natural patterns across the foreground surface
- Shadow density must be real: unlit areas are noticeably darker (40–60% luminosity reduction vs lit areas). Shadows must have genuine visual weight, not be pale ghost-shadows
- Where direct sun hits the surface, it creates a warm bright patch with a slightly warmer color temperature in that zone only — warm highlights against a cool-neutral ambient
- The overall scene color is cool-neutral; only the direct sunlight patches shift warm — this warm/cool contrast is the defining quality of real sunlight through glass
- COMPOSITING-READY GEOMETRY: Shadow patterns must be strong, directional, and consistent across the entire scene — committed to a single light source angle — so that when a product is placed in the scene, those same shadows naturally continue across it without any prompt engineering needed in the composite step`
        : `LIGHTING — CINEMATIC EDITORIAL STYLE:
- Directional key light from one side creating dimensional shadows and depth, with subtle fill light on the opposite side. Think Rembrandt or butterfly lighting setups used in editorial product photography
- Rich tonal depth: deep shadows that aren't crushed, creamy highlights that aren't blown — the kind of dynamic range you see in a Kinfolk or Cereal Magazine spread
- Atmospheric quality: a sense of environment and mood — morning light filtering through a window, warm afternoon glow on a surface, cool studio ambiance
- Cohesive color grading: slightly warm or cool tone that unifies the entire scene — like a color-graded film still, not a flat snapshot`

      const prompt = isFlatColor
        ? `Generate a completely flat, uniform solid color background image.

Exact color specification: ${safeUserPrompt}

STRICT REQUIREMENTS — NO EXCEPTIONS:
- Completely flat, 100% uniform fill — every pixel the same color
- NO shadows of any kind — no cast shadows, no self-shadows, no ambient occlusion
- NO gradients — no light-to-dark transitions anywhere
- NO textures — no grain, no fabric weave, no surface imperfections, no bump
- NO lighting effects — no highlights, no specular, no diffused light, no vignetting
- NO depth of field, no bokeh, no lens effects
- NO objects, no surfaces, no scenes — pure flat color fill only
- Aspect ratio: ${aspectRatio} (strict)`
        : `${colorDesc ? `COLOR DIRECTIVE (HIGHEST PRIORITY — read this FIRST):
${colorDesc}
The dominant surface color (wall, backdrop) MUST be this exact color — a confident, clearly visible mid-tone. Not washed out, not pale, not faded, not gray. The hue must be unmistakable and saturated enough to be immediately recognizable.
` : ''}Create a hyper-realistic ${aspectRatio} product photography background — a real photograph, not a render.

Category Style: ${safeLookAndFeel}

User Request: ${safeUserPrompt}

PHOTOREALISM & CINEMATIC QUALITY DIRECTIVES:
- Shot on a high-end DSLR (Canon EOS R5 / Nikon Z9) with a premium prime lens (50mm f/1.4 or 85mm f/1.2), RAW photo, 8K resolution
${lightingDirective}
- Realistic material textures: visible surface grain on wood, subtle imperfections on concrete, fabric weave on linen, micro-scratches on metal — nothing looks brand-new or computer-generated
- Shallow depth of field (f/1.4–f/2.8) with natural, creamy bokeh — the foreground surface should be sharp where the product will sit, with a gentle fall-off into soft blur toward the edges
- Subtle lens characteristics: gentle vignetting drawing the eye inward, minor chromatic aberration at edges — the hallmarks of a real camera lens

SURFACE ARCHITECTURE:
- Use an L-shaped infinity cove composition where possible — a horizontal surface meeting a vertical back wall at a gentle corner, creating natural depth and a clear foreground product placement zone
- The surface material should be matte or low-sheen (painted plaster, matte concrete, linen, flat-painted wood) — not glossy, not mirror-reflective, not heavily rustic or reclaimed-looking
- The surface and back wall should share the same color family (monochromatic or near-monochromatic), creating a unified tonal field across which shadow patterns can play
- Clear foreground-to-background depth: the front edge of the surface is the sharpest zone (where the product will be placed), with the back wall in soft but readable focus
- Leave generous empty space in the center-foreground of the surface — this is the product placement zone. Do not fill it with props or objects

ABSOLUTE EXCLUSIONS (negative prompt):
- NO illustration, cartoon, painting, watercolor, sketch, line art
- NO CGI, 3D render, digital art, vector graphics, clip art
- NO artificial/plastic look, uncanny smoothness, or synthetic textures
- NO oversaturated colors, HDR tonemapping artifacts, or neon glow
- NO text, typography, watermarks, logos, or UI elements
${requestsPeople ? '- NO products or objects unless the user explicitly requested them' : '- NO products, people, or objects unless the user explicitly requested them'}

COMPOSITION RULES:
${requestsPeople
  ? `- Follow the user's description EXACTLY — the user has explicitly requested a person/face in this image, so you MUST include them as described
- The person/face is the PRIMARY subject of this image — do not omit, obscure, or replace them
- Do not add unrequested elements (tables, products, props) that the user did not ask for`
  : `- Background ONLY — clean surface/scene ready for a product to be composited later
- Follow the user's description exactly — do not add unrequested elements
- Leave clear space in the center/foreground for product placement`}
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
              text: isFlatColor
                ? `You are a graphic designer generating flat solid color swatches for use as product ad backgrounds.
Your only task is to produce a perfectly uniform, flat fill of the exact requested color.
There must be zero shadows, zero gradients, zero textures, zero lighting effects — just a pure, solid, single-color rectangle.
Do not add any photographic or painterly qualities. The output is a flat color chip, nothing more.`
                : `You are an elite editorial product photographer — the kind whose work appears in premium lifestyle magazines like Kinfolk, Cereal, and Vogue Living.

YOUR CRAFT:
- You shoot with high-end full-frame cameras (Canon EOS R5, Sony A7R V) and premium prime lenses (50mm f/1.4, 85mm f/1.2)
- Every image you produce is indistinguishable from a real RAW photograph — cinematic, rich, and intentional
- You understand physically accurate lighting: how light wraps around surfaces, how shadows fall naturally, how materials reflect and absorb light
- You create images with mood and atmosphere — not just technically correct, but emotionally compelling
- You use directional lighting and shallow depth of field to create dimension and draw the viewer's eye
- You never produce anything that looks illustrated, rendered, or digitally generated
${requestsPeople ? `- When the user requests a person, model, or face in the scene, you MUST include them exactly as described — they are the subject, not an optional element` : ''}

QUALITY STANDARD:
- Output must pass as a real photograph to a professional art director at a luxury brand
- Textures must be physically accurate: wood grain, fabric weave, stone porosity, metal reflections
- Lighting must be cinematic and intentional — directional key light with subtle fill, not flat even lighting
- Colors must have cohesive grading: a unified warm or cool tone that gives the image editorial character
- The image should evoke a feeling — warmth, luxury, freshness, calm — not just show a surface

SHADOW GEOMETRY IS THE MOST IMPORTANT QUALITY SIGNAL. A background with soft, even lighting is technically correct but compositionally weak — it gives the compositor nothing to work with. The most powerful product photography backgrounds have strong, committed light sources that create clear shadow geometry across the scene. This shadow geometry is what makes the composite step succeed: when a product is placed in the scene, those same shadows naturally fall across it, making the composite look like a single photograph rather than a paste-in. Always commit to a clear, single light source. Make the shadows count.`
            }]
          },
          contents: [{
            parts: contentParts
          }],
          generationConfig: {
            temperature: isFlatColor ? 0.1 : 0.6, // Flat color: near-zero variance. Editorial: balanced for shadow geometry latitude
            topP: 0.9,
            maxOutputTokens: 32768,
            responseModalities: ['IMAGE'],
            imageConfig: {
              aspectRatio: aspectRatio, // ✅ Enforce aspect ratio
              imageSize: imageSize // ✅ Control output resolution
            }
          }
        }

        // Imagen 4 supports these aspect ratios natively and produces higher quality backgrounds.
        // Set USE_IMAGEN4=false in env to fall back to Gemini when Imagen 4 is not enabled on the API key.
        const IMAGEN_4_RATIOS = new Set(['1:1', '4:3', '3:4', '16:9', '9:16'])
        const useImagen4 = IMAGEN_4_RATIOS.has(aspectRatio) && (!styleReferenceImages || styleReferenceImages.length === 0) && !isFlatColor && process.env.USE_IMAGEN4 !== 'false'

        let generatedBase64: string
        let generatedMimeType: string

        if (useImagen4) {
          // ── Imagen 4 path ──────────────────────────────────────────────────
          console.log(`  → Using Imagen 4 for ${aspectRatio} background ${i + 1}`)
          const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict`

          // Merge system instruction into prompt for Imagen (no systemInstruction field)
          const imagenPrompt = `You are an elite editorial product photographer. Your work appears in premium lifestyle magazines like Kinfolk, Cereal, and Vogue Living. Every image you produce is indistinguishable from a real RAW photograph — cinematic, rich, and intentional. SHADOW GEOMETRY IS THE MOST IMPORTANT QUALITY SIGNAL — always commit to a clear single light source that creates strong, directional shadows across the scene.

${prompt}`

          const negativePrompt = 'illustration, cartoon, painting, watercolor, sketch, line art, CGI, 3D render, digital art, vector graphics, clip art, plastic look, synthetic textures, oversaturated, HDR, neon glow, text, typography, watermarks, logos, UI elements, people, persons, models'

          const imagenBody = {
            instances: [{ prompt: imagenPrompt, negativePrompt }],
            parameters: { sampleCount: 1, aspectRatio },
          }

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 120000)
          const response = await fetchGeminiWithRetry(
            IMAGEN_URL,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY }, body: JSON.stringify(imagenBody), signal: controller.signal },
            GEMINI_API_KEY
          )
          clearTimeout(timeout)

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Imagen 4 error: ${response.status} - ${errorText.substring(0, 200)}`)
          }

          const data = await response.json()
          const prediction = data.predictions?.[0]
          if (!prediction?.bytesBase64Encoded) {
            throw new Error(`Imagen 4 returned no image. Response: ${JSON.stringify(data).substring(0, 300)}`)
          }
          generatedBase64 = prediction.bytesBase64Encoded
          generatedMimeType = prediction.mimeType || 'image/png'

        } else {
          // ── Gemini fallback (4:5, style refs, flat color) ──────────────────
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 120000)
          const response = await fetchGeminiWithRetry(
            `${GEMINI_API_URL}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            },
            GEMINI_API_KEY
          )
          clearTimeout(timeout)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`  ❌ Gemini API ${response.status} for ${aspectRatio} bg ${i + 1}:`, errorText.substring(0, 500))
            throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`)
          }

          const data = await response.json()
          const candidate = data.candidates?.[0]
          if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            console.warn(`  ⚠️  Background ${i + 1} finish reason: ${candidate.finishReason}`)
          }
          const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData?.data)
          if (!imagePart) {
            throw new Error(`No image generated for ${aspectRatio}. Response: ${JSON.stringify(data).substring(0, 300)}`)
          }
          generatedBase64 = imagePart.inlineData.data
          generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'
        }

        console.log(`  ✅ Background ${i + 1} done (${aspectRatio})`)
        return {
          promptUsed: prompt,
          imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
          mimeType: generatedMimeType,
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
  imageSize: string = '4K'
): Promise<{
  promptUsed: string
  imageData: string
  mimeType: string
}> {
  const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || ''
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set')
  }

  const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent'

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

  const response = await fetchGeminiWithRetry(
    `${GEMINI_API_URL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    },
    GEMINI_API_KEY
  )
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

  const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'
  const generatedBase64 = imagePart.inlineData.data

  return {
    promptUsed: prompt,
    imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
    mimeType: generatedMimeType,
  }
}

/**
 * STEP 1 OF 2 — Product cutout extraction (temperature 0.4, fidelity-locked)
 *
 * Extracts the product from its background as a transparent PNG cutout.
 * Run at low temperature — zero creative latitude, zero label risk.
 *
 * Transparent output (not white) is critical: white pixels around the product
 * edges cause fringing/halos when composited onto dark or saturated backgrounds.
 * A transparent PNG gives Step 2 only the product pixels, so the scene
 * background fills in behind them with zero blending artifacts.
 *
 * This is an internal helper called by generateComposite only. The cutout
 * feeds straight into Step 2. If extraction fails, falls back to the original
 * product image so the composite pipeline can still complete.
 *
 * Why this architecture: the background (generated at 0.7) already contains
 * strong committed shadow geometry. The composite step (0.5) only needs to
 * place + blend — it does not need to invent lighting. All creative latitude
 * is absorbed by background generation which has zero fidelity risk.
 */
async function extractProductCutout(
  productImageData: string,
  productImageMimeType: string,
  GEMINI_API_KEY: string,
  GEMINI_API_URL: string
): Promise<{ imageData: string; mimeType: string }> {
  const base64Data = productImageData.replace(/^data:image\/\w+;base64,/, '')

  const requestBody = {
    systemInstruction: {
      parts: [{
        text: `You are a precision product masking tool — not a photographer, not a designer.

YOUR ONLY JOB: Isolate the product from its background and return it as a transparent PNG cutout — no background color whatsoever.

WHY TRANSPARENCY MATTERS: This cutout will be composited onto a coloured scene background in the next step. Any white or coloured fill around the product edges will cause fringing, halos, or blending artifacts against the scene. The output must have a fully transparent alpha channel around the product so the scene fills in naturally behind it.

STRICT RULES:
- Keep the product 100% intact: every pixel of the product surface, label, logo, text, cap, lid, and packaging must be preserved exactly as in the input. No exceptions.
- Do NOT retouch, enhance, smooth, or alter the product in any way. No color correction, no sharpening, no creative interpretation.
- Do NOT change any text on the product label — not a single character. Reproduce it exactly.
- Do NOT change any logo — reproduce it exactly as in the input.
- Remove ONLY the background (the environment, surface, shadows, props around the product). Nothing else.
- Output format: PNG with full alpha channel transparency. Every pixel outside the product boundary must be fully transparent (alpha = 0). No white fill, no grey fill, no drop shadow, no background of any kind.
- The product should occupy approximately 40–50% of the frame height, centered horizontally and vertically within the transparent canvas, with generous transparent padding on all four sides.
- Output: the product pixels only, everything else transparent. Nothing more.`
      }]
    },
    contents: [{
      parts: [
        { inline_data: { data: base64Data, mime_type: productImageMimeType } },
        { text: `Extract this product as a transparent PNG cutout — fully transparent background, no white fill, no drop shadow. Preserve every detail of the product surface exactly as shown: all text, logos, colors, and packaging. Remove only the surrounding environment, leaving pure alpha transparency around the product.` }
      ]
    }],
    generationConfig: {
      temperature: 0.4, // Low: conservative, fidelity-locked — no creative latitude
      topP: 0.85,
      maxOutputTokens: 32768,
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1', imageSize: '4K' }
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  const response = await fetchGeminiWithRetry(
    GEMINI_API_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    },
    GEMINI_API_KEY
  )
  clearTimeout(timeout)

  if (!response.ok) {
    const errorText = await response.text()
    // Fall back to the original product image so compositing can still proceed.
    // This handles expired keys, quota errors, or model unavailability gracefully.
    console.warn(`  ⚠️  Cutout extraction failed (${response.status}), falling back to original product image: ${errorText.substring(0, 100)}`)
    return { imageData: productImageData, mimeType: productImageMimeType }
  }

  const data = await response.json()
  const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)

  if (!imagePart) {
    console.warn('  ⚠️  Cutout extraction returned no image — falling back to original product image')
    return { imageData: productImageData, mimeType: productImageMimeType }
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png' // PNG preserves alpha transparency
  console.log('  ✅ Step 1 complete: product cutout extracted (transparent PNG)')
  return {
    imageData: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    mimeType,
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
 *
 * CHANGELOG (shadow/light integration pass):
 * - NOW A TWO-CALL PIPELINE: Step 1 extracts product cutout at temp 0.4
 *   (fidelity-locked), Step 2 composites cutout into scene at temp 0.7
 *   (full lighting integration latitude). Label fidelity and shadow quality
 *   are no longer a tradeoff — each call is optimised for exactly one job.
 * - Replaced generic shadow instruction with SCENE SHADOW CONTINUATION directive
 * - Added LIGHT SOURCE ANALYSIS block (direction, color temp, shadow geometry)
 * - Added SHADOW WRAPPING directive (shadows wrap around cylindrical geometry)
 * - Added AMBIENT COLOR MODULATION directive (label picks up scene color temp)
 * - System prompt: LIGHTING INTEGRATION IS YOUR PRIMARY TASK paragraph
 * - System prompt: clarified "faithful" = label design, not studio-lit appearance
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
  canvasWidth: number = 1080,
  canvasHeight: number = 1080
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

    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent'

    // ── STEP 1: Extract product cutout at temp 0.4 (fidelity-locked) ──────────
    // Isolates the product on a clean white background before any creative work.
    // Locks label text, logo, and all packaging details at conservative temperature
    // so Step 2 can freely focus on lighting integration at 0.5 with zero risk
    // of label hallucination. Fidelity vs shadow quality tradeoff is eliminated:
    // each call is now optimised for exactly one job.
    console.log('  → Step 1/2: Extracting product cutout (fidelity-locked at temp 0.4)...')
    const cutout = await extractProductCutout(
      productImageData,
      productImageMimeType,
      GEMINI_API_KEY,
      GEMINI_API_URL
    )
    console.log('  → Step 2/2: Compositing into scene (lighting integration at temp 0.5)...')

    // Build safe zone instructions if provided
    let safeZoneInstructions = ''
    if (safeZones && safeZones.length > 0) {
      const productSafeZone = safeZones.find(z => z.type === 'safe' && z.name.toLowerCase().includes('product'))
      const restrictedZones = safeZones.filter(z => z.type === 'restricted')

      if (productSafeZone) {
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

    // Detect whether the user instruction involves person-product interaction.
    // When true, the "do not change person" rule is relaxed so the model can
    // adapt hands, arms, gaze, and expression to naturally hold/interact with the product.
    const rawPromptLower = (userPrompt || '').toLowerCase()
    const personInteraction = /\b(hand|palm|hold|holding|held|grab|grasp|arm|finger|point|pointing|face|look|looking|eye|eyes|gaze|pose|gesture|hug|carry|reach|extend)\b/.test(rawPromptLower)
    type PlacementContext = { label: string; maxHeightPct: number; minSceneAbovePct: number; cameraNote: string }
    const placementContext: PlacementContext = (() => {
      if (/\b(hand|palm|holding|hold|finger|grasp|grip|arm)\b/.test(rawPromptLower)) {
        return { label: 'hand-held', maxHeightPct: 20, minSceneAbovePct: 40,
          cameraNote: 'The product rests in or on the person\'s hand. CRITICAL SCALE RULE: a real supplement bottle is roughly 10cm tall. When a person holds it and you can see their full upper body, the bottle is a SMALL detail — it should look like a real object, not a prop. Bottle height ≤ 20% of frame. The hand placement style should match exactly what the user instruction says — do not invent a grip or pose beyond what was asked.' }
      }
      if (/\b(floor|ground|mat|rug|carpet|grass)\b/.test(rawPromptLower)) {
        return { label: 'floor-placed', maxHeightPct: 30, minSceneAbovePct: 40,
          cameraNote: 'Product placed on the floor — photographed from standing height, product appears small in the frame.' }
      }
      if (/\b(table|shelf|counter|surface|desk|tray|basket|bowl|windowsill|sill|bench)\b/.test(rawPromptLower)) {
        return { label: 'surface-placed', maxHeightPct: 40, minSceneAbovePct: 25,
          cameraNote: 'Product on a surface — camera at 1.5–2 metres, table-top lifestyle shot, product is a clear subject but not dominating.' }
      }
      return { label: 'scene-placed', maxHeightPct: 40, minSceneAbovePct: 25,
        cameraNote: 'Camera at 1.5–2 metres — normal table-top lifestyle shot, NOT a close-up or macro.' }
    })()

    // Build the composite generation prompt
    const safeUserPrompt = sanitizeForPrompt(userPrompt || '')

    // Escape hatch for hand-held placement: give Gemini two explicit options
    // so it doesn't silently fall back to "place it nearby on the floor."
    const handPlacementEscapeHatch = placementContext.label === 'hand-held' ? `
PLACEMENT OPTIONS — pick whichever looks most natural in this specific scene:
  Option A: Place the product on the nearest surface (mat/floor/table) directly in front of or beside the person, as if they just set it down.
  Option B: Gently adapt one of the person's hands so it rests palm-up, and place the product resting in that open palm.
  → Choose the option that requires the least change to the background scene.
  → Do NOT place the product floating mid-air, awkwardly leaning against the person, or off to the side with no connection to them.` : ''

    const prompt = `Image 1: product cutout (shown large for detail — IGNORE THIS SIZE when compositing, scale it down).
Image 2: background scene.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 1 — SIZE (the only unbreakable rule):
Product height ≤ ${placementContext.maxHeightPct}% of frame (≤ ${Math.round(canvasHeight * placementContext.maxHeightPct / 100)}px on ${canvasHeight}px). When in doubt, go smaller.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 2 — PLACEMENT:
${safeUserPrompt ? `User instruction: ${safeUserPrompt}` : 'Place the product naturally in the scene.'}${handPlacementEscapeHatch}
${safeZones && safeZones.length > 0 ? safeZoneInstructions : ''}
At least ${placementContext.minSceneAbovePct}% of the background scene must remain visible — do not let the product dominate or crop the environment.
${lookAndFeel ? `Style: ${lookAndFeel}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 3 — PHOTOGRAPHIC QUALITY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Make it look like the product was physically present in this scene when the photo was taken — not pasted in afterward.

Lighting: Match the product's lighting direction, color temperature, and intensity exactly to the background's light source. Identify the dominant light source direction and apply it to the product — same angle, same warmth/coolness.

Shadows: The same shadow patterns that fall across the background surface also fall across the product. Dappled leaf shadows, window-bar shadows, directional ground shadows — they all continue over the product's surface. The product also casts its own ground shadow consistent with the scene's light direction.

Shadow wrapping: Environmental shadows wrap around the product's form following its surface curvature — a shadow bar crossing the background continues up the side of the bottle, bending with its cylindrical curve.

Ambient color: The product's label picks up subtle color from the scene's ambient light — slightly warmer in golden light, slightly cooler in window light.

Depth of field: Product tack-sharp, background with gentle natural bokeh (f/1.4–f/2.8). Color harmony: unified color temperature, no color cast clashes. Environmental interaction: subtle reflections on glossy surfaces, light wrap around edges, micro-shadows at contact points.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 4 — DO NOT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${personInteraction
  ? `✓ You MAY adapt the person's hands, arms, gaze, or expression to naturally interact with the product — only the specific gesture needed. Preserve their face, identity, clothing, and body.
✗ Do NOT change the person's appearance for any reason beyond what the placement requires.`
  : `✗ Do NOT change the background model/person's appearance.`}
✗ Do NOT modify the product's colors, design, or any text/labels on the product.
✗ Do NOT add any text, headlines, taglines, watermarks, or typographic elements. This image is a visual foundation — copy is added later.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULE 5 — PRODUCT LABEL FIDELITY (remember this first, read it last):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every word, letter, logo, and mark on the product packaging in Image 1 is PART OF THE PHYSICAL PRODUCT — not overlay text. Reproduce it exactly. Do not alter, blur, simplify, or omit any label text. If it's on the product surface in Image 1, it must be identical in the output.`

    // Step 2 uses the cutout from Step 1 (not the raw product image).
    // The cutout is the product isolated at temp 0.4 — label and logo are already
    // locked. Creative latitude at temp 0.5 here applies only to lighting and
    // placement, not to the product surface itself.
    const contentParts: any[] = []

    const productBase64 = cutout.imageData.replace(/^data:image\/\w+;base64,/, '')
    contentParts.push({ inline_data: { data: productBase64, mime_type: cutout.mimeType } })

    const backgroundBase64 = backgroundImageData.replace(/^data:image\/\w+;base64,/, '')
    contentParts.push({ inline_data: { data: backgroundBase64, mime_type: backgroundImageMimeType } })

    contentParts.push({ text: prompt })

    const requestBody = {
      systemInstruction: {
        parts: [{
          text: `You are an elite commercial product photographer and photo compositor.

NON-NEGOTIABLE SIZE RULE:
Image 1 (the product cutout) is shown large for detail clarity ONLY. Do NOT use that size as your placement size. Scale it down significantly. Product height ≤ ${placementContext.maxHeightPct}% of frame. When in doubt, go smaller.

YOUR JOB:
Composite Image 1 (product) into Image 2 (background scene) so it looks like the product was physically present in the scene when the photo was taken. Placement context: ${placementContext.label}.

PRODUCT LABEL FIDELITY:
Every label, word, letter, logo, and mark on the product packaging in Image 1 is part of the physical product — reproduce it exactly. Apply the scene's lighting to the product surface freely, but preserve all underlying design information.

NO ADDED TEXT:
You are a photographer, not a graphic designer. Add zero text, headlines, watermarks, or typographic elements. The output is purely photographic.

LIGHTING (your primary creative task):
Before placing the product, read the background's light: direction, color temperature, and shadow geometry. Apply all three to the product. Environmental shadows (leaves, window bars, architectural lines) do not stop at the product's edge — they continue across its surface following its form. The product also casts its own ground shadow consistent with the scene's light source.`
        }]
      },
      contents: [{ parts: contentParts }],
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        maxOutputTokens: 32768,
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: '4K'
        }
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180000)

    const response = await fetchGeminiWithRetry(
      `${GEMINI_API_URL}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
      GEMINI_API_KEY
    )
    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const imagePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)
    if (imagePart) {
      const generatedMimeType = imagePart.inlineData.mimeType || 'image/jpeg'
      const generatedBase64 = imagePart.inlineData.data

      console.log(`   ✅ ${aspectRatio} composite generated successfully (two-call pipeline)`)

      return {
        promptUsed: prompt,
        imageData: `data:${generatedMimeType};base64,${generatedBase64}`,
        mimeType: generatedMimeType,
      }
    } else {
      const textPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)
      throw new Error(`Gemini returned no image. Model response: ${textPart?.text?.substring(0, 200) || 'empty'}`)
    }
  } catch (error) {
    console.error('Error generating composite:', error)
    throw new Error(`Failed to generate composite: ${error instanceof Error ? error.message : error}`)
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
    model: 'gemini-2.5-flash',
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
    model: 'gemini-2.5-flash',
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
