import { useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Dialog, DialogHeader } from './dialogs'
import { Icon, moveReflection } from './graphics'
import { attachmentsOf, safeUrl, type Attachment, type Clip, type Collection, type Kind } from './model'
import { maxAttachmentBytes, maxCaptureBytes, maxTextLength } from './content'
import { sensitiveReason } from './sensitive'

const captureModes: { id: Kind; label: string; prompt: string }[] = [
  { id: 'text', label: 'Text', prompt: 'Write or paste something to keep…' },
  { id: 'link', label: 'Link', prompt: 'Paste a link to keep…' },
  { id: 'image', label: 'Images', prompt: 'Paste or attach images. Add a note if you like…' },
  { id: 'file', label: 'Files', prompt: 'Drop or attach files. Add a note if you like…' },
]

export type SaveResult = { saved?: boolean; duplicate?: string; issue?: string }

export function CaptureDialog({ collections, defaultCollection, existing, onClose, onSave }: {
  collections: Collection[]; defaultCollection?: string; existing?: Clip; onClose: () => void; onSave: (clip: Clip, keepDuplicate: boolean) => Promise<SaveResult>
}) {
  const [mode, setMode] = useState<Kind>(existing?.kind ?? 'text')
  const [showMetadata, setShowMetadata] = useState(false)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [collection, setCollection] = useState(existing?.collection ?? defaultCollection ?? '')
  const [files, setFiles] = useState<Attachment[]>(() => existing ? attachmentsOf(existing) : [])
  const [tags, setTags] = useState(existing?.tags?.join(', ') ?? '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [source, setSource] = useState<Clip['source']>(existing?.source ?? 'manual')
  const [duplicate, setDuplicate] = useState('')
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false)
  const [issue, setIssue] = useState('')
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const bodyInput = useRef<HTMLTextAreaElement>(null)
  const dragged = useRef(0)
  const [newId] = useState(() => crypto.randomUUID())

  function attach(chosen: File[]) {
    if (!chosen.length) return
    if (chosen.some(file => file.size > maxAttachmentBytes) || chosen.length + files.length > 8 ||
        [...chosen, ...files.map(file => file.blob)].reduce((total, file) => total + file.size, 0) > maxCaptureBytes) {
      setIssue('Choose up to eight files, 25 MB each and 60 MB total.')
      return
    }
    setIssue('')
    setDuplicate('')
    setFiles(old => [...old, ...chosen.map(file => ({ id: crypto.randomUUID(), name: file.name, blob: file }))])
  }

  function changeBody(value: string) {
    setBody(value)
    setDuplicate('')
    setSensitiveConfirmed(false)
    setIssue('')
  }

  async function paste() {
    try {
      const windows = window.catchDesktop && await window.catchDesktop.readClipboard()
      if (windows?.kind === 'image') {
        attach([new File([Uint8Array.from(windows.bytes)], 'clipboard.png', { type: 'image/png' })])
        setSource('clipboard')
        return
      }
      const value = window.catchDesktop ? windows?.text ?? '' : await navigator.clipboard.readText()
      if (!value.trim()) { setIssue('There is no clipboard text. Paste an image directly or attach a file.'); return }
      if (value.length > maxTextLength) { setIssue('Attach this text as a file to preserve it in full.'); return }
      changeBody(value)
      setSource('clipboard')
    } catch { setIssue('Paste directly in the field using your usual paste shortcut.') }
    bodyInput.current?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!body.trim() && !files.length && !existing?.artwork) {
      setIssue('Add some content or choose a file.')
      bodyInput.current?.focus()
      return
    }
    const likelySecret = sensitiveReason(title + '\n' + body)
    if (likelySecret && !sensitiveConfirmed) {
      setIssue('This capture may contain a ' + likelySecret + '. Remove it or confirm you intend to store it.')
      return
    }
    setSaving(true)
    const url = safeUrl(body)
    const kind = files.length ? (files.every(value => value.blob.type.startsWith('image/')) ? 'image' : 'file') : existing?.artwork === 'dots' ? 'image' : url ? 'link' : 'text'
    const plain = body.trim().split('\n')[0].trim()
    const label = title.trim() || files[0]?.name || url?.hostname || (plain.length > 68 ? plain.slice(0, 67) + '…' : plain)
    const nextTags = [...new Set(tags.split(',').map(tag => tag.trim().toLowerCase().slice(0, 36)).filter(Boolean))].slice(0, 30)
    const result = await onSave({
      ...existing, id: existing?.id ?? newId, title: label.slice(0, 160) || 'Untitled capture', body, kind, attachments: files,
      collection: collection || undefined, created: existing?.created ?? Date.now(), tags: nextTags, source,
      category: category.trim() || undefined, suggestedTitle: title.trim() ? existing?.suggestedTitle : label.slice(0, 160) || undefined,
      original: existing?.original ?? (existing ? { body: existing.body, title: existing.title, attachments: attachmentsOf(existing) } : undefined),
    }, !!duplicate)
    if (!result.saved) { setSaving(false); setDuplicate(result.duplicate ?? ''); setIssue(result.issue ?? '') }
  }

  const heading = existing ? 'Edit capture' : 'New capture'
  return <Dialog mode="capture-dialog" title={heading} onClose={onClose} initialFocus={bodyInput}>
    <DialogHeader icon="clipboard" title={heading} close={onClose} actions={<button className="icon-button capture-options" type="button"
      aria-label="Capture details" title="Capture details" aria-expanded={showMetadata} aria-controls="capture-metadata"
      onClick={() => setShowMetadata(open => !open)}><Icon name="more" size={18}/></button>}/>
    <form onSubmit={submit} className={'dialog-form' + (dragging ? ' dragging' : '')} onKeyDown={event => {
      if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.nativeEvent.isComposing) return
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }} onDragEnter={event => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault(); dragged.current++; setDragging(true)
    }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDragLeave={() => { dragged.current = Math.max(0, dragged.current - 1); if (!dragged.current) setDragging(false) }}
      onDrop={event => { event.preventDefault(); dragged.current = 0; setDragging(false); attach([...event.dataTransfer.files]) }}>
      <div className="appearance-control glass-segments capture-modes" role="group" aria-label="Capture type" onPointerMove={moveReflection}
        style={{ '--segment-index': captureModes.findIndex(option => option.id === mode) } as CSSProperties}>{captureModes.map(option =>
        <button type="button" key={option.id} aria-pressed={mode === option.id} onClick={() => setMode(option.id)}>{option.label}</button>)}</div>
      <div className="field capture-editor"><label className="visually-hidden" htmlFor="capture-title">Title (optional)</label><input id="capture-title" value={title} onChange={event => { setTitle(event.target.value); setSensitiveConfirmed(false) }} placeholder="Title (optional)" maxLength={160}/></div>
      <div className="field capture-editor">
        <label className="visually-hidden" htmlFor="capture-body">Content</label>
        <textarea ref={bodyInput} id="capture-body" value={body} onChange={event => changeBody(event.target.value)}
          onPaste={event => {
            setSource('clipboard')
            if (event.clipboardData.files.length) { event.preventDefault(); attach([...event.clipboardData.files]) }
          }}
          placeholder={captureModes.find(option => option.id === mode)?.prompt} rows={5}/>
      </div>
      <input ref={fileInput} className="visually-hidden" type="file" multiple tabIndex={-1} aria-label="Attachment files" onChange={event => {
        if (event.target.files?.length) attach([...event.target.files])
        event.target.value = ''
      }}/>
      {!!files.length && <ul className="attachment-list">{files.map(file => <li key={file.id}><Icon name="file" size={17}/><span>{file.name}</span><button type="button" className="icon-button" aria-label={'Remove ' + file.name} onClick={() => { setFiles(old => old.filter(value => value.id !== file.id)); setDuplicate('') }}><Icon name="close" size={17}/></button></li>)}</ul>}
      <div className="capture-metadata" id="capture-metadata" hidden={!showMetadata}>
        <div className="edit-grid">
          <div className="field"><label htmlFor="capture-collection">Collection <small>Optional</small></label><div className="select-wrap"><select id="capture-collection" value={collection} onChange={event => setCollection(event.target.value)}><option value="">None</option>{collections.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select><Icon name="down" size={16}/></div></div>
          <div className="field"><label htmlFor="capture-tags">Tags <small>Comma separated</small></label><input id="capture-tags" value={tags} onChange={event => setTags(event.target.value)} maxLength={800} placeholder="e.g. travel, receipts"/></div>
        </div>
        {existing && <div className="field"><label htmlFor="capture-category">Category <small>Optional</small></label><input id="capture-category" value={category} maxLength={60} onChange={event => setCategory(event.target.value)}/></div>}
      </div>
      {issue && <p className="form-issue" role="alert">{issue}</p>}
      {issue.startsWith('This capture may contain') && <label className="check-label"><input type="checkbox" checked={sensitiveConfirmed} onChange={event => setSensitiveConfirmed(event.target.checked)}/> Store it on purpose</label>}
      {duplicate && <p className="form-issue" role="alert">This matches “{duplicate}” in your library. Cancel to keep the existing copy, or keep both.</p>}
      <div className="dialog-actions capture-actions">
        <button type="button" className="icon-button attach-files" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files"><Icon name="paperclip" size={19}/></button>
        <button type="button" className="button paste-button" onClick={paste}><Icon name="clipboard" size={16}/> Paste</button>
        <button className="button primary" type="submit" disabled={saving} aria-keyshortcuts="Control+Enter Meta+Enter">{saving ? 'Saving…' : duplicate ? 'Keep both' : existing ? 'Save changes' : 'Save capture'}</button>
      </div>
    </form>
  </Dialog>
}
