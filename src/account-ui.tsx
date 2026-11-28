import { useRef, useState } from 'react'
import { initialLetters, type Account } from './account'
import { Icon, moveReflection } from './graphics'

export type AccountActions = {
  account: Account | null
  loading: boolean
  issue: string
  signIn: () => void
  manage: () => void
  signOut: () => void
}

export function AccountPhoto({ account }: { account: Account }) {
  const [failed, setFailed] = useState('')
  return <span className="account-photo" aria-hidden="true">{account.photo && failed !== account.photo ?
    <img src={account.photo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(account.photo ?? '')}/> :
    initialLetters(account.name.includes('@') ? account.name.split('@')[0] : account.name)}</span>
}

export function AccountCapsule({ controls }: { controls: AccountActions }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const { account, loading, issue, signIn, manage, signOut } = controls
  if (!account) return <button className="device account-capsule" disabled={loading} onClick={signIn} onPointerMove={moveReflection}>
    <span className="device-icon"><Icon name="person" size={17}/></span>
    <span className="account-copy"><strong>{loading ? 'Restoring session…' : 'Sign in'}</strong><small>Your personal space</small></span>
    <Icon name="chevron" size={14}/>
  </button>
  const hide = () => { if (menu.current) menu.current.open = false }
  return <details className="account-menu" ref={menu} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) hide()
  }} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current?.open) { event.stopPropagation(); hide(); trigger.current?.focus() }
  }}>
    <summary className="device account-capsule" ref={trigger} onPointerMove={moveReflection}>
      <AccountPhoto account={account}/><span className="account-copy"><strong>{account.name}</strong><small>{account.name === account.email ? 'Signed in' : account.email}</small></span>
      <Icon name="down" size={14}/>
    </summary>
    <div className="account-popup">
      <button className="nav-item" onClick={() => { hide(); manage() }}><Icon name="person" size={16}/> Manage account</button>
      <button className="nav-item" onClick={() => { hide(); signOut() }}><Icon name="logout" size={16}/> Sign out</button>
    </div>
    {issue && <p role="alert" className="account-issue">{issue}</p>}
  </details>
}

export function AccountSettings({ controls }: { controls: AccountActions }) {
  const { account, issue, signIn, signOut } = controls
  return <section className="settings-panel" id="account-settings" aria-labelledby="account-settings-title">
    <h2 id="account-settings-title"><Icon name="person" size={19}/> Account</h2>
    <div className="settings-row">
      <div className="account-settings-status">{account && <AccountPhoto account={account}/>}<div>
        <strong>{account?.name ?? 'Guest library'}</strong>
        <p>{account ? account.email : 'Your existing captures stay in the guest library.'}</p>
      </div></div>
      <div className="demo-controls">{account ? <>
        <button className="button outline" onClick={signIn}>Switch account</button>
        <button className="button outline" onClick={signOut}>Sign out</button>
      </> : <button className="button outline" onClick={signIn} disabled={controls.loading}>Sign in</button>}</div>
    </div>
    <div className="settings-row"><p>Each account has a separate local library in this browser profile. Signing in does not encrypt or sync captures. Anyone with access to this browser profile or its developer tools may be able to read local data.</p></div>
    {issue && <div className="settings-row"><p role="alert">{issue}</p></div>}
  </section>
}
