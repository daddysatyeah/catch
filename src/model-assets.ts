import { sha256 } from './content.ts'

export const embeddingModel = 'Xenova/all-MiniLM-L6-v2'
export const embeddingRevision = '751bff37182d3f1213fa05d7196b954e230abad9'
export const vectorVersion = 'minilm-q8-' + embeddingRevision + '-chunks-v1'
const source = 'https://huggingface.co/' + embeddingModel + '/resolve/' + embeddingRevision + '/'
export type Asset = { name: string; url: string; bytes: number; hash: string }
export const embeddingAssets: Asset[] = [
  { name: 'config.json', url: source + 'config.json', bytes: 650, hash: '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7' },
  { name: 'tokenizer.json', url: source + 'tokenizer.json', bytes: 711661, hash: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0' },
  { name: 'tokenizer_config.json', url: source + 'tokenizer_config.json', bytes: 366, hash: '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3' },
  { name: 'onnx/model_quantized.onnx', url: source + 'onnx/model_quantized.onnx', bytes: 22972370, hash: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1' },
]
export const ocrAssets: Asset[] = [{
  name: 'eng.traineddata',
  url: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/eng.traineddata',
  bytes: 4113088,
  hash: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
}]
const cacheName = 'catch-verified-models-v1'

export async function hasAssets(assets: Asset[]) {
  const cache = await caches.open(cacheName)
  for (const asset of assets) if (!(await cache.match(asset.url))) return false
  return true
}

export async function cachedAsset(asset: Asset) {
  const cache = await caches.open(cacheName)
  return cache.match(asset.url)
}

export async function removeAssets(assets: Asset[]) {
  const cache = await caches.open(cacheName)
  await Promise.all(assets.map(asset => cache.delete(asset.url)))
}

export async function installAssets(assets: Asset[], signal: AbortSignal, progress: (percent: number) => void) {
  const cache = await caches.open(cacheName)
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0)
  let completed = 0
  for (const asset of assets) {
    signal.throwIfAborted()
    if (!(await cache.match(asset.url))) {
      const response = await fetch(asset.url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok || !response.body) throw new Error('The model download failed. Check your connection and retry.')
      const bytes = new Uint8Array(asset.bytes)
      let offset = 0
      const reader = response.body.getReader()
      try {
        while (true) {
          const result = await reader.read()
          if (result.done) break
          if (result.value.length + offset > bytes.length) throw new Error('The model exceeded its expected size.')
          bytes.set(result.value, offset)
          offset += result.value.length
          progress(Math.floor(99 * (completed + offset) / total))
        }
      } finally { await reader.cancel().catch(() => undefined) }
      if (offset !== asset.bytes || await sha256(bytes) !== asset.hash) throw new Error('The model checksum did not match.')
      signal.throwIfAborted()
      await cache.put(asset.url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(asset.bytes) } }))
    }
    completed += asset.bytes
    progress(Math.floor(100 * completed / total))
  }
}
