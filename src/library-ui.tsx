import { useMemo, useRef, useState, type ReactNode } from 'react'
import { parseBackup } from './backup'
import { localUsage } from './content'
import { Dialog, DialogHeader } from './dialogs'
import { Icon } from './graphics'
import { visibleClips, type Library, type ReviewState } from './model'
import { suggestionsFor, type Suggestion } from './review'
import type { DesktopStatus } from './platform'
import type { Models, ModelName } from './use-models'
import { Empty, PageTitle } from './views'

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (library: Library, preferences: boolean) => Promise<boolean> }) {
  const [imported, setImported] = useState<Library>()
  const [fileName, setFileName] = useState('')
  const [issue, setIssue] = useState('')
  const [busy, setBusy] = useState(false)
  const [preferences, setPreferences] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return <Dialog mode="small-dialog" title="Restore from backup" onClose={onClose}>
    <DialogHeader icon="upload" title="Restore from backup" close={onClose}/>
    <div className="dialog-form">
      <p className="confirm-copy">Preview a Catch JSON backup and merge it into this library. Existing captures stay in place.</p>
      <input type="file" accept=".json,application/json" className="visually-hidden" tabIndex={-1} aria-label="Catch backup file" ref={input} onChange={async event => {
        const file = event.target.files?.[0]
        if (!file) return
        event.currentTarget.value = ''
        setImported(undefined); setIssue(''); setBusy(true); setFileName(file.name)
        try { setImported(await parseBackup(file)) }
        catch (error) { setIssue(error instanceof Error ? error.message : 'Could not read the selected backup.') }
        finally { setBusy(false) }
      }}/>
      <button className="button outline" onClick={() => input.current?.click()} disabled={busy}><Icon name="file" size={17}/> Choose backup</button>
      {fileName && <p className="backup-name">{fileName}</p>}
      {busy && <p role="status">Checking the backup…</p>}
      {issue && <p className="form-issue" role="alert">{issue}</p>}
      {imported && <><p role="status">{imported.clips.length} {imported.clips.length === 1 ? 'capture' : 'captures'} · {imported.collections.length} {imported.collections.length === 1 ? 'collection' : 'collections'}</p><label className="check-label"><input type="checkbox" checked={preferences} onChange={event => setPreferences(event.target.checked)}/> Restore appearance and optional processing preferences</label></>}
      <div className="dialog-actions"><button className="button outline" onClick={onClose}>Cancel</button><button className="button accent" disabled={!imported || busy} onClick={async () => {
        if (!imported) return
        setBusy(true)
        if (!await onImport(imported, preferences)) { setBusy(false); setIssue('Could not write the backup. Your existing library was kept.') }
      }}>Merge backup</button></div>
    </div>
  </Dialog>
}

const types: Record<Suggestion['type'], string> = {
  category: 'Category', tag: 'Tag', duplicate: 'Possible duplicate', date: 'Date', time: 'Time', deadline: 'Potential deadline',
  amount: 'Amount', url: 'Link', email: 'Email address', reference: 'Reference', action: 'Potential task',
}

function ReviewCard({ item, open, resolve, combine, discard }: { item: Suggestion; open: (id: string) => void; resolve: (state?: ReviewState, edit?: string) => void; combine: () => void; discard: () => void }) {
  const [edit, setEdit] = useState<string>()
  return <article className="review-card">
    <div className="review-meta micro"><span>{types[item.type]}</span><span>{item.method}{item.entity?.page ? ' · Page ' + item.entity.page : ''}</span></div>
    <h3>{item.value}</h3>
    <button className="text-button review-source" onClick={() => open(item.clip.id)}><Icon name="link" size={15}/>{item.clip.title}</button>
    {item.evidence && <blockquote>{item.evidence}</blockquote>}
    {item.entity?.ambiguous && <p className="panel-note">Check the original before using this value{item.type === 'deadline' ? '. Enter a full date to create a task.' : '.'}</p>}
    {item.related && <button className="text-button" onClick={() => open(item.related!.id)}>Open comparison · {item.related.title}</button>}
    {item.state ? <div className="review-actions"><span className="micro">{item.state}</span><button className="button outline" onClick={() => resolve()}>Reopen</button></div>
      : edit !== undefined ? <div className="review-actions"><input aria-label="Edit suggestion" maxLength={280} value={edit} onChange={event => setEdit(event.target.value)}/><button className="button outline" onClick={() => setEdit(undefined)}>Cancel</button><button className="button primary" disabled={!edit.trim()} onClick={() => { resolve('accepted', edit); setEdit(undefined) }}>Confirm value</button></div>
      : <div className="review-actions">{item.related ? <>
        <button className="button primary" onClick={() => resolve('accepted')}>Keep both</button>
        <button className="button outline" onClick={combine}>Copy tags to original</button><button className="button outline" onClick={discard}>Trash comparison</button>
      </> : <><button className="button primary" onClick={() => resolve('accepted')}>Accept</button><button className="button outline" onClick={() => setEdit(item.value)}>Edit</button></>}
        <button className="text-button" onClick={() => resolve('rejected')}>Reject</button><button className="text-button" onClick={() => resolve('dismissed')}>Dismiss</button></div>}
  </article>
}

