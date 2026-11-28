import { attachmentsOf, type Attachment, type Library } from './model.ts'

export function captureUsage(library: Library) {
  const bytes = { images: 0, files: 0, text: 0, metadata: 0, total: 0 }
  const encoder = new TextEncoder()
  const measure = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength
  for (const clip of library.clips) {
    const { attachment: _legacy, attachments: _files, original, body, title, ...metadata } = clip
    bytes.text += encoder.encode(body).byteLength + encoder.encode(title).byteLength
    if (original) bytes.text += encoder.encode(original.body).byteLength + encoder.encode(original.title).byteLength
    const blobs = new Set<Blob>()
    function attachments(files: Attachment[]) {
      return files.map(({ blob, ...fields }) => {
        if (!blobs.has(blob)) {
          blobs.add(blob)
          if (blob.type.startsWith('image/')) bytes.images += blob.size
          else bytes.files += blob.size
        }
        return fields
      })
    }
    bytes.metadata += measure({ ...metadata, attachments: attachments(attachmentsOf(clip)), original: original && attachments(original.attachments) })
  }
  const { clips: _clips, ...metadata } = library
  bytes.metadata += measure(metadata)
  bytes.total = bytes.images + bytes.files + bytes.text + bytes.metadata
  return bytes
}

export function formatBytes(bytes?: number) {
  if (bytes === undefined) return 'Unavailable'
  if (bytes < 1024) return bytes + ' B'
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)))
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 ** unit) + ' ' + ['B', 'KB', 'MB', 'GB'][unit]
}

export async function originStorage(storage?: Pick<StorageManager, 'estimate' | 'persisted'>) {
  const [estimate, persistence] = await Promise.allSettled([
    Promise.resolve().then(() => storage?.estimate?.()),
    Promise.resolve().then(() => storage?.persisted?.()),
  ])
  return {
    usage: estimate.status === 'fulfilled' ? estimate.value?.usage : undefined,
    quota: estimate.status === 'fulfilled' ? estimate.value?.quota : undefined,
    persistent: persistence.status === 'fulfilled' ? persistence.value : undefined,
  }
}
