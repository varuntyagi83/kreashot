import OpenAI from 'openai'
import type { BrandVoiceProfile } from './brand-voice'
import { formatBrandVoiceForPrompt } from './brand-voice'

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is missing')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

export type CopyType = 'hook' | 'cta' | 'body' | 'tagline' | 'headline'
export type CopyTone = 'professional' | 'casual' | 'playful' | 'urgent' | 'empathetic'

export interface CopyVariation {
  promptUsed: string
  generatedText: string
}

export interface CopyKitItem extends CopyVariation {
  copyType: CopyType
  tone: CopyTone | string
}

/**
 * Original single-type generation — kept for backwards compatibility
 */
export async function generateCopyVariations(
  brief: string,
  copyType: CopyType,
  lookAndFeel: string,
  count: number = 1,
  tone?: string,
  targetAudience?: string,
  brandGuidelines?: string,
  brandVoice?: BrandVoiceProfile | null
): Promise<CopyVariation[]> {
  const systemPrompt = buildSystemPrompt(lookAndFeel, brandGuidelines, brandVoice)
  const prompt = buildCopyPrompt(brief, copyType, tone, targetAudience)

  const results: CopyVariation[] = []
  for (let i = 0; i < count; i++) {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    })

    results.push({
      promptUsed: prompt,
      generatedText: response.choices[0].message.content || '',
    })
  }

  return results
}

/**
 * Generate a full copy kit — all selected types × all selected tones in parallel.
 * Returns one result per type+tone combination.
 */
export async function generateCopyKit(
  brief: string,
  copyTypes: CopyType[],
  tones: (CopyTone | string)[],
  lookAndFeel: string,
  targetAudience?: string,
  brandGuidelines?: string,
  brandVoice?: BrandVoiceProfile | null
): Promise<CopyKitItem[]> {
  const systemPrompt = buildSystemPrompt(lookAndFeel, brandGuidelines, brandVoice)

  // Build all combinations
  const combinations: { copyType: CopyType; tone: CopyTone | string }[] = []
  for (const copyType of copyTypes) {
    for (const tone of tones) {
      combinations.push({ copyType, tone })
    }
  }

  // Generate all in parallel
  const results = await Promise.all(
    combinations.map(async ({ copyType, tone }) => {
      const prompt = buildCopyPrompt(brief, copyType, tone, targetAudience)

      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 500,
      })

      return {
        copyType,
        tone,
        promptUsed: prompt,
        generatedText: response.choices[0].message.content || '',
      } as CopyKitItem
    })
  )

  return results
}

/**
 * Builds the system prompt, injecting brand voice profile (highest priority),
 * brand guidelines (PDF text), and look & feel as context layers.
 *
 * Priority: brand_voice > brand_guidelines > look_and_feel
 */
function buildSystemPrompt(
  lookAndFeel?: string,
  brandGuidelines?: string,
  brandVoice?: BrandVoiceProfile | null
): string {
  let system = `You are an expert copywriter specialising in e-commerce and performance marketing. You write copy that converts.`

  if (lookAndFeel) {
    system += `\n\nBRAND STYLE: ${lookAndFeel}`
  }

  if (brandGuidelines) {
    system += `\n\nBRAND GUIDELINES (from uploaded brand document — follow these closely):\n${brandGuidelines}`
  }

  // Brand voice profile takes highest priority — it's the most structured and specific
  if (brandVoice) {
    system += `\n\n${formatBrandVoiceForPrompt(brandVoice)}`
    system += `\n\nThe brand voice profile above is the most important context. Every word you write must align with it.`
  }

  system += `\n\nReturn ONLY the copy text itself — no explanations, no labels, no quotes around it.`

  return system
}

/**
 * Builds the user-facing prompt for a specific copy type and tone.
 */
function buildCopyPrompt(
  brief: string,
  copyType: string,
  tone?: string,
  targetAudience?: string
): string {
  let prompt = `Write a ${copyType} for:\n${brief}\n\n`

  if (tone) {
    prompt += `Tone: ${tone}\n\n`
  }

  if (targetAudience) {
    prompt += `Target Audience: ${targetAudience}\n\n`
  }

  prompt += `Requirements:\n`

  switch (copyType) {
    case 'hook':
      prompt += `- Write a compelling 1-2 sentence hook\n- Grab attention immediately\n- Max 280 characters`
      break
    case 'cta':
      prompt += `- Write a strong call-to-action\n- Action-oriented and persuasive\n- Max 50 characters`
      break
    case 'headline':
      prompt += `- Write a powerful headline\n- Clear benefit or emotional trigger\n- Max 100 characters`
      break
    case 'tagline':
      prompt += `- Write a memorable tagline\n- Concise, catchy, brand-aligned\n- Max 80 characters`
      break
    case 'body':
      prompt += `- Write persuasive body copy\n- 2-4 short paragraphs\n- Focus on benefits, not features\n- Max 500 words`
      break
  }

  return prompt
}

// Legacy function for backwards compatibility
export async function generateCopy(systemPrompt: string, userPrompt: string) {
  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  return response.choices[0]?.message?.content || ''
}
