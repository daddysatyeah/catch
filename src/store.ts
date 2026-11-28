import { useCallback, useEffect, useState } from 'react'
import type { Library } from './model'
import { readLibrary, transact, type Change, type LibraryScope } from './storage'
import { createBackup } from './backup'

const channelName = (scope: LibraryScope) => scope ? 'catch-library:profile:' + scope : 'catch-library'

function publish(scope: LibraryScope) {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const channel = new BroadcastChannel(channelName(scope))
    channel.postMessage('changed')
    channel.close()
  } catch { /* Storage has already committed, even without cross-tab updates. */ }
}

export function useLibrary(scope: LibraryScope, ready = true) {
  const [library, setLibrary] = useState<Library>()
  const [error, setError] = useState(false)
  const load = useCallback(() => {
    readLibrary(scope).then(value => { setLibrary(value); setError(false) }).catch(() => setError(true))
  }, [scope])
  useEffect(() => {
    if (!ready) return
    load()
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName(scope)) : undefined
    if (channel) channel.onmessage = load
    return () => channel?.close()
  }, [load, ready, scope])
  const update = useCallback(async (change: Change) => {
    setLibrary(await transact(change, scope))
    publish(scope)
  }, [scope])
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
