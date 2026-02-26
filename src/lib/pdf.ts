const VISION_EXTRACTION_PROMPT = `You are a brand design expert. Analyze this PDF brand guideline document and extract ALL design specifications in a structured format.

CRITICAL: Extract exact values — do NOT paraphrase or generalize. Include:

1. **COLOR PALETTE** — Every color mentioned or shown:
   - Exact hex codes (e.g., #7D8C84, #CAB863)
   - RGB/CMYK values if visible
   - Color names and their usage context (primary, secondary, accent, product-specific)
   - Product-specific color palettes (e.g., "World of Green" uses X, "World of Pink" uses Y)

2. **TYPOGRAPHY** — Font specifications:
   - Font families and weights
   - Size specifications per element (headlines, sublines, body, URLs, badges)
   - Case rules (uppercase, sentence case, mixed)
   - Alignment rules

3. **VISUAL WORLDS / LOOK & FEEL**:
   - Mood and atmosphere descriptions
   - Lighting style (natural, warm, soft, dramatic)
   - Material and texture preferences (natural, organic, matte, glossy)
   - Object/prop suggestions for compositions
   - Background style preferences

4. **LOGO USAGE**:
   - Logo variants and when to use each
   - Placement rules and safe zones
   - Minimum sizes and spacing

5. **LAYOUT RULES** per format (1:1, 4:5, 9:16, 16:9):
   - Safe zone dimensions in pixels
   - Element positioning rules
   - Copy placement guidelines

6. **BADGE / GRAPHIC ELEMENTS**:
   - Line weights, dot sizes
   - Badge styles and colors
   - When and how to use them

7. **COPY RULES**:
   - How product names should appear
   - Headline vs subline formatting
   - Benefits text formatting

Output as structured text with clear section headers. Be exhaustive — every hex code, every pixel value, every rule matters.`

/**
 * Extract brand guidelines from PDF using Gemini Vision API.
 * Sends the PDF as inline_data so Gemini can read color swatches, visual examples, and layout specs.
 * Falls back to null if the API call fails (caller should fall back to text extraction).
 */
export async function extractPdfWithVision(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GOOGLE_GEMINI_API_KEY not set — skipping vision extraction')
    return null
  }

  try {
    const base64Pdf = Buffer.from(arrayBuffer).toString('base64')

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { data: base64Pdf, mime_type: 'application/pdf' } },
              { text: VISION_EXTRACTION_PROMPT }
            ]
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini Vision API error:', response.status, errorText)
      return null
    }

    const result = await response.json()
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text || text.trim().length < 100) {
      console.warn('Gemini Vision returned insufficient content')
      return null
    }

    return text.trim()
  } catch (error) {
    console.error('Vision extraction failed:', error)
    return null
  }
}

/**
 * Translate brand guidelines (with hex codes) into a natural-language color/mood description
 * suitable for image generation models. Image models render hex codes literally, so we
 * convert them to vivid descriptions using Gemini Flash (cheap, fast, text-only).
 * Called once at upload time; result is saved to brand_guidelines.color_description.
 */
export async function translateGuidelinesToColorDescription(extractedText: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `You are helping prepare a color palette description for an AI image generation model that generates product photography backgrounds.

The image model does NOT understand hex codes — it only understands vivid, unambiguous color names. Your job is to translate hex codes into color names that will make the image model produce the CORRECT color.

Given these brand guidelines, write a concise (max 200 words) COLOR PALETTE description.

If the brand has MULTIPLE product lines or color worlds, list them ALL. The user's prompt will specify which to use.

FORMAT:
- Brand color [name]: [vivid color name]
- [Product line/world] palette: [list of vivid color names]
Then 1-2 sentences about lighting mood.

CRITICAL RULES FOR COLOR NAMING:
1. LEAD WITH THE COLOR, not the modifier. Say "sage green" not "grayish-green". Say "dusty rose" not "pinkish-gray". The dominant hue must come FIRST and be unmistakable.
2. Use SPECIFIC color names that an artist would recognize: "sage green", "eucalyptus green", "olive green", "forest green", "dusty rose", "warm gold", "champagne". NOT vague terms like "muted grayish-green" or "soft warm pinkish-orange".
3. For green shades: prefer "sage green", "moss green", "eucalyptus", "olive", "hunter green", "celadon" over any description with "gray" in it.
4. Do NOT use object comparisons like "dried herbs", "linen", "pewter bowl" — the image model renders these as physical objects.
5. INCLUDE the hex code in parentheses after each color name, e.g. "sage green (#7D8C84)". The image model uses hex codes as precise color references.
6. Do NOT mention typography, fonts, layout rules, safe zones, or logos.
7. When a hex code maps to a green (like #7D8C84), call it a GREEN — "sage green (#7D8C84)", "muted sage (#7D8C84)" — never "grayish-green".

Brand guidelines:
${extractedText}` }]
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 16384 }
        })
      }
    )

    if (!response.ok) return null

    const result = await response.json()
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text && text.length > 50 ? text : null
  } catch (error) {
    console.error('Color description translation failed:', error)
    return null
  }
}

/**
 * Shared PDF text extraction utility (text-only fallback using pdfjs-dist)
 * Used by brand-docs (legacy) and brand-guidelines (library) routes
 */
export async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any).catch(
      () => import('pdfjs-dist' as any)
    )

    const data = new Uint8Array(arrayBuffer)
    const loadingTask = pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false })
    const pdf = await loadingTask.promise

    let fullText = ''

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
      fullText += pageText + '\n'
    }

    return fullText
  } catch (error) {
    console.error('PDF parsing error:', error)
    throw new Error('Failed to parse PDF. Please ensure the file is a valid, text-based PDF.')
  }
}
