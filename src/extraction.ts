import workerScript from '../node_modules/tesseract.js/dist/worker.min.js?url'
import coreScript from '../node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Worker as OcrWorker } from 'tesseract.js'
import { cachedAsset, ocrAssets } from './model-assets'
import { attachmentsOf, type Attachment, type Clip, type Passage, type Processing } from './model'
import { rasterType } from './content'

const maxPdfPages = 40
const maxScannedPages = 3
const maxPassageCharacters = 60_000
const maxImagePixels = 14_000_000

export async function prepareOcrRuntime(signal: AbortSignal) {
  await Promise.all([
    import('tesseract.js'),
    ...[workerScript, coreScript].map(async source => {
      const response = await fetch(new URL(source, location.href), { signal })
      if (!response.ok) throw new Error('Could not prepare the local OCR runtime.')
      await response.body?.cancel()
    }),
  ])
}

async function resized(blob: Blob) {
  const image = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, 2900 / Math.max(image.width, image.height), Math.sqrt(maxImagePixels / (image.width * image.height)))
    if (scale === 1 && blob.type !== 'image/webp' && blob.type !== 'image/gif') return blob
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Could not prepare the image.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await toImage(canvas)
  } finally { image.close() }
}

function toImage(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the image.')), 'image/png'))
}

function interruptible<T>(work: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason)
    if (signal.aborted) stop()
    else signal.addEventListener('abort', stop, { once: true })
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

// Tesseract's browser adapter reads its language cache from this store.
// Keep the worker-facing key transient. The verified model cache is authoritative.
async function languageKey(bytes: Uint8Array) {
  const folder = 'catch-ocr-' + crypto.randomUUID()
  const key = folder + '/eng.traineddata'
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('keyval-store')
    request.onupgradeneeded = () => request.result.createObjectStore('keyval')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  function stage(data?: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('keyval', 'readwrite')
      if (data) transaction.objectStore('keyval').put(data, key)
      else transaction.objectStore('keyval').delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
  }
  try { await stage(bytes) } catch (error) { db.close(); throw error }
  return { folder, clear: async () => { try { await stage() } finally { db.close() } } }
}

async function useOcr(progress: (message: string) => void, signal: AbortSignal) {
  const asset = await cachedAsset(ocrAssets[0])
  if (!asset) throw new Error('Install the English OCR model in Settings to read this image.')
  const { createWorker } = await import('tesseract.js')
  const staged = await languageKey(new Uint8Array(await asset.arrayBuffer()))
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(25_000)])
  try {
    let fail: (error: Error) => void = () => undefined
    const failed = new Promise<never>((_, reject) => { fail = reject })
    const worker = createWorker('eng', 1, {
      workerPath: new URL(workerScript, location.href).href,
      corePath: new URL(coreScript, location.href).href,
      langPath: new URL('assets/ocr-cache-only/', location.href).href,
      cachePath: staged.folder, cacheMethod: 'readOnly', workerBlobURL: false, gzip: false,
      logger: event => {
        if (event.status === 'recognizing text') progress('Reading image · ' + Math.round(event.progress * 100) + '%')
      },
      errorHandler: () => fail(new Error('The English OCR worker could not read the image.')),
    }).then(value => {
      if (timeout.aborted) void value.terminate()
      return value
    })
    return await interruptible(Promise.race([worker, failed]), timeout)
  } finally { await staged.clear().catch(() => undefined) }
}

async function recognize(worker: OcrWorker, image: Blob, file: Attachment, signal: AbortSignal, page?: number): Promise<Passage> {
  const input = await resized(image)
  signal.throwIfAborted()
  const { data } = await interruptible(worker.recognize(input), AbortSignal.any([signal, AbortSignal.timeout(45_000)]))
  return { text: data.text.trim().slice(0, maxPassageCharacters), confidence: data.confidence, method: 'ocr', page, attachment: file.id }
}

