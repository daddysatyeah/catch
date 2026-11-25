export type Kind = 'text' | 'link' | 'image' | 'file'
export type Theme = 'light' | 'dark' | 'system'
export type Collection = { id: string; name: string; color: string; demo?: boolean }
export type Attachment = { id: string; name: string; blob: Blob; hash?: string }
export type Passage = { text: string; method: 'text' | 'pdf' | 'ocr' | 'docx' | 'correction'; attachment?: string; page?: number; confidence?: number }
export type ReviewState = 'accepted' | 'rejected' | 'dismissed' | 'completed'
export type Processing = { status: 'ready' | 'limited' | 'failed'; passages: Passage[]; note?: string }
export type Clip = {
  id: string
  title: string
  body: string
  kind: Kind
  created: number
  modified?: number
  viewed?: number
  source?: 'manual' | 'clipboard' | 'desktop'
  suggestedTitle?: string
  original?: { title: string; body: string; attachments: Attachment[] }
  collection?: string
  tags?: string[]
  category?: string
  pinned?: boolean
  archived?: boolean
  trashed?: number
  demo?: boolean
  artwork?: 'dots' | 'quote'
  attachment?: Blob
  filename?: string
  attachments?: Attachment[]
  hash?: string
  processing?: Processing
  prediction?: { category?: string; similarity?: number; margin?: number; version: string }
  reviewed?: Record<string, { state: ReviewState; value?: string }>
  tasks?: { id: string; label: string; complete: boolean }[]
}
export type Library = {
  clips: Clip[]
  collections: Collection[]
  theme: Theme
  reduced: boolean
  tourDone: boolean
  welcomeCollapsed?: boolean
  showcaseChoice?: 'demo' | 'empty'
  preferences?: {
    recentSearches?: string[]
    rememberSearches?: boolean
    retentionDays?: number
    ocr?: boolean
    autoClassify?: boolean
    semanticDisabled?: boolean
    reduceTransparency?: boolean
  }
}

export const kinds: Record<Kind, string> = { text: 'Text', link: 'Link', image: 'Image', file: 'File' }
export const collectionColors = ['#ee552e', '#838570', '#a27953', '#737989', '#ad6f73']

export function starterLibrary(): Library {
  return { theme: 'light', reduced: false, tourDone: false, collections: [], clips: [] }
}

export function safeUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url
  } catch { /* Plain text is an equally valid capture. */ }
  return undefined
}

export function describe(clip: Clip) {
  if (clip.kind === 'link') return safeUrl(clip.body)?.hostname ?? clip.body
  if (clip.filename) return clip.filename
  if (clip.attachments?.length) return clip.attachments[0].name + (clip.attachments.length > 1 ? ' +' + (clip.attachments.length - 1) : '')
  return clip.body.replace(/\s+/g, ' ')
}

export function attachmentsOf(clip: Clip): Attachment[] {
  if (clip.attachments) return clip.attachments
  return clip.attachment ? [{ id: clip.id + '-attachment', name: clip.filename || 'attachment', blob: clip.attachment }] : []
}

export function visibleClips(clips: Clip[]) {
  return clips.filter(clip => !clip.trashed && !clip.archived)
}

export function searchClips(library: Library, query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return [...library.clips].sort((a, b) => b.created - a.created).filter(clip => {
    const collection = library.collections.find(value => value.id === clip.collection)
    const searchable = [clip.title, clip.body, clip.filename, kinds[clip.kind], collection?.name]
      .join(' ').toLocaleLowerCase()
    return terms.every(term => searchable.includes(term))
  })
}

export function formatDay(time: number) {
  const date = new Date(time)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(date.getFullYear() !== today.getFullYear() && { year: 'numeric' }) }).format(date)
}

export const clockTime = (value: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value)
export const longDate = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