export function ReviewPage({ library, onOpen, onResolve, onCombine, onDiscard, onComplete }: {
  library: Library; onOpen: (id: string) => void; onResolve: (item: Suggestion, state?: ReviewState, edit?: string) => void
  onCombine: (item: Suggestion) => void; onDiscard: (item: Suggestion) => void; onComplete: (clipId: string, taskId: string, checked: boolean) => void
}) {
  const [tab, setTab] = useState<'pending' | 'decisions' | 'tasks'>('pending')
  const [limit, setLimit] = useState(30)
  const suggestions = useMemo(() => {
    const clips = visibleClips(library.clips)
    return [...clips].sort((a, b) => b.created - a.created).flatMap(clip => suggestionsFor(clip, clips))
  }, [library.clips])
  const results = suggestions.filter(item => tab === 'pending' ? !item.state : !!item.state)
  const tasks = library.clips.filter(clip => !clip.trashed).flatMap(clip => (clip.tasks ?? []).map(task => ({ clip, task })))
  return <>
    <PageTitle eyebrow="Local intelligence" title="Review" description="Check the source and decide what to keep, correct, or turn into a task."/>
    <div className="filter-bar review-tabs" role="group" aria-label="Review view">{(['pending', 'decisions', 'tasks'] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setLimit(30) }}>{{ pending: 'Needs review', decisions: 'Decisions', tasks: 'Confirmed tasks' }[value]}</button>)}</div>
    {tab === 'tasks' ? tasks.length ? <ul className="task-list">{tasks.map(({ clip, task }) => <li key={clip.id + ':' + task.id}><label className="check-label"><input type="checkbox" checked={task.complete} onChange={event => onComplete(clip.id, task.id, event.target.checked)}/><span>{task.label}</span></label><button className="text-button" onClick={() => onOpen(clip.id)}>{clip.title}</button></li>)}</ul> :
      <Empty icon="check" title="No confirmed tasks" text="Accept a suggested action or a specific deadline to add a task here."/> :
      results.length ? <div className="review-list">{results.slice(0, limit).map(item => <ReviewCard key={item.clip.id + ':' + item.id} item={item} open={onOpen} resolve={(state, edit) => onResolve(item, state, edit)} combine={() => onCombine(item)} discard={() => onDiscard(item)}/>)}{results.length > limit && <button className="button outline" onClick={() => setLimit(limit + 30)}>Show more suggestions</button>}</div> :
        <Empty icon="review" title={tab === 'pending' ? 'You’re caught up' : 'No decisions yet'} text={tab === 'pending' ? 'Dates, amounts, actions, and local model suggestions will appear here when detected.' : 'Reviewed suggestions and their evidence are recorded here.'}/>}
  </>
}

