import { initializeApp } from '@firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from '@firebase/auth'
import type { Account, AuthProvider } from './account'

export function connectFirebase(config: { apiKey: string; authDomain: string; projectId: string; appId: string }): AuthProvider {
  const auth = getAuth(initializeApp(config, 'catch-account'))
  function profile(user: User | null): Account | null {
    if (!user?.emailVerified || !user.email) return null
    let photo: string | undefined
    if (user.photoURL) {
      try {
        const url = new URL(user.photoURL)
        if (url.protocol === 'https:' && !url.port && !url.username && !url.password && /(^|\.)googleusercontent\.com$/.test(url.hostname)) photo = url.href
      } catch { /* Use account initials when an avatar cannot be loaded. */ }
    }
    return { scope: config.projectId + ':' + user.uid, name: user.displayName?.trim() || user.email, email: user.email, photo }
  }
  function verified(user: User) {
    const account = profile(user)
    if (!account) throw new Error('An email-verified account is required.')
    return account
  }
  return {
    watch: (change, failed) => onAuthStateChanged(auth, user => change(profile(user)), failed),
    google: () => {
      const google = new GoogleAuthProvider()
      google.setCustomParameters({ prompt: 'select_account' })
      return signInWithPopup(auth, google).then(({ user }) => verified(user))
    },
    signOut: () => signOut(auth),
  }
}
