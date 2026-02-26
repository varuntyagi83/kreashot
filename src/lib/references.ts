/**
 * Shared utility for parsing @[name](type:id) reference tokens in text
 */

export interface ResolvedReference {
  type: string
  id: string
  name: string
}

/**
 * Parse @[name](type:id) tokens from text.
 * Returns cleaned text (tokens stripped) and array of references.
 */
export function parseReferenceTokens(text: string): {
  cleanText: string
  references: ResolvedReference[]
} {
  const regex = /@\[([^\]]+)\]\(([^:]+):([^)]+)\)/g
  const references: ResolvedReference[] = []
  let match

  while ((match = regex.exec(text)) !== null) {
    references.push({
      name: match[1],
      type: match[2],
      id: match[3],
    })
  }

  // Strip reference tokens from text, leaving surrounding prose
  const cleanText = text
    .replace(regex, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { cleanText, references }
}
