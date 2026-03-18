const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|context)/gi,
  /system\s+override/gi,
  /you\s+are\s+now/gi,
  /new\s+instructions?:/gi,
  /forget\s+(everything|all|what)/gi,
  /act\s+as\s+(if\s+you\s+are|a\s+different)/gi,
  /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/gi,
]

export function sanitizeForPrompt(input: string): string {
  if (!input || typeof input !== 'string') return ''
  let sanitized = input
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REMOVED]')
  }
  return sanitized.replace(/\0/g, '').trim()
}
