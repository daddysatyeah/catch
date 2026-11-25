import { useCallback, useEffect, useState } from 'react'
import type { Library } from './model'
import { readLibrary, transact, type Change } from './storage'
import { createBackup } from './backup'

function publish() {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel('catch-library')
    channel.postMessage('changed')
    channel.close()
  } catch { /* Storage has already committed, even without cross-tab updates. */ }
}

export function useLibrary() {
  const [library, setLibrary] = useState<Library>()
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    readLibrary().then(value => { setLibrary(value); setError(false) }).catch(() => setError(true))
  }, [])
  useEffect(() => {
    load()
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('catch-library') : undefined
    if (channel) channel.onmessage = load
    return () => channel?.close()
  }, [load])
  const update = useCallback(async (change: Change) => {
    setLibrary(await transact(change))
    publish()
  }, [])
  return { library, update, error, load }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000)
}

export async function exportLibrary(library: Library) {
  download(await createBackup(library), 'catch-library.json')
}
