import type { Clip, Library } from './model.ts'
import { sensitiveReason } from './sensitive.ts'

export function recordSearch(library: Library, raw: string): Library {
  const query = raw.trim().slice(0, 160)
  if (!query || !library.preferences?.rememberSearches || sensitiveReason(query)) return library
  const recent = library.preferences.recentSearches ?? []
  if (recent[0] === query) return library
  return { ...library, preferences: { ...library.preferences, recentSearches: [query, ...recent.filter(value => value !== query)].slice(0, 12) } }
}

export function applyCaptureState(clip: Clip, action: 'archive' | 'unarchive' | 'trash' | 'restore', now = Date.now()): Clip {
  switch (action) {
    case 'archive': return { ...clip, archived: true }
    case 'unarchive': return { ...clip, archived: false }
    case 'trash': return { ...clip, trashed: now }
    case 'restore': return { ...clip, trashed: undefined, modified: now }
  }
}
