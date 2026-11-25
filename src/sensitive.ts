export type SensitiveReason = 'private key' | 'credential' | 'one-time code' | 'recovery code' | 'payment card'

export function validCard(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false
  const sum = [...digits].reverse().reduce((total, digit, index) => {
    const weighted = Number(digit) * (index % 2 ? 2 : 1)
    return total + (weighted > 9 ? weighted - 9 : weighted)
  }, 0)
  return sum % 10 === 0
}

export function sensitiveReason(text: string): SensitiveReason | undefined {
  if (/-----BEGIN [\w ]*PRIVATE KEY-----/i.test(text)) return 'private key'
  if (/(?:\b(?:password|passwd|api[_ -]?key|(?:access|auth|refresh)[_ -]?token|client[_ -]?secret)\s*[:=]\s*["']?\S{4,}|\bbearer\s+[a-z0-9._~-]{12,}|\bgh[pousr]_[a-z0-9]{20,}|\bgithub_pat_[a-z0-9_]{20,}|\bsk-(?:proj-)?[a-z0-9_-]{20,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]{8,})/i.test(text)) return 'credential'
  if (/\b(?:otp|one[- ]time (?:password|code)|verification code|authentication code)\b[^\d\n]{0,36}\b\d{4,8}\b/i.test(text) ||
      /\b\d{4,8}\b[^\d\n]{0,18}\b(?:is your (?:otp|verification code)|one[- ]time code)\b/i.test(text)) return 'one-time code'
  if (/\b(?:recovery|backup)[- ]codes?\b[^\n]{0,30}\b[a-z0-9]{4,}(?:[- ]+[a-z0-9]{4,})+/i.test(text)) return 'recovery code'
  const candidates = text.match(/(?<!\d)\d(?:[ -]?\d){12,18}(?![ -]?\d)/g) ?? []
  if (candidates.some(validCard)) return 'payment card'
  return undefined
}
