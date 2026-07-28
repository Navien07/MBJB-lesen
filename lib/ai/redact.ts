/**
 * PII redaction applied to every outbound payload before it leaves the
 * machine (M5). Patterns cover the identifiers this system actually handles:
 * MyKad NRIC numbers, passport numbers, Malaysian phone numbers, emails.
 * Replacement tokens are stable so a model can still reason about structure.
 */

const PATTERNS: Array<{ name: string; pattern: RegExp; token: string }> = [
  // MyKad: 800101-01-5566 or 800101015566
  { name: 'nric', pattern: /\b\d{6}-?\d{2}-?\d{4}\b/g, token: '[REDACTED-NRIC]' },
  // Malaysian passports: letter followed by 8 digits (A12345678)
  { name: 'passport', pattern: /\b[A-Z]\d{8}\b/g, token: '[REDACTED-PASSPORT]' },
  // phone numbers with optional +60 prefix
  { name: 'phone', pattern: /(?:\+?60|0)1\d[-\s]?\d{3,4}[-\s]?\d{4}\b/g, token: '[REDACTED-PHONE]' },
  { name: 'email', pattern: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, token: '[REDACTED-EMAIL]' },
]

export function redactText(text: string): string {
  let out = text
  for (const { pattern, token } of PATTERNS) {
    out = out.replace(pattern, token)
  }
  return out
}

/** Deep-redacts every string in a JSON-serialisable value. */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as T
  if (Array.isArray(value)) return value.map((v) => redactValue(v)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactValue(v)]),
    ) as T
  }
  return value
}