function SettingsRow({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="settings-row"><div><strong>{title}</strong><p>{text}</p></div>{children}</div>
}

export function ModelSettings({ models, enabled, setOcr, semantic, setSemantic, auto, setAuto }: {
  models: Models; enabled: boolean; setOcr: (enabled: boolean) => void; semantic: boolean; setSemantic: (enabled: boolean) => void
  auto: boolean; setAuto: (enabled: boolean) => void
}) {
  function row(key: ModelName, title: string, text: string) {
    const status = models.status[key]
    return <SettingsRow title={title} text={text + (status.message ? ' ' + status.message : '')}>
      <div className="model-controls">
        {status.phase === 'checking' && <span role="status">Checking…</span>}
        {(status.phase === 'downloading' || status.phase === 'loading') && <><span role="status">{status.phase === 'loading' ? 'Starting model…' : 'Downloading ' + (status.percent ?? 0) + '%'}</span><button className="button outline" onClick={() => models.cancel(key)}>Cancel</button></>}
        {(status.phase === 'missing' || status.phase === 'error') && <button className="button outline" onClick={() => void models.install(key)}>{status.phase === 'error' ? 'Retry download' : 'Download'}</button>}
        {status.phase === 'ready' && <><span className="model-ready"><span className="signal"/> Installed</span><button className="button outline" onClick={() => { if (key === 'ocr') setOcr(false); void models.remove(key) }}>Remove model</button></>}
      </div>
    </SettingsRow>
  }
  return <section className="settings-panel"><h2><Icon name="review" size={19}/> Local models</h2>
    {row('semantic', 'Semantic search and categories', 'MiniLM, 23.7 MB model files. Runs on this device after download.')}
    <SettingsRow title="Use semantic processing" text="Enable semantic and hybrid search, related captures, and category suggestions without removing the model.">
      <button className="switch" role="switch" aria-label="Use semantic processing" aria-checked={semantic} disabled={models.status.semantic.phase !== 'ready'} onClick={() => setSemantic(!semantic)}><span/></button>
    </SettingsRow>
    <SettingsRow title="Suggest categories automatically" text="Off by default. Suggestions can be uncertain or wrong and wait for a decision in Review.">
      <button className="switch" role="switch" aria-label="Suggest categories automatically" aria-checked={auto} disabled={!semantic} onClick={() => setAuto(!auto)}><span/></button>
    </SettingsRow>
    {row('ocr', 'English OCR', 'Tesseract fast English, 4.1 MB model file plus about 4 MB of local runtime assets. Reads supported images and up to three scanned pages per PDF.')}
    <SettingsRow title="Read image attachments" text="Use the installed English model when reading files.">
      <button className="switch" role="switch" aria-label="Read image attachments" aria-checked={enabled} disabled={models.status.ocr.phase !== 'ready'} onClick={() => setOcr(!enabled)}><span/></button>
    </SettingsRow>
    <SettingsRow title="Model network access" text="A download contacts the listed public model hosts. Captures, images, and queries stay on your device."/>
  </section>
}

export function DataSettings({ library, setPreferences, onImport, onClear, desktop }: { library: Library; setPreferences: (preferences: Partial<NonNullable<Library['preferences']>>) => void; onImport: () => void; onClear: () => void; desktop: boolean }) {
  const usage = useMemo(() => localUsage(library), [library])
  return <section className="settings-panel"><h2><Icon name="archive" size={19}/> Library controls</h2>
    <SettingsRow title="Stored content" text={(usage / 1024 ** 2).toFixed(2) + ' MB estimated for text and attachments. ' + (desktop ? 'The Windows library is separate from other browser profiles.' : 'This is separate from the browser’s overall storage quota.')}/>
    <SettingsRow title="Restore a backup" text="Validate a Catch JSON file and preview a merge."><button className="button outline" onClick={onImport}><Icon name="upload" size={16}/> Import</button></SettingsRow>
    <SettingsRow title="Retention" text="Move older, unpinned inbox captures to Trash on startup. Archived captures stay in Archive.">
      <select aria-label="Retention" value={library.preferences?.retentionDays ?? 0} onChange={event => setPreferences({ retentionDays: Number(event.target.value) || undefined })}><option value={0}>Keep until I delete</option><option value={30}>30 days</option><option value={90}>90 days</option></select>
    </SettingsRow>
    <SettingsRow title="Remember searches" text="Keep queries you open on this device. Likely credentials are skipped.">
      <button className="switch" role="switch" aria-label="Remember searches" aria-checked={!!library.preferences?.rememberSearches} onClick={() => setPreferences({ rememberSearches: !library.preferences?.rememberSearches })}><span/></button>
      {!!library.preferences?.recentSearches?.length && <button className="button outline" onClick={() => setPreferences({ recentSearches: [] })}>Clear history</button>}
    </SettingsRow>
    <SettingsRow title="Reduce transparency" text="Use a solid toolbar when scrolling."><button className="switch" role="switch" aria-label="Reduce transparency" aria-checked={!!library.preferences?.reduceTransparency} onClick={() => setPreferences({ reduceTransparency: !library.preferences?.reduceTransparency })}><span/></button></SettingsRow>
    <SettingsRow title="Clear library" text="Move all captures, including archived ones, to Trash."><button className="button outline" onClick={onClear}>Move all to Trash</button></SettingsRow>
  </section>
}

export function DesktopSettings({ status, change, images, shortcut }: { status: DesktopStatus; change: (enable: boolean) => void; images: (enable: boolean) => void; shortcut: (value: string) => void }) {
  return <section className="settings-panel"><h2><Icon name="monitor" size={19}/> Windows clipboard</h2>
    <SettingsRow title="Clipboard monitoring" text={'Capture newly copied text while Catch is running, including when it is in the tray. Likely secrets are skipped. ' + (status.lastSkipped ? 'Last skipped: ' + status.lastSkipped + '.' : '')}>
      <button className="button outline" onClick={() => change(!status.monitoring)}>{status.monitoring ? 'Pause monitoring' : 'Enable monitoring'}</button>
    </SettingsRow>
    <SettingsRow title="Capture clipboard images" text="Images may show sensitive information. The background text filter cannot inspect them.">
      <button className="switch" role="switch" aria-label="Capture clipboard images" aria-checked={status.images} onClick={() => images(!status.images)}><span/></button>
    </SettingsRow>
    <SettingsRow title="Global quick capture" text={status.shortcutError || 'Opens the capture dialog from another app. If a shortcut is in use, Catch keeps the previous one.'}>
      <select aria-label="Global quick capture" value={status.shortcut} onChange={event => shortcut(event.target.value)}><option value="CommandOrControl+Alt+Shift+C">Ctrl Alt Shift C</option><option value="CommandOrControl+Alt+Shift+V">Ctrl Alt Shift V</option><option value="">Off</option></select>
    </SettingsRow>
  </section>
}