async function readPdf(file: Attachment, signal: AbortSignal, progress: (message: string) => void, recognizePage?: (blob: Blob, page: number) => Promise<Passage>) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = new URL(pdfWorker, location.href).href
  const loading = getDocument({ data: new Uint8Array(await file.blob.arrayBuffer()), disableRange: true, disableStream: true,
    disableAutoFetch: true, useWorkerFetch: false, maxImageSize: maxImagePixels, enableXfa: false })
  const passages: Passage[] = []
  const notes: string[] = []
  const stop = () => void loading.destroy().catch(() => undefined)
  signal.addEventListener('abort', stop, { once: true })
  try {
    const document = await loading.promise
    const pages = Math.min(document.numPages, maxPdfPages)
    let scans = 0
    let unread = 0
    for (let page = 1; page <= pages; page++) {
      signal.throwIfAborted()
      progress('Reading PDF page ' + page + ' of ' + pages)
      const pdfPage = await document.getPage(page)
      try {
        const content = await pdfPage.getTextContent()
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim()
        if (text) passages.push({ method: 'pdf', text: text.slice(0, maxPassageCharacters), page, attachment: file.id })
        else if (recognizePage && scans < maxScannedPages) {
          scans++
          const original = pdfPage.getViewport({ scale: 1 })
          const viewport = pdfPage.getViewport({ scale: Math.min(2.1, 2100 / Math.max(original.width, original.height)) })
          const canvas = window.document.createElement('canvas')
          canvas.width = Math.max(1, Math.ceil(viewport.width))
          canvas.height = Math.max(1, Math.ceil(viewport.height))
          await pdfPage.render({ canvas, viewport }).promise
          const passage = await recognizePage(await toImage(canvas), page)
          if (passage.text) passages.push(passage)
          else unread++
          canvas.width = canvas.height = 0
        } else unread++
      } finally { pdfPage.cleanup() }
    }
    if (unread) notes.push(unread + ' page' + (unread === 1 ? ' had' : 's had') + ' no extracted text.')
    if (pages < document.numPages) notes.push('Only the first ' + maxPdfPages + ' pages were processed.')
    return { passages, notes }
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('This PDF is password-protected. Attach an unlocked copy to extract text.')
    throw new Error('Could not read this PDF. It may be damaged or use an unsupported format.')
  } finally {
    signal.removeEventListener('abort', stop)
    await loading.destroy().catch(() => undefined)
  }
}

async function readDocx(file: Attachment) {
  const { unzipSync, strFromU8 } = await import('fflate')
  try {
    const data = unzipSync(new Uint8Array(await file.blob.arrayBuffer()), {
      filter: entry => entry.name === 'word/document.xml' && entry.originalSize <= 3 * 1024 ** 2,
    })['word/document.xml']
    if (!data) throw new Error()
    const xml = strFromU8(data)
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error()
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.querySelector('parsererror')) throw new Error()
    const paragraphs = [...document.getElementsByTagNameNS('*', 'p')]
    return paragraphs.map(paragraph => [...paragraph.getElementsByTagNameNS('*', 't')].map(node => node.textContent).join('')).join('\n')
  } catch { throw new Error('Could not extract text from this Word document.') }
}

export async function extractClip(clip: Clip, ocrEnabled: boolean, signal: AbortSignal, progress: (message: string) => void): Promise<Processing> {
  const passages: Passage[] = []
  const notes: string[] = []
  const failures: string[] = []
  let ocr: OcrWorker | undefined
  const stop = () => void ocr?.terminate().catch(() => undefined)
  signal.addEventListener('abort', stop, { once: true })
  const getOcr = async () => {
    signal.throwIfAborted()
    ocr ??= await useOcr(progress, signal)
    signal.throwIfAborted()
    return ocr
  }
  try {
    for (const file of attachmentsOf(clip)) {
      signal.throwIfAborted()
      progress('Reading ' + file.name)
      try {
        if (/\.pdf$/i.test(file.name) || file.blob.type === 'application/pdf') {
          const result = await readPdf(file, signal, progress, ocrEnabled ? async (image, page) => recognize(await getOcr(), image, file, signal, page) : undefined)
          passages.push(...result.passages)
          notes.push(...result.notes)
        } else if (rasterType.test(file.blob.type)) {
          if (!ocrEnabled) { notes.push('Enable English OCR in Settings to read images.'); continue }
          const result = await recognize(await getOcr(), file.blob, file, signal)
          if (result.text) passages.push(result)
          else notes.push('English OCR did not find readable text.')
        } else if (/\.(txt|md|markdown|csv|tsv)$/i.test(file.name) || /^text\/(?:plain|markdown|csv|tab-separated-values)$/.test(file.blob.type)) {
          const text = await file.blob.slice(0, maxPassageCharacters * 4).text()
          if (text.trim()) passages.push({ method: 'text', text: text.slice(0, maxPassageCharacters), attachment: file.id })
          if (text.length > maxPassageCharacters || file.blob.size > maxPassageCharacters * 4) notes.push('Long text was shortened for indexing. The original is available to download.')
        } else if (/\.docx$/i.test(file.name)) {
          const text = await readDocx(file)
          if (text.trim()) passages.push({ method: 'docx', text: text.slice(0, maxPassageCharacters), attachment: file.id })
          if (text.length > maxPassageCharacters) notes.push('Long Word text was shortened for indexing.')
        } else notes.push('Extraction is unsupported for ' + file.name + '. The original is available to download.')
      } catch (error) {
        signal.throwIfAborted()
        failures.push(error instanceof Error ? error.message : 'Could not read the attachment.')
      }
    }
  } finally {
    signal.removeEventListener('abort', stop)
    await ocr?.terminate().catch(() => undefined)
  }
  return { passages, status: failures.length && !passages.length ? 'failed' : failures.length || notes.length ? 'limited' : 'ready',
    note: [...new Set([...failures, ...notes])].join(' ').slice(0, 600) || undefined }
}
