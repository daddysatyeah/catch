import { bodyPassages } from './content.ts'
import { safeUrl, type Clip, type Passage } from './model.ts'

export type EntityType = 'date' | 'time' | 'deadline' | 'amount' | 'url' | 'email' | 'reference' | 'action'
export type Entity = { id: string; clipId: string; type: EntityType; value: string; evidence: string; offset: number; page?: number; attachment?: string; origin: Passage['method']; ambiguous?: boolean }

const months = 'january february march april may june july august september october november december'.split(' ')
const monthName = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'

function calendar(year: number, month: number, day: number) {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}
function iso(year: number, month: number, day: number) {
  return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

export function parseDate(raw: string) {
  const text = raw.trim()
  const ymd = /^(\d{4})-(\d\d)-(\d\d)$/.exec(text)
  if (ymd) {
    const [, y, m, d] = ymd
    return calendar(+y, +m, +d) ? { value: iso(+y, +m, +d) } : undefined
  }
  const numeric = /^(\d{1,2})([./-])(\d{1,2})(?:\2(\d{2}|\d{4}))?$/.exec(text)
  if (numeric) {
    const [, first, , second, year] = numeric
    const left = +first, right = +second
    if (!left || !right || Math.min(left, right) > 12 || Math.max(left, right) > 31) return
    if (!year || year.length < 4 || (left <= 12 && right <= 12 && left !== right)) return { value: text, ambiguous: true }
    const month = left > 12 ? right : left
    const day = left > 12 ? left : right
    return calendar(+year, month, day) ? { value: iso(+year, month, day) } : undefined
  }
  const dmy = new RegExp('^(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + monthName + ')(?:[ ,]+(\\d{4}))?$', 'i').exec(text)
  const mdy = new RegExp('^(' + monthName + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(\\d{4}))?$', 'i').exec(text)
  if (dmy || mdy) {
    const day = Number(dmy?.[1] ?? mdy?.[2])
    const name = (dmy?.[2] ?? mdy?.[1] ?? '').slice(0, 3).toLowerCase()
    const month = months.findIndex(value => value.startsWith(name)) + 1
    const year = dmy?.[3] ?? mdy?.[3]
    if (!calendar(year ? +year : 2000, month, day)) return
    return year ? { value: iso(+year, month, day) } : { value: text, ambiguous: true }
  }
}

const currencyMark = 'INR|USD|EUR|GBP|₹|US\\$|\\$|€|£|Rs\\.?'
const currencyValue = '(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d[\\d,]*)(?:\\.\\d{1,2})?'
const amountPattern = new RegExp('^(-)?(?:(' + currencyMark + '))[ \\t\\u00a0\\u202f]*(-)?(' + currencyValue + ')$', 'i')
const amountScan = new RegExp('(?<![\\p{L}\\p{N}-])-?(?:' + currencyMark + ')[ \\t\\u00a0\\u202f]*-?' + currencyValue +
  '(?![\\p{L}\\p{N}]|[,.]\\d|[ \\u00a0\\u202f]+\\d)', 'giu')

export function parseAmount(raw: string) {
  const match = amountPattern.exec(raw.trim())
  if (!match) return
  const [, before, mark, after, digits] = match
  if ((before && after) || (after && /^rs-/i.test(raw.trim()))) return
  const whole = digits.split('.')[0]
  if (!/^\d+$|^\d{1,3}(?:,\d{3})+$|^\d{1,2}(?:,\d{2})+,\d{3}$|^\d{1,3}(?:[ \u00a0\u202f]\d{3})+$/.test(whole)) return
  const currencies: Record<string, string> = { '₹': 'INR', RS: 'INR', 'RS.': 'INR', 'US$': 'USD', '€': 'EUR', '£': 'GBP' }
  const currency = currencies[mark.toUpperCase()] ?? mark.toUpperCase()
  return { value: currency + ' ' + (before || after ? '-' : '') + digits.replace(/[, \u00a0\u202f]/g, ''), ambiguous: currency === '$' }
}

const datePattern = new RegExp('\\b(?:\\d{4}-\\d\\d-\\d\\d|\\d{1,2}[./-]\\d{1,2}(?:[./-](?:\\d{4}|\\d\\d))?|\\d{1,2}(?:st|nd|rd|th)?\\s+' + monthName +
  '(?:[ ,]+\\d{4})?|' + monthName + '\\s+\\d{1,2}(?:st|nd|rd|th)?(?:[ ,]+\\d{4})?)\\b', 'gi')
const dueCue = /\b(?:due|deadline|before)\b[^\n]{0,19}$|\b(?:return|send|file|submit|pay|complete|hand in)\b[^\n.;]{0,26}\bby\s*$/i

function linkText(raw: string) {
  let value = raw.replace(/[,.;]+$/, '')
  const count = (pattern: RegExp) => (value.match(pattern) ?? []).length
  while (value.endsWith(')') && count(/\)/g) > count(/\(/g)) value = value.slice(0, -1)
  return safeUrl(value) ? value : undefined
}

export function extractEntities(clip: Clip): Entity[] {
  const result: Entity[] = []
  const seen = new Set<string>()
  for (const passage of bodyPassages(clip)) {
    const text = passage.text
    const links = [...text.matchAll(/https?:\/\/[^\s<>"']+/gi)]
    const insideLink = (offset: number) => {
      let low = 0, high = links.length
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (links[middle].index <= offset) low = middle + 1
        else high = middle
      }
      const preceding = links[low - 1]
      return preceding && offset < preceding.index + preceding[0].length
    }
    const add = (type: EntityType, value: string, match: RegExpMatchArray, ambiguous?: boolean) => {
      const offset = match.index ?? 0
      const id = [type, passage.attachment ?? 'body', passage.page ?? 0, offset, value.slice(0, 80)].join(':')
      const identity = [type, value, passage.attachment ?? '', passage.page ?? 0].join(':')
      if (seen.has(identity) || result.length >= 100) return
      seen.add(identity)
      result.push({ id, clipId: clip.id, type, value, evidence: text.slice(Math.max(0, offset - 36), offset + match[0].length + 42).trim(), offset, page: passage.page, attachment: passage.attachment, origin: passage.method, ambiguous })
    }
    for (const match of text.matchAll(datePattern)) {
      if (insideLink(match.index)) continue
      const date = parseDate(match[0])
      const context = text.slice(Math.max(0, match.index - 48), match.index)
      if (date) add(dueCue.test(context) ? 'deadline' : 'date', date.value, match, date.ambiguous)
    }
    for (const match of text.matchAll(amountScan)) {
      if (insideLink(match.index)) continue
      const amount = parseAmount(match[0])
      if (amount) add('amount', amount.value, match, amount.ambiguous)
    }
    for (const match of text.matchAll(/\b((?:[01]?\d|2[0-3]):[0-5]\d)\b(?:[ \t]*([ap]m|[ap]\.m\.?)(?![a-z]))?/gi)) {
      if (insideLink(match.index)) continue
      if (!match[2] || (+match[1].split(':')[0] >= 1 && +match[1].split(':')[0] <= 12)) add('time', match[0], match)
    }
    for (const match of links) {
      const value = linkText(match[0])
      if (value) add('url', value, match)
    }
    for (const match of text.matchAll(/\b[A-Z0-9.!#$%&'*+/=?^_{}|~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
      const [local, domain] = match[0].split('@')
      if (!insideLink(match.index) && !local.includes('..') && !local.endsWith('.') &&
          domain.split('.').every(label => /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/i.test(label))) add('email', match[0], match)
    }
    for (const match of text.matchAll(/\b(?:order|invoice|booking|reference|ref)\s*(?:ID|number|no\.?)?\s*[:#]\s*([A-Z0-9][A-Z0-9-]{3,35})\b/gi)) add('reference', match[1], match)
    for (const match of text.matchAll(/^[\t ]*(?:[-*]\s*\[\s\]\s*|(?:todo|action(?: item)?)\s*:\s*)(.{3,180})$/gim)) add('action', match[1].trim(), match)
  }
  return result
}
