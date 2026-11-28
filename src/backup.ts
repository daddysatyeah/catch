import { maxAttachmentBytes, normalizeText, sha256 } from './content.ts'
import { attachmentsOf, type Attachment, type Clip, type Collection, type Library, type Passage, type ReviewState } from './model.ts'
import { isShowcase } from './showcase.ts'

const maxBackupBytes = 150 * 1024 ** 2
const maxBinaryBytes = 100 * 1024 ** 2
const base64 = /^[A-Za-z0-9+/]*={0,2}$/
const hashPattern = /^[a-f0-9]{64}$/
const idPattern = /^[\w-]{1,128}$/
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function object(value: unknown) { if (!isObject(value)) throw new Error('Expected a record in the backup.'); return value }
function string(value: unknown, limit: number) { if (typeof value !== 'string' || value.length > limit) throw new Error('A backup text field is invalid or too long.'); return value }
function identifier(value: unknown) { const id = string(value, 128); if (!idPattern.test(id)) throw new Error('The backup has an invalid identifier.'); return id }
function when(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8.64e15) throw new Error('The backup has an invalid timestamp.'); return value }
function list(value: unknown, limit: number): unknown[] { if (!Array.isArray(value) || value.length > limit) throw new Error('A backup list is invalid or too large.'); return value }
function unique<T>(items: T[], key: (item: T) => string) {
  if (new Set(items.map(key)).size !== items.length) throw new Error('The backup contains duplicate identifiers.')
  return items
}

async function encode(blob: Blob) {
  const data = new Uint8Array(await blob.arrayBuffer())
  let value = ''
  for (let offset = 0; offset < data.length; offset += 0x8000) value += String.fromCharCode(...data.subarray(offset, offset + 0x8000))
  return btoa(value)
}

function decode(value: unknown, type: unknown) {
  const mime = string(type, 160)
  const binary = string(value, Math.ceil(maxAttachmentBytes / 3) * 4)
  if (!base64.test(binary) || binary.length % 4) throw new Error('A backup attachment is corrupted.')
  const decoded = atob(binary)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index)
  if (bytes.byteLength > maxAttachmentBytes) throw new Error('A backup attachment exceeds 25 MB.')
  return new Blob([bytes], { type: mime })
}

type FileReference = { id: string; name: string; hash: string; type: string }

export async function createBackup(library: Library) {
  const binaries: Blob[] = []
  const seen = new Set<string>()
  let size = 0
  async function reference(files: Attachment[]): Promise<FileReference[]> {
    const result = []
    for (const file of files) {
      const hash = await sha256(file.blob)
      if (!seen.has(hash)) {
        size += file.blob.size
        if (size > maxBinaryBytes) throw new Error('This backup exceeds 100 MB of attachments.')
        binaries.push(new Blob([JSON.stringify({ hash, type: file.blob.type, data: await encode(file.blob) })]))
        seen.add(hash)
      }
      result.push({ id: file.id, name: file.name, hash, type: file.blob.type })
    }
    return result
  }
  const clips = []
  for (const clip of library.clips) {
    const { attachment: _old, filename: _oldName, attachments: _files, original, ...fields } = clip
    clips.push({ ...fields, attachments: await reference(attachmentsOf(clip)), original: original && { ...original, attachments: await reference(original.attachments) } })
  }
  const { recentSearches: _history, ...preferences } = library.preferences ?? {}
  const metadata = JSON.stringify({ ...library, version: 2, exportedAt: Date.now(), preferences, clips })
  const parts: BlobPart[] = [metadata.slice(0, -1), ',"binaries":[']
  binaries.forEach((binary, index) => { if (index) parts.push(','); parts.push(binary) })
  const blob = new Blob([...parts, ']}'], { type: 'application/json' })
  if (blob.size > maxBackupBytes) throw new Error('The encoded library exceeds the backup limit.')
  return blob
}

function collect(value: unknown): Collection {
  const raw = object(value)
  const color = string(raw.color, 12)
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error('A collection color is invalid.')
  const name = string(raw.name, 50).trim()
  if (!name) throw new Error('A collection is missing its name.')
  return { id: identifier(raw.id), name, color, demo: raw.demo === true }
}

