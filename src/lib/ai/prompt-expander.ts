import OpenAI from 'openai'

// Feature flag — set USE_PROMPT_EXPANSION=true in Railway to enable.
// Leaving it unset or empty keeps current behavior exactly.
const USE_PROMPT_EXPANSION = process.env.USE_PROMPT_EXPANSION === 'true'

// Prompts shorter than this are specific enough already — don't expand.
const MIN_PROMPT_LENGTH = 20

const BACKGROUND_SYSTEM_PROMPT = `You are a product photography art director. A user has typed a brief background description for a product photo shoot. Your job is to rewrite it as a precise, technically detailed image generation prompt.

Output a single paragraph of 150–350 words. No headers, no bullet points, no JSON.

Include these four elements in order:
1. CAMERA SPEC: one specific camera setup — focal length in mm, aperture f-stop, shooting distance in meters.
2. LIGHT SPEC: key light direction as clock position and elevation in degrees, exact color temperature in Kelvin, shadow edge quality (penumbra width in cm), fill light Kelvin and stop ratio. No vague words — "warm" becomes a Kelvin number.
3. SURFACE DETAIL: 2–3 specific materials described at 30cm detail level — texture, finish, weathering state, sheen level. These are the physical surfaces of the background scene.
4. NEGATIVE: end with "Negative:" followed by 5–7 specific failure modes. Name visible rendering artifacts and technical failures, not aesthetic opinions. Examples of correct specificity: "no blown highlights on foreground surface", "no shadow edges without penumbra", "no plastic sheen on matte surfaces", "no depth-of-field collapse leaving background equally sharp as foreground", "no artificial light sources visible in frame", "no uniform brightness across key-lit and fill-lit zones". Never write items like "no harsh lighting", "no bad ambiance", "no unnatural feel" — these name a mood, not a failure mode the model can act on.

Hard rules:
- Never use feeling words (moody, cozy, elegant, fresh). Translate them into camera, light, or surface specs.
- Always use Kelvin for light color. Never "warm light" or "cool light".
- Preserve the user's intent exactly. If they said terracotta kitchen, keep terracotta kitchen. Add physics, not new creative choices.
- Do not add people, products, or objects the user did not mention.
- Output ends after the negative prompt. No trailing summary sentence.`

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey, timeout: 15_000 })
}

export async function expandBackgroundPrompt(userPrompt: string): Promise<string> {
  if (!USE_PROMPT_EXPANSION) return userPrompt
  if (userPrompt.trim().length < MIN_PROMPT_LENGTH) return userPrompt

  try {
    const client = getOpenAIClient()
    if (!client) return userPrompt

    const result = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: BACKGROUND_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })

    const expanded = result.choices[0]?.message?.content?.trim()
    if (!expanded || expanded.length < 50) return userPrompt

    console.log(`[prompt-expander] background: ${userPrompt.length} → ${expanded.length} chars`)
    return expanded
  } catch (error) {
    console.error('[prompt-expander] background expansion failed, using raw prompt:', error)
    return userPrompt
  }
}
