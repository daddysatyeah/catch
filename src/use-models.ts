import { useEffect, useRef, useState } from 'react'
import { warmEncoder, stopEncoder } from './inference'
import { embeddingAssets, hasAssets, installAssets, ocrAssets, removeAssets } from './model-assets'
import { clearVectors } from './storage'

export type ModelName = 'semantic' | 'ocr'
type ModelState = { phase: 'checking' | 'missing' | 'downloading' | 'loading' | 'ready' | 'error'; percent?: number; message?: string }
const assets = { semantic: embeddingAssets, ocr: ocrAssets }

async function cacheSemanticRuntime(signal: AbortSignal) {
  if (!import.meta.env.PROD || window.catchDesktop || !('serviceWorker' in navigator)) return
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
  bounded.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const finished = (error?: unknown) => {
      channel.port1.close()
      bounded.removeEventListener('abort', cancel)
      if (error) reject(error)
      else resolve()
    }
    const cancel = () => finished(bounded.reason)
    bounded.addEventListener('abort', cancel, { once: true })
    channel.port1.onmessage = event => finished(event.data === true ? undefined : new Error('The local search runtime could not be cached.'))
    void navigator.serviceWorker.ready.then(registration => {
      if (!bounded.aborted) registration.active?.postMessage('cache-semantic-runtime', [channel.port2])
    }).catch(finished)
  })
}

export function useModels() {
  const [status, setStatus] = useState<Record<ModelName, ModelState>>({ semantic: { phase: 'checking' }, ocr: { phase: 'checking' } })
  const operations = useRef<Partial<Record<ModelName, AbortController>>>({})
  const update = (name: ModelName, value: ModelState) => setStatus(previous => ({ ...previous, [name]: value }))
  useEffect(() => {
    let active = true
    const lifetime = new AbortController()
    for (const key of ['semantic', 'ocr'] as const) {
      hasAssets(assets[key]).then(ready => {
        if (!active) return
        update(key, { phase: ready ? 'ready' : 'missing' })
        if (ready && key === 'semantic' && navigator.onLine) void cacheSemanticRuntime(lifetime.signal).catch(() => undefined)
      })
        .catch(() => { if (active) update(key, { phase: 'error', message: 'Model storage is unavailable in this browser.' }) })
    }
    const controllers = operations.current
    return () => { active = false; lifetime.abort(); Object.values(controllers).forEach(operation => operation?.abort()); stopEncoder() }
  }, [])

  async function install(name: ModelName) {
    if (operations.current[name]) return
    const controller = new AbortController()
    operations.current[name] = controller
    update(name, { phase: 'downloading', percent: 0 })
    try {
      await installAssets(assets[name], controller.signal, percent => update(name, { phase: 'downloading', percent }))
      update(name, { phase: 'loading' })
      if (name === 'semantic') {
        await cacheSemanticRuntime(controller.signal)
        await warmEncoder()
      }
      else {
        const { prepareOcrRuntime } = await import('./extraction')
        await prepareOcrRuntime(controller.signal)
      }
      controller.signal.throwIfAborted()
      update(name, { phase: 'ready' })
    } catch (error) {
      update(name, controller.signal.aborted ? { phase: 'missing', message: 'Download cancelled. Verified files are kept for retry.' } :
        { phase: 'error', message: error instanceof TypeError ? 'Network request failed. Check your connection.' : error instanceof Error ? error.message : 'Could not install this model.' })
    } finally { delete operations.current[name] }
  }

  function cancel(name: ModelName) {
    operations.current[name]?.abort()
    if (name === 'semantic') stopEncoder()
  }

  async function remove(name: ModelName) {
    cancel(name)
    try {
      await removeAssets(assets[name])
      if (name === 'semantic') await clearVectors()
      update(name, { phase: 'missing' })
    } catch { update(name, { phase: 'error', message: 'Could not remove the model from this browser.' }) }
  }
  return { status, install, cancel, remove }
}

export type Models = ReturnType<typeof useModels>