function reading(value: unknown, files: Attachment[]): Clip['processing'] {
  if (value === undefined) return
  const raw = object(value)
  if (raw.status !== 'ready' && raw.status !== 'limited' && raw.status !== 'failed') throw new Error('An extraction status is invalid.')
  const passages = list(raw.passages, 200).map((value): Passage => {
    const passage = object(value)
    const method = passage.method
    if (method !== 'text' && method !== 'pdf' && method !== 'ocr' && method !== 'docx' && method !== 'correction') throw new Error('An extraction method is invalid.')
    const attachment = passage.attachment === undefined ? undefined : identifier(passage.attachment)
    if (attachment && !files.some(file => file.id === attachment)) throw new Error('Extracted text refers to a missing attachment.')
    const page = passage.page === undefined ? undefined : when(passage.page)
    const confidence = passage.confidence
    if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 100)) throw new Error('OCR confidence is invalid.')
    return { text: string(passage.text, 150_000), method, attachment, page, confidence }
  })
  return { status: raw.status, passages, note: raw.note === undefined ? undefined : string(raw.note, 600) }
}

export async function parseBackup(blob: Blob): Promise<Library> {
  if (blob.size > maxBackupBytes) throw new Error('Choose a Catch backup of 150 MB or less.')
  let root: Record<string, unknown>
  try { root = object(JSON.parse(await blob.text())) } catch { throw new Error('This file is not a valid Catch JSON backup.') }
  if (root.version !== 1 && root.version !== 2) throw new Error('This Catch backup version is unsupported.')
  if (root.version === 2) when(root.exportedAt)
  const collections = unique(list(root.collections, 300).map(collect), value => value.id)
  const collectionIds = new Set(collections.map(value => value.id))
  const dictionary = new Map<string, Blob>()
  let binarySize = 0
  for (const row of list(root.version === 2 ? root.binaries : [], 2000)) {
    const item = object(row)
    const hash = string(item.hash, 64)
    if (!hashPattern.test(hash) || dictionary.has(hash)) throw new Error('An attachment checksum is invalid or duplicated.')
    const file = decode(item.data, item.type)
    binarySize += file.size
    if (binarySize > maxBinaryBytes || await sha256(file) !== hash) throw new Error('Attachment checksum or backup size validation failed.')
    dictionary.set(hash, file)
  }
  const resolve = (value: unknown) => unique(list(value, 8).map(row => {
    const item = object(row)
    const hash = string(item.hash, 64)
    const blob = dictionary.get(hash)
    if (!blob) throw new Error('An attachment is missing from the backup.')
    const type = item.type === undefined ? blob.type : string(item.type, 160)
    return { id: identifier(item.id), name: string(item.name, 260).replace(/[/\\]/g, '_'), hash, blob: type === blob.type ? blob : new Blob([blob], { type }) }
  }), file => file.id)
  const clips: Clip[] = []
  for (const row of list(root.clips, 50_000)) {
    const raw = object(row)
    const id = identifier(raw.id)
    if (raw.kind !== 'text' && raw.kind !== 'link' && raw.kind !== 'image' && raw.kind !== 'file') throw new Error('A capture type is invalid.')
    const collection = raw.collection === undefined ? undefined : identifier(raw.collection)
    if (collection && !collectionIds.has(collection)) throw new Error('A capture refers to a missing collection.')
    const attachments = root.version === 2 ? resolve(raw.attachments) : []
    if (root.version === 1 && raw.attachment !== undefined) {
      const legacy = string(raw.attachment, maxBackupBytes).match(/^data:([^;,]*);base64,([\s\S]*)$/)
      if (!legacy) throw new Error('A legacy attachment is corrupted.')
      const file = decode(legacy[2], legacy[1])
      binarySize += file.size
      if (binarySize > maxBinaryBytes) throw new Error('The backup exceeds 100 MB of attachments.')
      attachments.push({ id: id + '-attachment', name: string(raw.filename ?? 'attachment', 260).replace(/[/\\]/g, '_'), blob: file, hash: await sha256(file) })
    }
    const created = when(raw.created)
    const original = raw.original === undefined ? undefined : object(raw.original)
    const reviewed = Object.create(null) as NonNullable<Clip['reviewed']>
    if (raw.reviewed !== undefined) {
      const entries = Object.entries(object(raw.reviewed))
      if (entries.length > 2500) throw new Error('Too many review decisions on one capture.')
      for (const [key, value] of entries) {
        const entry = object(value)
        if (!['accepted', 'rejected', 'dismissed', 'completed'].includes(String(entry.state))) throw new Error('A review decision is invalid.')
        reviewed[string(key, 240)] = { state: entry.state as ReviewState, value: entry.value === undefined ? undefined : string(entry.value, 280) }
      }
    }
    const processing = reading(raw.processing, attachments)
    const body = string(raw.body, 150_000)
    clips.push({
      id, title: string(raw.title, 160), body, kind: raw.kind, created, modified: when(raw.modified ?? created),
      viewed: raw.viewed === undefined ? undefined : when(raw.viewed), collection, attachments,
      hash: await sha256(JSON.stringify([normalizeText(body), attachments.map(file => file.hash).sort()])),
      original: original && { title: string(original.title, 160), body: string(original.body, 150_000), attachments: resolve(original.attachments) },
      pinned: raw.pinned === true, archived: raw.archived === true, trashed: raw.trashed === undefined ? undefined : when(raw.trashed), demo: raw.demo === true,
      artwork: raw.artwork === 'dots' || raw.artwork === 'quote' ? raw.artwork : undefined,
      category: raw.category === undefined ? undefined : string(raw.category, 60), processing,
      suggestedTitle: raw.suggestedTitle === undefined ? undefined : string(raw.suggestedTitle, 160),
      source: raw.source === 'manual' || raw.source === 'clipboard' || raw.source === 'desktop' ? raw.source : undefined,
      tags: raw.tags === undefined ? [] : list(raw.tags, 30).map(tag => string(tag, 36)),
      tasks: raw.tasks === undefined ? [] : unique(list(raw.tasks, 1000).map(value => {
        const task = object(value)
        return { id: string(task.id, 240), label: string(task.label, 280), complete: task.complete === true }
      }), task => task.id), reviewed,
    })
  }
  const prefs = isObject(root.preferences) ? root.preferences : {}
  return {
    clips: unique(clips, clip => clip.id), collections, theme: root.theme === 'dark' || root.theme === 'system' ? root.theme : 'light',
    reduced: root.reduced === true, tourDone: root.tourDone === true, welcomeCollapsed: root.welcomeCollapsed === true,
    preferences: { rememberSearches: prefs.rememberSearches === true, ocr: prefs.ocr === true, reduceTransparency: prefs.reduceTransparency === true,
      autoClassify: prefs.autoClassify === true, semanticDisabled: prefs.semanticDisabled === true, retentionDays: prefs.retentionDays === 30 || prefs.retentionDays === 90 ? prefs.retentionDays : undefined },
  }
}

