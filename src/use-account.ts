import { useEffect, useState } from 'react'
import { firebaseDomain, type Account, type AuthProvider } from './account'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
}
const configured = !window.catchDesktop && !!config.apiKey && !!config.appId && firebaseDomain(config.projectId, config.authDomain)

export function useAccount() {
  const [provider, setProvider] = useState<AuthProvider>()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(configured)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!configured) return
    let active = true
    let stop: (() => void) | undefined
    const deadline = window.setTimeout(() => { failed(); active = false; stop?.() }, 12_000)
    function failed() {
      if (!active) return
      window.clearTimeout(deadline)
      setUnavailable(true)
      setAccount(null)
      setLoading(false)
    }
    void import('./auth-provider').then(({ connectFirebase }) => {
      if (!active) return
      const auth = connectFirebase(config)
      stop = auth.watch(value => { if (active) {
        window.clearTimeout(deadline)
        setAccount(value)
        setProvider(auth)
        setLoading(false)
      } }, failed)
    }).catch(failed)
    return () => { active = false; window.clearTimeout(deadline); stop?.() }
  }, [])

  const availability: 'desktop' | 'unconfigured' | 'unavailable' | 'loading' | 'ready' =
    window.catchDesktop ? 'desktop' : !configured ? 'unconfigured' : unavailable ? 'unavailable' : loading ? 'loading' : 'ready'
  return { account, provider, loading, availability }
}
