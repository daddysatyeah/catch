import { bodyPassages, tokens } from './content.ts'
import { attachmentsOf, kinds, type Clip, type Library } from './model.ts'
import type { VectorRecord } from './storage.ts'

export type SearchMode = 'keyword' | 'semantic' | 'hybrid'
export type FilterSet = { kind?: string; collection?: string; tag?: string; after?: string; includeArchived?: boolean }
export type Hit = { clip: Clip; score: number; snippet: string; page?: number; attachment?: string; method: SearchMode; matches?: string[] }
export type Chunk = { text: string; page?: number; attachment?: string }

export function eligible(clips: Clip[], filters: FilterSet = {}) {
  const after = filters.after ? Date.parse(filters.after + 'T00:00:00') : 0
  return clips.filter(clip => !clip.trashed && (!clip.archived || filters.includeArchived) &&
    (!filters.kind || clip.kind === filters.kind) && (!filters.collection || clip.collection === filters.collection) &&
    (!filters.tag || clip.tags?.includes(filters.tag)) && (!after || clip.created >= after))
}

export function chunksOf(clip: Clip): Chunk[] {
  const metadata = [clip.title, ...(clip.tags ?? []), ...attachmentsOf(clip).map(file => file.name)].filter(Boolean).join(', ')
  const passages = bodyPassages(clip)
  const chunks: Chunk[] = []
  if (metadata) chunks.push({ text: metadata })
  for (const passage of passages) {
    const words = passage.text.trim().split(/\s+/u)
    for (let offset = 0; offset < words.length && chunks.length < 64;) {
      const pageWords = words.slice(offset, offset + 125)
      const text = pageWords.join(' ').slice(0, 2400)
      if (text) chunks.push({ text, page: passage.page, attachment: passage.attachment })
      if (offset + 125 >= words.length) break
      offset += 100
    }
    if (chunks.length >= 64) break
  }
  return chunks
}

function termCounts(terms: string[]) {
  const counts = new Map<string, number>()
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
  return counts
}

const lexicalCache = new WeakMap<Clip, {
  collection?: string; chunks: Chunk[]; length: number; counts: Map<string, number>
}>()

function lexicalDocument(clip: Clip, collection?: string) {
  const cached = lexicalCache.get(clip)
  if (cached && cached.collection === collection) return cached
  const chunks = chunksOf(clip)
  const terms = tokens([clip.title, clip.title, kinds[clip.kind], collection, ...chunks.map(chunk => chunk.text)].join(' '))
  const result = { collection, chunks, length: terms.length, counts: termCounts(terms) }
  lexicalCache.set(clip, result)
  return result
}

export function excerpt(text: string, terms: string[] = []) {
  const lower = text.toLowerCase()
  const positions = terms.map(term => lower.indexOf(term)).filter(index => index >= 0)
  const from = positions.length ? Math.max(0, Math.min(...positions) - 38) : 0
  return (from ? '…' : '') + text.slice(from, from + 190) + (text.length > from + 190 ? '…' : '')
}

export function keywordRanking(library: Library, query: string, clips = eligible(library.clips)): Hit[] {
  const terms = [...new Set(tokens(query))].slice(0, 32)
  const collectionNames = new Map(library.collections.map(collection => [collection.id, collection.name]))
  if (!terms.length) return query.trim() && !/[^\p{P}\p{S}\s]/u.test(query) ?
    clips.filter(clip => [clip.title, clip.body].some(value => value.toLowerCase().includes(query.toLowerCase().trim())))
      .map(clip => ({ clip, score: 1, snippet: excerpt(clip.body || clip.title, [query.trim()]), method: 'keyword' })) :
    [...clips].sort((a, b) => b.created - a.created).map(clip => ({ clip, score: 0, snippet: excerpt(clip.body), method: 'keyword' }))
  const documents = clips.map(clip => ({ clip, ...lexicalDocument(clip, collectionNames.get(clip.collection ?? '')) }))
  const average = Math.max(1, documents.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, documents.length))
  const weights = terms.map(term => {
    const found = documents.reduce((sum, doc) => sum + Number(doc.counts.has(term)), 0)
    return Math.log(1 + (documents.length - found + .5) / (found + .5))
  })
  return documents.flatMap(({ clip, chunks, counts, length }) => {
    const matched = terms.filter(term => counts.has(term))
    if (!matched.length) return []
    const score = terms.reduce((sum, term, index) => {
      const count = counts.get(term) ?? 0
      return sum + weights[index] * (2.2 * count) / (count + 1.2 * (.25 + .75 * length / average))
    }, 0)
    const strength = (piece: Chunk) => {
      const words = new Set(tokens(piece.text))
      return matched.reduce((sum, term) => sum + Number(words.has(term)), 0)
    }
    const evidence = [...chunks].sort((a, b) => strength(b) - strength(a) || Number(!!b.attachment) - Number(!!a.attachment))[0]
    return [{ clip, score, snippet: excerpt(evidence?.text ?? clip.title, matched), page: evidence?.page, attachment: evidence?.attachment, method: 'keyword' as const, matches: matched }]
  }).sort((a, b) => b.score - a.score || b.clip.created - a.clip.created)
}

export function cosine(first: Float32Array, second: Float32Array) {
  if (first.length !== second.length || !first.length) return 0
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < first.length; i++) { dot += first[i] * second[i]; aa += first[i] ** 2; bb += second[i] ** 2 }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}

export function semanticRanking(clips: Clip[], records: VectorRecord[], query: Float32Array): Hit[] {
  const byId = new Map(clips.map(clip => [clip.id, clip]))
  return records.flatMap(record => {
    const clip = byId.get(record.id)
    if (!clip) return []
    let score = -Infinity
    let best: VectorRecord['chunks'][number] | undefined
    for (const chunk of record.chunks) {
      const value = cosine(query, chunk.vector)
      if (value > score) { score = value; best = chunk }
    }
    return best ? [{ clip, score, snippet: excerpt(best.text), page: best.page, attachment: best.attachment, method: 'semantic' as const }] : []
  }).sort((a, b) => b.score - a.score)
}

export function hybridRanking(keyword: Hit[], semantic: Hit[], constant = 60, keywordWeight = 1, keywordDepth = Infinity): Hit[] {
  const scores = new Map<string, Hit>()
  const rankings = [[keyword.slice(0, keywordDepth), keywordWeight], [semantic, 1]] as const
  for (const [results, weight] of rankings) results.forEach((hit, index) => {
    const previous = scores.get(hit.clip.id)
    const score = (previous?.score ?? 0) + weight / (constant + index + 1)
    scores.set(hit.clip.id, { ...(previous ?? hit), method: 'hybrid', score })
  })
  return [...scores.values()].sort((a, b) => b.score - a.score || b.clip.created - a.clip.created)
}

export function referenceMatches(query: string, keyword: Hit[]) {
  const reference = query.trim()
  if (!/^[a-z]{2,8}-\d{3,10}$/i.test(reference)) return []
  const exact = new RegExp('(?<![\\p{L}\\p{N}-])' + reference + '(?![\\p{L}\\p{N}-])', 'iu')
  return keyword.filter(hit => chunksOf(hit.clip).some(chunk => exact.test(chunk.text)))
}

export function defaultHybridRanking(keyword: Hit[], semantic: Hit[], query: string) {
  const exact = referenceMatches(query, keyword)
  if (!exact.length) return hybridRanking(keyword, semantic, 20, .15, 10)
  const identifiers = new Set(exact.map(hit => hit.clip.id))
  return [...exact, ...semantic.filter(hit => !identifiers.has(hit.clip.id))]
}
