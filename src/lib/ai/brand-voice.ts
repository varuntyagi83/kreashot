import OpenAI from 'openai'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BrandVoiceProfile {
  // Core identity
  tone_words: string[]             // 4–8 adjectives capturing the brand's voice
  personality: string              // Brand persona — who is this brand as a person?
  brand_promise: string            // The core emotional/rational promise to the customer

  // Communication style
  language_style: string           // How the brand writes (POV, sentence length, vocabulary)
  sentence_structure: string       // Short punchy? Long flowing? Questions? Commands?
  vocabulary_level: string         // Simple everyday? Technical expert? Somewhere between?
  emotional_register: string       // What emotions does the copy evoke? How intense?

  // Copywriting guidelines
  dos: string[]                    // 5–8 specific copywriting instructions
  donts: string[]                  // 5–8 things to strictly avoid
  messaging_pillars: string[]      // 3–5 core themes the brand always returns to
  power_words: string[]            // High-impact words that feel native to this brand

  // Examples
  sample_phrases: string[]         // 5–8 on-brand phrases or vocabulary choices
  example_hooks: string[]          // 2–3 example hooks in this brand's voice
  example_ctas: string[]           // 2–3 example CTAs in this brand's voice

  // Context
  audience_insight: string         // Who the audience is and what motivates them
  competitive_differentiation: string // What makes this brand sound unlike competitors

  // Meta
  extracted_from: 'text' | 'qa' | 'images' | 'combined'
  extracted_at: string
}

export interface QAAnswer {
  question: string
  answer: string
}

// ── OpenAI client ─────────────────────────────────────────────────────────────

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

// ── Shared JSON schema instruction ───────────────────────────────────────────

const JSON_SCHEMA = `
Return ONLY a valid JSON object (no markdown fences, no explanation) with this exact shape:
{
  "tone_words": ["word1", "word2", "word3", "word4", "word5"],
  "personality": "A rich, 2–3 sentence description of the brand as a person — their character, attitude, and how they make people feel",
  "brand_promise": "The core emotional or rational value this brand delivers — what transformation or feeling does it promise the customer?",
  "language_style": "Detailed description of HOW the brand writes — point of view (we/you/they), sentence length, rhythm, vocabulary choices, use of humour or emotion",
  "sentence_structure": "Description of sentence patterns — e.g. Short declarative punches. Action verbs first. Rhetorical questions to engage. Commands to inspire.",
  "vocabulary_level": "Description of vocabulary complexity — e.g. Everyday accessible language, zero jargon, occasionally borrows a fitness/nutrition term to signal credibility",
  "emotional_register": "The emotional tone spectrum — e.g. Warm but not sentimental. Motivating but not pushy. Confident without arrogance.",
  "dos": [
    "Actionable instruction 1",
    "Actionable instruction 2",
    "Actionable instruction 3",
    "Actionable instruction 4",
    "Actionable instruction 5"
  ],
  "donts": [
    "Never do this 1",
    "Never do this 2",
    "Never do this 3",
    "Never do this 4",
    "Never do this 5"
  ],
  "messaging_pillars": ["Core theme 1", "Core theme 2", "Core theme 3", "Core theme 4"],
  "power_words": ["word1", "word2", "word3", "word4", "word5", "word6"],
  "sample_phrases": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "example_hooks": ["Hook example 1", "Hook example 2", "Hook example 3"],
  "example_ctas": ["CTA 1", "CTA 2", "CTA 3"],
  "audience_insight": "A detailed portrait of the target audience — demographics, psychographics, motivations, fears, and what they want to believe about themselves",
  "competitive_differentiation": "What makes this brand's voice distinctly different from competitors — the specific qualities that make it unmistakably theirs"
}

Rules:
- tone_words: 4–8 precise adjectives (not generic — avoid 'professional', 'modern', 'innovative')
- personality: must feel like a real person, not a corporate description
- dos and donts: must be specific and actionable, not vague
- example_hooks and example_ctas: must feel authentic to this specific brand — write them as if you ARE the brand
- Be specific and opinionated. Vague outputs are useless. Analyse deeply and commit to strong characterisations.
`

// ── Method 1: Extract from text samples ──────────────────────────────────────

