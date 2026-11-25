import { attachmentsOf, type Attachment, type Clip, type Library, type Passage } from './model.ts'

export const maxAttachmentBytes = 25 * 1024 ** 2
export const maxCaptureBytes = 60 * 1024 ** 2
export const maxTextLength = 150_000
export const rasterType = /^(image\/(?:png|jpeg|webp|bmp|gif))$/i

export function normalizeText(text: string) {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

export async function sha256(input: Blob | string | BufferSource) {
  const value = typeof input === 'string' ? new TextEncoder().encode(input) : input instanceof Blob ? await input.arrayBuffer() : input
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', value))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function prepareClip(clip: Clip): Promise<Clip> {
  const files = attachmentsOf(clip)
  if (clip.body.length > maxTextLength) throw new Error('Use an attachment for longer text.')
  if (files.length > 8 || files.some(file => file.blob.size > maxAttachmentBytes) ||
      files.reduce((total, file) => total + file.blob.size, 0) > maxCaptureBytes) throw new Error('Choose up to eight files, 25 MB each and 60 MB total.')
  const attachments: Attachment[] = []
  for (const file of files) attachments.push({ ...file, hash: file.hash ?? await sha256(file.blob) })
  const hash = await sha256(JSON.stringify([normalizeText(clip.body), attachments.map(file => file.hash).sort()]))
  const { attachment: _oldAttachment, filename: _oldFilename, ...metadata } = clip
  return { ...metadata, attachments, hash, modified: Date.now() }
}

export function exactDuplicates(clip: Clip, clips: Clip[]) {
  const body = normalizeText(clip.body)
  const files = attachmentsOf(clip)
  if (!files.length && body.length < 24) return []
  return clips.filter(value => {
    if (value.id === clip.id || value.trashed) return false
    if (clip.hash && clip.hash === value.hash) return true
    return !files.length && !attachmentsOf(value).length && normalizeText(value.body) === body
  })
}

export function nearDuplicates(clip: Clip, clips: Clip[]) {
  const keys = new Set(tokens(clip.body))
  if (keys.size < 8) return []
  const exact = new Set(exactDuplicates(clip, clips).map(value => value.id))
  return clips.flatMap(value => {
    if (value.id === clip.id || value.trashed || exact.has(value.id)) return []
    const words = new Set(tokens(value.body))
    if (words.size < 8) return []
    const shared = [...keys].filter(word => words.has(word)).length
    const similarity = shared / (keys.size + words.size - shared)
    return similarity >= .78 ? [{ clip: value, similarity }] : []
  }).sort((a, b) => b.similarity - a.similarity)
}

export function tokens(text: string) {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

export function bodyPassages(clip: Clip): Passage[] {
  return [...(clip.body ? [{ method: 'text' as const, text: clip.body }] : []), ...(clip.processing?.passages ?? [])]
}

export function localUsage(library: Library) {
  const seen = new Set<string>()
  return library.clips.reduce((total, clip) => total + [...attachmentsOf(clip), ...(clip.original?.attachments ?? [])].reduce((size, file) => {
    const key = clip.id + ':' + (file.hash || file.id)
    if (seen.has(key)) return size
    seen.add(key)
    return size + file.blob.size
  }, 0) + (clip.body.length + (clip.original?.body.length ?? 0)) * 2, 0)
}

export function applyRetention(library: Library, now = Date.now()): Library {
  const days = library.preferences?.retentionDays
  if (!days) return library
  const cutoff = now - days * 86_400_000
  const eligible = (clip: Clip) => !clip.trashed && !clip.pinned && !clip.archived && (clip.modified ?? clip.created) < cutoff
  if (!library.clips.some(eligible)) return library
  return { ...library, clips: library.clips.map(clip => eligible(clip) ? { ...clip, trashed: now } : clip) }
}
