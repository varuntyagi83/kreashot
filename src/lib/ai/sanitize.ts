const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|context)/gi,
  /system\s+override/gi,
  /you\s+are\s+now/gi,
  /new\s+instructions?:/gi,
  /forget\s+(everything|all|what)/gi,
  /act\s+as\s+(if\s+you\s+are|a\s+different)/gi,
  /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/gi,
  /<\s*script[\s>]/gi,
  /<!--[\s\S]*?-->/g,
]

const MAX_PROMPT_LENGTH = 10_000

export function sanitizeForPrompt(input: string): string {
  if (!input || typeof input !== 'string') return ''
  // Normalize Unicode to collapse homoglyphs
  let sanitized = input.normalize('NFC')
  // Strip null bytes and control characters (keep newline \n=10, tab \t=9, carriage return \r=13)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  // Hard length cap before expensive regex passes
  if (sanitized.length > MAX_PROMPT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_PROMPT_LENGTH)
  }
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REMOVED]')
  }
  return sanitized.trim()
}

export function wrapUserContent(input: string): string {
  const sanitized = sanitizeForPrompt(input)
  return `[USER_CONTENT_START]\n${sanitized}\n[USER_CONTENT_END]`
}
