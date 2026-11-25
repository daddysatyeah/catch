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

function demoDate(day: number, hour: number, minute: number) {
  const date = new Date()
  date.setDate(date.getDate() - day)
  return date.setHours(hour, minute, 0, 0)
}

export function starterLibrary(): Library {
  const now = Date.now()
  return {
    theme: 'light', reduced: false, tourDone: false,
    collections: [
      { id: 'design', name: 'Design references', color: collectionColors[0], demo: true },
      { id: 'reading', name: 'Reading list', color: collectionColors[1], demo: true },
      { id: 'personal', name: 'Personal', color: collectionColors[2], demo: true },
    ],
    clips: [
      { id: 'd1', title: 'A field guide to dot matrices', body: 'A reference for making icons from a regular grid. Start with the silhouette, leave room for negative space, and test it at the smallest size first.', kind: 'image', artwork: 'dots', created: demoDate(1, 15, 20), collection: 'design', pinned: true, demo: true },
      { id: 'd2', title: 'A note on paying attention', body: 'The things we notice are the things we get to keep.', kind: 'text', artwork: 'quote', created: demoDate(1, 11, 40), collection: 'personal', pinned: true, demo: true },
      { id: 'd3', title: 'The shape of a useful note', body: 'A good note is a small container for a good thought. Keep the source, write down what made it interesting, and give it a title you can find later.', kind: 'text', created: now - 12 * 60_000, collection: 'personal', demo: true },
      { id: 'd4', title: 'Materials — Apple Human Interface Guidelines', body: 'https://developer.apple.com/design/human-interface-guidelines/materials', kind: 'link', created: now - 56 * 60_000, collection: 'design', demo: true },
      { id: 'd5', title: 'Studio receipt', body: 'Demo receipt\nFieldwork Studio\n1 × Archival print\nTotal: $24.00', kind: 'file', filename: 'studio-receipt.txt', attachment: new Blob(['Demo receipt\nFieldwork Studio\n1 × Archival print\nTotal: $24.00'], { type: 'text/plain' }), created: now - 112 * 60_000, demo: true },
      { id: 'd6', title: 'A reconsideration of the everyday', body: 'https://www.designmuseum.org/', kind: 'link', created: demoDate(1, 13, 4), collection: 'reading', demo: true },
      { id: 'd7', title: 'Weekend list', body: 'Return the library books\nPick up a new sketchbook\nTake the long way home', kind: 'text', created: demoDate(2, 16, 14), collection: 'personal', demo: true },
    ],
  }
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
