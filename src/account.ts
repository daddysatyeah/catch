export type Account = { scope: string; name: string; email: string; photo?: string }
export type AuthProvider = {
  watch: (change: (value: Account | null) => void, failed: () => void) => () => void
  google: () => Promise<Account>
  signOut: () => Promise<void>
}

export function authMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Google sign-in was cancelled. You can try again.'
    case 'auth/popup-blocked': return 'The browser blocked Google’s window. Allow popups for Catch or continue as guest.'
    case 'auth/too-many-requests': return 'Too many requests. Wait a moment before trying again.'
    case 'auth/network-request-failed': return 'Catch couldn’t reach the sign-in provider. Check your connection and retry.'
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain': return 'This sign-in method is unavailable for this site. You can continue as guest.'
    default: return 'Couldn’t complete sign-in. Try again or continue as guest.'
  }
}

export function initialLetters(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]?.toUpperCase()).join('') || 'C'
}

export function firebaseDomain(projectId: string, authDomain: string) {
  return /^[a-z][a-z0-9-]{2,62}$/.test(projectId) && authDomain === projectId + '.firebaseapp.com'
}
