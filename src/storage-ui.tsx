import { useEffect, useState } from 'react'
import { Icon } from './graphics'
import { formatBytes, originStorage, type captureUsage } from './storage-usage'
import { PageTitle } from './views'

export function StoragePage({ capture, models, onBack, onExport, onImport }: {
  capture: ReturnType<typeof captureUsage>; models: number; onBack: () => void; onExport: () => void; onImport: () => void
}) {
  const [origin, setOrigin] = useState<Awaited<ReturnType<typeof originStorage>>>()
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [refresh, setRefresh] = useState(0)
  const browser = navigator.storage
  useEffect(() => {
    let active = true
    void originStorage(browser).then(value => { if (active) setOrigin(value) })
    return () => { active = false }
  }, [browser, capture, models, refresh])

  async function keep() {
    if (!browser?.persist || requesting) return
    setRequesting(true)
    setMessage('')
    try { setMessage(await browser.persist() ? 'The browser granted persistent storage.' : 'The browser did not grant persistent storage.') }
    catch { setMessage('The browser could not process the request.') }
    finally { setRequesting(false); setRefresh(value => value + 1) }
  }

  const rows = [
    { label: 'Images', bytes: capture.images, color: '#c5543d' },
    { label: 'Files', bytes: capture.files, color: '#566d81' },
    { label: 'Text and links', bytes: capture.text, color: '#779bb5' },
    { label: 'Capture and library metadata', bytes: capture.metadata, color: '#b3bec7' },
  ]
  const originAvailable = origin?.quota !== undefined && origin.usage !== undefined ? Math.max(0, origin.quota - origin.usage) : undefined
  return <>
    <button className="text-button storage-back" onClick={onBack}><Icon name="chevron" size={15}/> Settings</button>
    <PageTitle eyebrow="On this device" title="Storage" description="See what Catch keeps here and what your browser reports."/>
    <div className="storage-page">
      <section className="settings-panel storage-overview" aria-labelledby="capture-bytes">
        <div className="storage-total">
          <h2 id="capture-bytes">Current Catch library</h2><strong>{formatBytes(capture.total)}</strong>
          <p>Estimated size of your captures, attachments, and library metadata. Includes Archive and Trash.</p>
          <div className="storage-bar" aria-hidden="true">{rows.map(row => <i key={row.label} style={{ flex: row.bytes, backgroundColor: row.color }}/>)}</div>
          <dl className="storage-breakdown">{rows.map(row => <div key={row.label}><dt><i style={{ backgroundColor: row.color }}/>{row.label}</dt><dd>{formatBytes(row.bytes)}</dd></div>)}</dl>
        </div>
      </section>
      <section className="settings-panel" aria-labelledby="origin-bytes">
        <h2 id="origin-bytes"><Icon name="grid" size={18}/> Browser origin</h2>
        <div className="storage-origin">
          <dl className="storage-breakdown">
            <div><dt>Origin usage</dt><dd>{formatBytes(origin?.usage)}</dd></div>
            <div><dt>Estimated origin quota</dt><dd>{formatBytes(origin?.quota)}</dd></div>
            <div><dt>Estimated headroom</dt><dd>{formatBytes(originAvailable)}</dd></div>
          </dl>
          <p>This estimate can include other Catch profiles and other sites under this same origin. Disk space, browser policy, and clearing site data affect what stays available.</p>
        </div>
      </section>
      <section className="settings-panel">
        <h2><Icon name="lock" size={18}/> Persistence and recovery</h2>
        <div className="settings-row"><div><strong>Persistent storage</strong><p>{origin?.persistent === true ? 'Granted by this browser.' : origin?.persistent === false ? 'Currently best-effort.' : 'Status unavailable in this browser.'} Clearing site data can still remove it.</p></div>
          {typeof browser?.persist === 'function' && origin?.persistent !== true ? <button className="button outline" onClick={() => void keep()} disabled={requesting}>Request persistence</button> : null}</div>
        {message && <div className="settings-row"><p role="status">{message}</p></div>}
        <div className="settings-row"><div><strong>Installed model files</strong><p>{formatBytes(models)} in complete local model downloads shared by Catch libraries. Runtime caches and database overhead are included only in the browser estimate.</p></div></div>
        <div className="settings-row"><div><strong>Back up this library</strong><p>Export captures and attachments as a local file, or preview a backup merge.</p></div><div className="demo-controls"><button className="button outline" onClick={onExport}>Export</button><button className="button outline" onClick={onImport}>Import</button></div></div>
      </section>
    </div>
  </>
}
