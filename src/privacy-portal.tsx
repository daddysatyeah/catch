import { useLayoutEffect, useRef, useState } from 'react'
import { authMessage, type Account } from './account'
import { BrandIdentity, Icon } from './graphics'
import { PrivacyCore } from './privacy-core'
import type { useAccount } from './use-account'
import './privacy-portal.css'

export type CoreFlight = { bounds: DOMRect; snapshot?: string }

const availabilityText = {
  unconfigured: 'Sign-in hasn’t been configured for this build. Your guest library is available.',
  desktop: 'Sign-in is available in the browser edition. This Windows library stays on this device.',
  unavailable: 'Couldn’t open the sign-in provider. Reload to retry, or continue as guest.',
  loading: 'Connecting to the sign-in provider…',
  ready: '',
}

type PortalProps = {
  auth: ReturnType<typeof useAccount>; close: () => void;
  guest: () => Promise<void>; success: (account: Account, flight?: CoreFlight) => void
}

export default function PrivacyPortal({ auth, close, guest, success }: PortalProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const artwork = useRef<HTMLCanvasElement>(null)
  const [pending, setPending] = useState<'google' | 'guest'>()
  const [error, setError] = useState('')
  const busy = useRef(false)
  const ready = !!auth.provider && auth.availability === 'ready'
  const note = availabilityText[auth.availability]

  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { if (element?.open) element.close() }
  }, [])
  const dismiss = () => { if (!busy.current) close() }

  function complete(account: Account) {
    const canvas = artwork.current
    const bounds = canvas?.getBoundingClientRect()
    let flight: CoreFlight | undefined
    if (bounds && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.reduce !== 'true') {
      try { flight = { bounds, snapshot: canvas?.toDataURL() } } catch { flight = { bounds } }
    }
    success(account, flight)
  }

  async function run(operation: NonNullable<typeof pending>, action: () => Promise<void>) {
    if (busy.current) return
    setError('')
    busy.current = true
    setPending(operation)
    try { await action() }
    catch (problem) { setError(authMessage(problem)) }
    finally { busy.current = false; setPending(undefined) }
  }

  return <dialog ref={dialog} className="privacy-portal" aria-labelledby="portal-title" onCancel={event => { event.preventDefault(); dismiss() }}>
    <div className="privacy-layout">
      <header className="privacy-brand">
        <div role="img" aria-label="Catch"><BrandIdentity/></div>
        <button autoFocus className="icon-button portal-close" aria-label="Close sign-in" disabled={!!pending} onClick={dismiss}><Icon name="close" size={20}/></button>
      </header>
      <div className="privacy-composition">
        <PrivacyCore artwork={artwork} phase={pending === 'google' ? 'pending' : 'idle'}/>
        <section className="privacy-copy">
          <h1 id="portal-title"><span>Yours.</span>{' '}<span>Only yours.</span></h1>
          <p className="portal-subtitle">A space for everything you want to keep.</p>
          <div className="portal-actions">
            <button className="portal-method portal-google" disabled={auth.availability === 'loading' || !!pending} onClick={() => {
              if (!ready || !auth.provider) { setError(note); return }
              const provider = auth.provider
              void run('google', async () => complete(await provider.google()))
            }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91a8.75 8.75 0 0 0 2.69-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.95-2.18l-2.91-2.26c-.8.54-1.84.86-3.04.86a5.37 5.37 0 0 1-5.04-3.72h-3v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97h-3a9 9 0 0 0 0 8.06l3-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.59-2.59A8.63 8.63 0 0 0 9 0 9 9 0 0 0 .96 4.97l3 2.33A5.37 5.37 0 0 1 9 3.58Z"/></svg>
              {pending === 'google' ? 'Waiting for Google…' : 'Continue with Google'}</button>
            <button className="portal-guest" disabled={!!pending} onClick={() => void run('guest', guest)}>Continue as guest <Icon name="arrow" size={15}/></button>
          </div>
          {error ? <p className="portal-message" role="alert">{error}</p> :
            auth.availability === 'loading' ? <p className="portal-message" role="status">{note}</p> :
            pending === 'google' ? <p className="portal-message" role="status">Continue in the Google window. Close that window to cancel.</p> : null}
          <p className="portal-local">Your captures stay on this device.</p>
        </section>
      </div>
    </div>
  </dialog>
}