export async function extractVoiceFromText(
  samples: string[],
  lookAndFeel?: string
): Promise<BrandVoiceProfile> {
  const combinedSamples = samples.map((s, i) => `Sample ${i + 1}:\n${s}`).join('\n\n---\n\n')

  const prompt = `You are a brand strategist and expert copywriter. Analyse these copy samples and extract the brand's tone of voice.

${lookAndFeel ? `Brand Style Context: ${lookAndFeel}\n\n` : ''}COPY SAMPLES:
${combinedSamples}

Study the writing style, word choices, sentence structure, emotional register, and personality expressed in these samples. Then extract the brand voice profile.

${JSON_SCHEMA}`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert brand strategist. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })

  const parsed = JSON.parse(response.choices[0].message.content || '{}')
  return { ...parsed, extracted_from: 'text', extracted_at: new Date().toISOString() }
}

// ── Method 2: Extract from Q&A answers ───────────────────────────────────────

export async function extractVoiceFromQA(
  answers: QAAnswer[],
  lookAndFeel?: string
): Promise<BrandVoiceProfile> {
  const formattedAnswers = answers
    .filter(a => a.answer.trim())
    .map(a => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n')

  const prompt = `You are a brand strategist. A brand owner has answered questions about their brand's voice and personality. Synthesise their answers into a structured brand voice profile.

${lookAndFeel ? `Brand Style Context: ${lookAndFeel}\n\n` : ''}BRAND OWNER ANSWERS:
${formattedAnswers}

Based on these answers, define a clear, actionable brand voice profile that a copywriter can follow.

${JSON_SCHEMA}`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are an expert brand strategist. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })

  const parsed = JSON.parse(response.choices[0].message.content || '{}')
  return { ...parsed, extracted_from: 'qa', extracted_at: new Date().toISOString() }
}

// ── Method 3: Extract from ad images (via Gemini) ─────────────────────────────

export async function extractVoiceFromImages(
  images: Array<{ base64: string; mimeType: string }>,
  lookAndFeel?: string
): Promise<BrandVoiceProfile> {
  const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY
  if (!GEMINI_API_KEY) throw new Error('GOOGLE_GEMINI_API_KEY is not set')

  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

  // Build content parts: all images + text prompt
  const parts: any[] = images.map(img => ({
    inline_data: {
      data: img.base64.replace(/^data:image\/\w+;base64,/, ''),
      mime_type: img.mimeType,
    },
  }))

  parts.push({
    text: `You are a brand strategist analysing ad creatives. Study these advertisement images — look at any visible copy/text, the visual language, emotional tone, colour choices, and overall personality they project.

${lookAndFeel ? `Brand Style Context: ${lookAndFeel}\n\n` : ''}Based on what you see, extract the brand's tone of voice and define an actionable voice profile.

${JSON_SCHEMA}`,
  })

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${response.status} — ${err}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const parsed = JSON.parse(text)
  return { ...parsed, extracted_from: 'images', extracted_at: new Date().toISOString() }
}

// ── Format brand voice for OpenAI system prompt ───────────────────────────────

export function formatBrandVoiceForPrompt(profile: BrandVoiceProfile): string {
  const lines: string[] = [
    `BRAND VOICE PROFILE (follow this precisely when writing copy):`,
    ``,
    `PERSONALITY & IDENTITY`,
    `Personality: ${profile.personality}`,
    `Brand Promise: ${profile.brand_promise}`,
    `Tone Words: ${profile.tone_words.join(', ')}`,
    ``,
    `COMMUNICATION STYLE`,
    `Language Style: ${profile.language_style}`,
    `Sentence Structure: ${profile.sentence_structure}`,
    `Vocabulary Level: ${profile.vocabulary_level}`,
    `Emotional Register: ${profile.emotional_register}`,
    ``,
    `COPYWRITING RULES`,
    `Always DO: ${profile.dos.join(' | ')}`,
    `Never DO: ${profile.donts.join(' | ')}`,
    `Messaging Pillars: ${profile.messaging_pillars.join(' | ')}`,
    `Power Words to use: ${profile.power_words.join(', ')}`,
    ``,
    `REFERENCE EXAMPLES`,
    `On-brand phrases: "${profile.sample_phrases.join('", "')}"`,
    `Example hooks: ${profile.example_hooks.map(h => `"${h}"`).join(' | ')}`,
    `Example CTAs: ${profile.example_ctas.map(c => `"${c}"`).join(' | ')}`,
    ``,
    `AUDIENCE & POSITIONING`,
    `Audience: ${profile.audience_insight}`,
    `Competitive Differentiation: ${profile.competitive_differentiation}`,
  ]
  return lines.join('\n')
}
