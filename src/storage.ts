import { attachmentsOf, starterLibrary, type Clip, type Library } from './model.ts'
import { retireAutomaticExamples } from './showcase.ts'
import { applyRetention } from './content.ts'

export type Change = (current: Library) => Library
export type VectorRecord = { id: string; version: string; signature: string; chunks: { text: string; page?: number; attachment?: string; vector: Float32Array }[] }
type Metadata = Omit<Library, 'clips'>
let opening: Promise<IDBDatabase> | undefined

function migrateClip(clip: Clip) {
  const { attachment: _blob, filename: _name, ...fields } = clip
  return { ...fields, attachments: attachmentsOf(clip), modified: clip.modified ?? clip.created }
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function open() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('catch-library', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      const transaction = request.transaction!
      const metadata = db.createObjectStore('metadata')
      const clips = db.createObjectStore('clips', { keyPath: 'id' })
      db.createObjectStore('vectors', { keyPath: 'id' })
      const write = (value: Library) => {
        const { clips: originals, ...settings } = value
        metadata.put(settings, 'current')
        const now = Date.now()
        for (const clip of originals) {
          clips.put(migrateClip(clip.demo && clip.created > now ? { ...clip, created: now - 1 } : clip))
        }
      }
      if (db.objectStoreNames.contains('library')) {
        const previous = transaction.objectStore('library').get('current')
        previous.onsuccess = () => {
          write((previous.result as Library | undefined) ?? starterLibrary())
          db.deleteObjectStore('library')
        }
      } else write(starterLibrary())
    }
    request.onblocked = () => reject(new Error('Close other Catch tabs, then try again.'))
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); opening = undefined }
      resolve(db)
    }
  }).catch(error => { opening = undefined; throw error })
  return opening
}

export async function transact(change?: Change) {
  const db = await open()
  return new Promise<Library>((resolve, reject) => {
    const transaction = db.transaction(['metadata', 'clips', 'vectors'], change ? 'readwrite' : 'readonly')
    const settings = transaction.objectStore('metadata')
    const clips = transaction.objectStore('clips')
    const vectors = transaction.objectStore('vectors')
    let current: Library
    let failure: unknown
    const ready = Promise.all([requestResult(settings.get('current')), requestResult(clips.getAll())])
    ready.then(([metadata, values]) => {
      const previous = values as Clip[]
      const baseline = { ...(metadata as Metadata), clips: previous }
      current = change ? change(baseline) : baseline
      if (!change || current === baseline) return
      const { clips: next, ...preferences } = current
      if (Object.keys(preferences).some(key => preferences[key as keyof Metadata] !== (metadata as Metadata)[key as keyof Metadata])) settings.put(preferences, 'current')
      const byId = new Map(previous.map(clip => [clip.id, clip]))
      for (const clip of next) {
        const old = byId.get(clip.id)
        if (old !== clip) clips.put(clip)
        if ((old && (clip.hash !== old.hash || clip.body !== old.body || clip.title !== old.title ||
          clip.processing !== old.processing || clip.tags !== old.tags || clip.collection !== old.collection)) || clip.trashed) vectors.delete(clip.id)
        byId.delete(clip.id)
      }
      for (const id of byId.keys()) { clips.delete(id); vectors.delete(id) }
    }).catch(error => {
      failure = error
      try { transaction.abort() } catch { /* IndexedDB may already have aborted a failed request. */ }
    })
    transaction.oncomplete = () => resolve(current)
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Could not update the local library.'))
  })
}

export async function readLibrary() {
  const library = await transact()
  if (library.retiredAutomaticExamples && applyRetention(library) === library) return library
  return transact(current => retireAutomaticExamples(applyRetention(current)))
}

export async function readVectors() {
  const db = await open()
  return requestResult(db.transaction('vectors').objectStore('vectors').getAll()) as Promise<VectorRecord[]>
}

type VectorWrite = { record: VectorRecord; expected: { hash?: string; modified?: number } }

export async function writeVectors(writes: VectorWrite[]) {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['vectors', 'clips'], 'readwrite')
    const clips = transaction.objectStore('clips'), vectors = transaction.objectStore('vectors')
    for (const { record, expected } of writes) {
      const lookup = clips.get(record.id)
      lookup.onsuccess = () => {
        const clip = lookup.result as Clip | undefined
        if (clip && !clip.trashed && clip.hash === expected.hash && clip.modified === expected.modified) vectors.put(record)
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}

export function writeVector(record: VectorRecord, expected: VectorWrite['expected']) {
  return writeVectors([{ record, expected }])
}

export async function clearVectors() {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('vectors', 'readwrite')
    transaction.objectStore('vectors').clear()
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}