export function mergeLibrary(current: Library, imported: Library, includePreferences = false): Library {
  const collections = [...current.collections]
  const collectionMap = new Map<string, string>()
  for (const item of imported.collections) {
    const existing = collections.find(value => value.name.toLowerCase() === item.name.toLowerCase())
    const id = existing?.id ?? (collections.some(value => value.id === item.id) ? crypto.randomUUID() : item.id)
    if (!existing) collections.push({ ...item, id })
    collectionMap.set(item.id, id)
  }
  const clips = [...current.clips]
  const byId = new Map(clips.map(clip => [clip.id, clip]))
  for (const clip of imported.clips) {
    const existing = byId.get(clip.id)
    if (existing && isShowcase(clip)) continue
    const sameContent = existing && (existing.hash ? existing.hash === clip.hash : !attachmentsOf(existing).length && !attachmentsOf(clip).length && existing.body === clip.body)
    if (sameContent && existing.title === clip.title && (existing.modified ?? existing.created) === clip.modified) continue
    const copy = { ...clip, id: existing ? crypto.randomUUID() : clip.id, collection: clip.collection ? collectionMap.get(clip.collection) : undefined }
    byId.set(copy.id, copy)
    clips.push(copy)
  }
  return { ...(includePreferences ? { ...current, theme: imported.theme, reduced: imported.reduced, welcomeCollapsed: imported.welcomeCollapsed,
    preferences: { ...imported.preferences, retentionDays: current.preferences?.retentionDays, recentSearches: current.preferences?.recentSearches } } : current), collections, clips }
}
