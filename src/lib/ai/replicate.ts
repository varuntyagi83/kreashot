/**
 * Replicate (FLUX 1.1 Pro) image generation
 *
 * Used for aspect ratios Gemini Imagen doesn't support natively:
 * 3:2, 5:4, 2:3, 21:9
 *
 * FLUX 1.1 Pro supports: 1:1, 16:9, 2:3, 3:2, 4:5, 5:4, 3:4, 4:3, 9:16, 21:9
 */

import Replicate from 'replicate'

// Formats handled by Replicate instead of Gemini.
// When USE_IMAGEN4=false AND the Gemini key doesn't support text-to-image generation,
// set FORCE_REPLICATE_BACKGROUNDS=true to route all formats through Replicate (FLUX).
const _base = ['3:2', '5:4', '2:3', '21:9']
const _all = ['1:1', '16:9', '9:16', '4:5', '4:3', '3:4', ..._base]
export const REPLICATE_FORMATS = new Set(
  process.env.FORCE_REPLICATE_BACKGROUNDS === 'true' ? _all : _base
)

const FLUX_MODEL = 'black-forest-labs/flux-1.1-pro' as const

function buildFluxPrompt(
  userPrompt: string,
  lookAndFeel: string,
  brandGuidelines?: string
): string {
  const parts: string[] = []

  parts.push(
    'Hyper-realistic product photography background. Real photograph, not a render or illustration.'
  )

  if (lookAndFeel) {
    parts.push(`Visual style: ${lookAndFeel}.`)
  }

  if (userPrompt) {
    parts.push(userPrompt)
  }

  if (brandGuidelines) {
    // Include a concise excerpt (first 500 chars) so we don't blow prompt limits
    parts.push(`Brand context: ${brandGuidelines.substring(0, 500)}`)
  }

  parts.push(
    'Strong directional lighting with clear shadow geometry. ' +
    'Cinematic depth of field. Cohesive color grading. ' +
    'No products, no people, no text in the scene. ' +
    'Professional editorial quality suitable for luxury brand advertising.'
  )

  return parts.join(' ')
}

export async function generateBackgroundsWithReplicate(
  userPrompt: string,
  lookAndFeel: string,
  count: number = 1,
  aspectRatio: string = '1:1',
  brandGuidelines?: string
): Promise<Array<{ promptUsed: string; imageData: string; mimeType: string }>> {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN environment variable is not set')
  }

  const replicate = new Replicate({ auth: apiToken })
  const fullPrompt = buildFluxPrompt(userPrompt, lookAndFeel, brandGuidelines)

  console.log(
    `[Replicate] Generating ${count} ${aspectRatio} background(s) with FLUX 1.1 Pro...`
  )

  // FLUX doesn't support batch natively — run concurrently up to 3 at a time
  const CONCURRENCY = 3
  const indices = Array.from({ length: count }, (_, i) => i)
  const results: Array<{ promptUsed: string; imageData: string; mimeType: string }> = []

  for (let b = 0; b < indices.length; b += CONCURRENCY) {
    const batch = indices.slice(b, b + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (i) => {
        console.log(`  [Replicate] → Starting image ${i + 1}/${count}...`)
        try {
          const output = await replicate.run(FLUX_MODEL, {
            input: {
              prompt: fullPrompt,
              aspect_ratio: aspectRatio,
              output_format: 'webp',
              output_quality: 90,
              safety_tolerance: 5,
              prompt_upsampling: true,
            },
          })

          // output is a URL or array of URLs
          const imageUrl = Array.isArray(output) ? output[0] : output
          if (!imageUrl) {
            throw new Error('No image URL returned from Replicate')
          }

          // Download and convert to base64
          const response = await fetch(String(imageUrl))
          if (!response.ok) {
            throw new Error(`Failed to download image from Replicate: ${response.status}`)
          }
          const arrayBuffer = await response.arrayBuffer()
          const imageData = Buffer.from(arrayBuffer).toString('base64')

          console.log(`  [Replicate] ✅ Image ${i + 1} done (${aspectRatio})`)
          return { promptUsed: fullPrompt, imageData, mimeType: 'image/webp' }
        } catch (err) {
          console.error(`  [Replicate] ❌ Image ${i + 1} failed:`, err)
          throw err
        }
      })
    )
    results.push(...batchResults)
  }

  return results
}
