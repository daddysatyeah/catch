import { prepareClip } from './content.ts'
import type { Clip, Collection, Kind, Library } from './model.ts'
import manifest from '../research/showcase-library.json' with { type: 'json' }

const prefix = 'showcase-v1-'
const folder = 'assets/showcase-v1/'
const legacy = new Set(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'])
const collections = [
  ['ai', 'AI & Machine Learning', '#ee552e'],
  ['education', 'Education & Research', '#838570'],
  ['work', 'Work & Productivity', '#737989'],
  ['finance', 'Finance & Receipts', '#a27953'],
  ['travel', 'Travel', '#ad6f73'],
  ['knowledge', 'Personal Knowledge', '#777970'],
] as const
type Entry = { id: string; title: string; body: string; collection: string; tags: string[]; pinned?: boolean; artwork?: 'quote' }
const sections: [Kind, Entry[], string?][] = [
  ['file', manifest.documents, 'pdf'], ['image', manifest.screens, 'png'],
  ['file', manifest.receipts, 'pdf'], ['file', manifest.travel, 'pdf'],
  ['text', manifest.meetings], ['text', manifest.notes as Entry[]],
  ['link', manifest.links], ['text', manifest.tasks],
]
const entries = Array.from({ length: Math.max(...sections.map(([, rows]) => rows.length)) }, (_, index) =>
  sections.flatMap(([kind, rows, extension]) => rows[index] ? [{ kind, entry: rows[index], extension }] : [])).flat()
const demoEntries = new Map(entries.map(value => [prefix + value.entry.id, value]))

export const exampleQueries = ['NBS-4821', 'graded rubric', 'how can I make a model smaller?']
export const showcaseSize = entries.length
export const hasShowcaseId = (clip: Clip) => demoEntries.has(clip.id)
export const isShowcase = (clip: Clip) => !!clip.demo && hasShowcaseId(clip)

// The 0.2.2 showcase was already opt-in. Keep libraries with that recorded choice.
export function retireAutomaticExamples(library: Library): Library {
  if (library.retiredAutomaticExamples) return library
  const now = Date.now()
  const clips = library.clips.map(clip =>
    clip.demo && !clip.trashed && (legacy.has(clip.id) || (library.showcaseChoice !== 'demo' && hasShowcaseId(clip)))
      ? { ...clip, trashed: now }
      : clip)
  return { ...library, clips, retiredAutomaticExamples: true }
}

export function showcasePreview(clip: Clip) {
  const matched = clip.demo ? demoEntries.get(clip.id) : undefined
  if (matched?.extension) return folder + matched.entry.id + (matched.extension === 'pdf' ? '.webp' : '.png')
}

export async function missingShowcase(library: Library, assetUrl: (path: string) => string) {
  if (library.clips.filter(hasShowcaseId).length >= showcaseSize) return []
  const existing = new Set(library.clips.map(clip => clip.id))
  const now = Date.now()
  const prepared = await Promise.all(entries.map(async ({ kind, entry, extension }, index) => {
    const id = prefix + entry.id
    if (existing.has(id)) return
    const clip: Clip = {
      id, kind, title: entry.title, body: entry.body, demo: true, collection: prefix + entry.collection,
      tags: entry.tags, pinned: entry.pinned, artwork: entry.artwork,
      created: now - Math.floor(index / 8) * 86_400_000 - index * 8 * 60_000,
    }
    if (extension) {
      const name = entry.id + '.' + extension
      const preview = extension === 'pdf' ? fetch(assetUrl(folder + entry.id + '.webp')).catch(() => undefined) : undefined
      const response = await fetch(assetUrl(folder + name))
      if (!response.ok) throw new Error('Could not load a showcase attachment.')
      const bytes = await response.arrayBuffer()
      const magic = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 5)).join(',')
      if (extension === 'pdf' ? magic !== '37,80,68,70,45' : !magic.startsWith('137,80,78,71,')) throw new Error('Unexpected showcase attachment.')
      await preview
      clip.attachments = [{ id: id + '-file', name, blob: new Blob([bytes], { type: extension === 'pdf' ? 'application/pdf' : 'image/png' }) }]
    }
    return prepareClip(clip)
  }))
  return prepared.filter((clip): clip is Clip => !!clip)
}

export function mergeShowcase(library: Library, prepared: Clip[], now = Date.now()): Library {
  const nextCollections = [...library.collections]
  const destinations = new Map<string, string>()
  for (const [key, name, color] of collections) {
    const id = prefix + key
    let group = nextCollections.find(item => item.name.toLowerCase() === name.toLowerCase()) ??
      nextCollections.find(item => item.id === id && item.demo)
    if (!group) {
      group = { id: nextCollections.some(item => item.id === id) ? crypto.randomUUID() : id, name, color, demo: true } satisfies Collection
      nextCollections.push(group)
    }
    destinations.set(id, group.id)
  }
  const existing = new Set(library.clips.map(clip => clip.id))
  const clips = library.clips.map(clip => {
    if (clip.demo && legacy.has(clip.id) && !clip.trashed) return { ...clip, trashed: now }
    if (isShowcase(clip) && clip.trashed) return { ...clip, trashed: undefined, modified: now }
    return clip
  })
  for (const clip of prepared) {
    if (existing.has(clip.id)) continue
    clips.push({ ...clip, collection: destinations.get(clip.collection ?? '') })
    existing.add(clip.id)
  }
  return { ...library, clips, collections: nextCollections, welcomeCollapsed: true, showcaseChoice: 'demo' }
}
