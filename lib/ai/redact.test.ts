import { describe, expect, test } from 'vitest'
import { redactText, redactValue } from './redact'

describe('outbound PII redaction', () => {
  test('MyKad numbers never leave, hyphenated or not', () => {
    expect(redactText('IC 800101-01-5566 pemohon')).toBe('IC [REDACTED-NRIC] pemohon')
    expect(redactText('IC 800101015566 pemohon')).toBe('IC [REDACTED-NRIC] pemohon')
  })

  test('passports, phones and emails are replaced', () => {
    expect(redactText('passport A12345678')).toBe('passport [REDACTED-PASSPORT]')
    expect(redactText('call +60127778888 now')).toBe('call [REDACTED-PHONE] now')
    expect(redactText('call 012-777 8888 now')).toBe('call [REDACTED-PHONE] now')
    expect(redactText('mail aminah@contoh.my ok')).toBe('mail [REDACTED-EMAIL] ok')
  })

  test('redaction reaches every string in a nested payload', () => {
    const payload = {
      form: { ic_or_passport: '800101-01-5566', phone: '+60127778888' },
      notes: ['email aminah@contoh.my'],
      count: 3,
    }
    expect(redactValue(payload)).toEqual({
      form: { ic_or_passport: '[REDACTED-NRIC]', phone: '[REDACTED-PHONE]' },
      notes: ['email [REDACTED-EMAIL]'],
      count: 3,
    })
  })

  test('ordinary business text is untouched', () => {
    const text = 'Kedai Runcit Aman Jaya, No 45 Jalan Rosmerah 2/1, floor area 85 m²'
    expect(redactText(text)).toBe(text)
  })
})
