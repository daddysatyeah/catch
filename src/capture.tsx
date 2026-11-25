import { useRef, useState, type FormEvent } from 'react'
import { Dialog, DialogHeader } from './dialogs'
import { Icon } from './graphics'
import { attachmentsOf, safeUrl, type Attachment, type Clip, type Collection } from './model'
import { maxAttachmentBytes, maxCaptureBytes, maxTextLength } from './content'
import { sensitiveReason } from './sensitive'

export type SaveResult = { saved?: boolean; duplicate?: string; issue?: string }

export function CaptureDialog({ collections, defaultCollection, existing, onClose, onSave }: {
  collections: Collection[]; defaultCollection?: string; existing?: Clip; onClose: () => void; onSave: (clip: Clip, keepDuplicate: boolean) => Promise<SaveResult>
}) {
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
  return <Dialog mode="capture-dialog" title={heading} onClose={onClose}>
    <DialogHeader icon="clipboard" title={heading} close={onClose}/>
    <form onSubmit={submit} className="dialog-form" onDragEnter={event => {
      if (!event.dataTransfer.types.includes('Files')) return
      event.preventDefault(); dragged.current++; setDragging(true)
    }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDragLeave={() => { dragged.current = Math.max(0, dragged.current - 1); if (!dragged.current) setDragging(false) }}
      onDrop={event => { event.preventDefault(); dragged.current = 0; setDragging(false); attach([...event.dataTransfer.files]) }}>
      <div className="field"><label htmlFor="capture-title">Title <small>Optional</small></label><input id="capture-title" value={title} onChange={event => { setTitle(event.target.value); setSensitiveConfirmed(false) }} placeholder="Name this capture" maxLength={160}/></div>
      <div className="field">
        <div className="field-header"><label htmlFor="capture-body">Content</label><button type="button" className="text-button" onClick={paste}><Icon name="clipboard" size={15}/> Paste clipboard</button></div>
        <textarea ref={bodyInput} id="capture-body" autoFocus value={body} onChange={event => changeBody(event.target.value)}
          onPaste={event => {
            setSource('clipboard')
            if (event.clipboardData.files.length) { event.preventDefault(); attach([...event.clipboardData.files]) }
          }}
          placeholder="Paste a link, drop a screenshot, or write a note…" rows={5}/>
      </div>
      <div className={'attach-line' + (dragging ? ' dragging' : '')}>
        <input ref={fileInput} className="visually-hidden" type="file" multiple tabIndex={-1} aria-label="Attachment files" onChange={event => {
          if (event.target.files?.length) attach([...event.target.files])
          event.target.value = ''
        }}/>
        <button type="button" className="attach-button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={18}/> Choose or drop files <small>Up to 25 MB each</small></button>
      </div>
      {!!files.length && <ul className="attachment-list">{files.map(file => <li key={file.id}><Icon name="file" size={17}/><span>{file.name}</span><button type="button" className="icon-button" aria-label={'Remove ' + file.name} onClick={() => { setFiles(old => old.filter(value => value.id !== file.id)); setDuplicate('') }}><Icon name="close" size={17}/></button></li>)}</ul>}
      <div className="edit-grid">
        <div className="field"><label htmlFor="capture-collection">Collection <small>Optional</small></label><div className="select-wrap"><select id="capture-collection" value={collection} onChange={event => setCollection(event.target.value)}><option value="">None</option>{collections.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select><Icon name="down" size={16}/></div></div>
        <div className="field"><label htmlFor="capture-tags">Tags <small>Comma separated</small></label><input id="capture-tags" value={tags} onChange={event => setTags(event.target.value)} maxLength={800} placeholder="e.g. travel, receipts"/></div>
      </div>
      {existing && <div className="field"><label htmlFor="capture-category">Category <small>Optional</small></label><input id="capture-category" value={category} maxLength={60} onChange={event => setCategory(event.target.value)}/></div>}
      {issue && <p className="form-issue" role="alert">{issue}</p>}
      {issue.startsWith('This capture may contain') && <label className="check-label"><input type="checkbox" checked={sensitiveConfirmed} onChange={event => setSensitiveConfirmed(event.target.checked)}/> Store it on purpose</label>}
      {duplicate && <p className="form-issue" role="alert">This matches “{duplicate}” in your library. Cancel to keep the existing copy, or keep both.</p>}
      <div className="dialog-actions"><button className="button outline" type="button" onClick={onClose}>Cancel</button><button className="button accent" type="submit" disabled={saving}><Icon name="check" size={18}/>{saving ? 'Saving…' : duplicate ? 'Keep both' : existing ? 'Save changes' : 'Save capture'}</button></div>
    </form>
  </Dialog>
}
