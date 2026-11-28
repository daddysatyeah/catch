import { sha256 } from './content'
import { categoryVersion, decideCategory, linearCategoryScores } from './classification'
import { vectorVersion } from './model-assets'
import type { Clip } from './model'
import { chunksOf, semanticRanking } from './retrieval'
import { readVectors, writeVectors, type VectorRecord, type LibraryScope } from './storage'

type Answer = { id: number; vectors?: number[][]; error?: string }
const pending = new Map<number, { resolve: (value: number[][]) => void; reject: (error: Error) => void }>()
let worker: Worker | undefined
let seq = 0
const fingerprints = new WeakMap<Clip, { chunks: ReturnType<typeof chunksOf>; signature: Promise<string> }>()

function indexInput(clip: Clip) {
  let input = fingerprints.get(clip)
  if (!input) {
    const chunks = chunksOf(clip)
    input = { chunks, signature: sha256(JSON.stringify(chunks)) }
    fingerprints.set(clip, input)
    void input.signature.catch(() => fingerprints.delete(clip))
  }
  return input
}

export function stopEncoder() {
  worker?.terminate()
  worker = undefined
  for (const item of pending.values()) item.reject(new Error('Local model stopped.'))
  pending.clear()
}

function instance() {
  if (worker) return worker
  worker = new Worker(new URL('./model-worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<Answer>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    if (response.error) request.reject(new Error(response.error))
    else request.resolve(response.vectors ?? [])
  }
  worker.onerror = () => stopEncoder()
  return worker
}

function request(text?: string[]) {
  const target = instance()
  const id = ++seq
  return new Promise<number[][]>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    target.postMessage({ id, text })
  })
}

export async function warmEncoder() { await request() }

export async function embed(text: string[]) {
  return (await request(text)).map(value => Float32Array.from(value))
}

export async function indexClips(clips: Clip[], signal: AbortSignal, onProgress: (current: number, total: number) => void, scope?: LibraryScope) {
  const saved = new Map((await readVectors(scope)).filter(record => record.version === vectorVersion).map(record => [record.id, record]))
  const output: VectorRecord[] = []
  for (let offset = 0; offset < clips.length; offset += 16) {
    signal.throwIfAborted()
    const group = await Promise.all(clips.slice(offset, offset + 16).map(async clip => {
      const input = indexInput(clip)
      return { clip, chunks: input.chunks, signature: await input.signature }
    }))
    const changed = group.filter(item => saved.get(item.clip.id)?.signature !== item.signature)
      .map(item => ({ ...item, embedded: [] as VectorRecord['chunks'] }))
    const queue = changed.flatMap(item => item.chunks.map(chunk => ({ chunk, target: item.embedded })))
    for (let start = 0; start < queue.length; start += 8) {
      signal.throwIfAborted()
      const batch = queue.slice(start, start + 8)
      const vectors = await embed(batch.map(item => item.chunk.text))
      signal.throwIfAborted()
      batch.forEach(({ chunk, target }, index) => target.push({ ...chunk, vector: vectors[index] }))
    }
    const writes = changed.map(({ clip, signature, embedded }) => ({
      expected: clip, record: { id: clip.id, version: vectorVersion, signature, chunks: embedded },
    }))
    if (writes.length) await writeVectors(writes, scope)
    for (const { record } of writes) saved.set(record.id, record)
    output.push(...group.map(({ clip }) => saved.get(clip.id)!))
    onProgress(output.length, clips.length)
  }
  return output
}

export async function relatedMemories(clip: Clip, others: Clip[], signal: AbortSignal, scope?: LibraryScope) {
  const all = await indexClips([clip, ...others], signal, () => undefined, scope)
  const actual = all[0].chunks.find((_, index) => index === 1) ?? all[0].chunks[0]
  return actual ? semanticRanking(others, all.slice(1), actual.vector).filter(hit => hit.score >= .36).slice(0, 4) : []
}

export async function classifyClip(clip: Clip, signal: AbortSignal) {
  const content = chunksOf(clip).slice(0, 4).map(chunk => chunk.text).join('\n').slice(0, 1900)
  const version = vectorVersion + '/' + categoryVersion
  if (content.length < 24) return { version }
  signal.throwIfAborted()
  const [[vector], { default: weights }] = await Promise.all([embed([content]), import('./category-weights.json')])
  signal.throwIfAborted()
  return { ...decideCategory(linearCategoryScores(vector, weights), 0, .02), version }
}
