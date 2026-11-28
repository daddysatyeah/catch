import { useEffect, useState } from 'react'
import { Dialog, DialogHeader } from './dialogs'
import { assetUrl, Icon, MatrixArt } from './graphics'
import { attachmentsOf, kinds, longDate, safeUrl, type Clip, type Collection, type Passage } from './model'
import { AttachmentPreview, canPreview, isPdf } from './attachment-preview'
import { relatedMemories } from './inference'
import type { Hit } from './retrieval'
import { download } from './store'
import { TypeMark } from './views'
import { showcasePreview } from './showcase'

type Props = {
  clip: Clip; collections: Collection[]; siblings: Clip[]; busy?: string; canClassify: boolean
  onClose: () => void; onPin: () => void; onEdit: () => void; onMove: (collection?: string) => void; onDelete: () => void
  onArchive: () => void; onRestore: () => void; onRead: () => void; onCancel: () => void; onClassify: () => void
  onCorrection: (passage: Passage, text: string) => void; notify: (message: string) => void; onOpen: (id: string) => void
}

function Snippet({ text }: { text: string }) {
  return <pre className="document-text">{text}</pre>
}

export function InspectDialog(props: Props) {
  const { clip, collections, busy, canClassify, onClose, onPin, onEdit, onMove, onDelete, onArchive, onRestore, onRead, onCancel, onClassify, onCorrection, notify, onOpen } = props
  const [correction, setCorrection] = useState<{ passage: Passage; text: string }>()
  const [showRelated, setShowRelated] = useState(false)
  const [related, setRelated] = useState<Hit[]>()
  const [relatedError, setRelatedError] = useState(false)
  const files = attachmentsOf(clip)
  const preview = showcasePreview(clip)
  const url = clip.kind === 'link' ? safeUrl(clip.body) : undefined

  useEffect(() => {
    if (!showRelated) return
    const controller = new AbortController()
    relatedMemories(clip, props.siblings.filter(value => value.id !== clip.id && !value.trashed), controller.signal)
      .then(results => { if (!controller.signal.aborted) setRelated(results) })
      .catch(() => { if (!controller.signal.aborted) setRelatedError(true) })
    return () => controller.abort()
  }, [clip, props.siblings, showRelated])

  async function copy() {
    try {
      if (window.catchDesktop) {
        if (!await window.catchDesktop.writeText(clip.body)) throw new Error()
      } else await navigator.clipboard.writeText(clip.body)
      notify('Copied to clipboard')
    }
    catch { notify('Clipboard unavailable. Select the content to copy it.') }
  }

  return <Dialog mode="inspect-dialog" title="Inspect capture" onClose={onClose}>
    <DialogHeader icon={clip.kind} title="Capture details" close={onClose}/>
    <div className="inspection">
      <div className="inspect-type"><TypeMark clip={clip}/><span className="micro">{kinds[clip.kind]}{clip.demo && ' / Demo capture'}{clip.trashed ? ' / Trash' : clip.archived ? ' / Archive' : ''}</span></div>
      <h2>{clip.title}</h2>
      <div className="inspect-actions">
        {clip.trashed ? <button className="button outline" onClick={onRestore}><Icon name="check" size={16}/> Restore</button> : <>
          <button className="button outline" onClick={onPin} aria-pressed={!!clip.pinned}><Icon name="pin" size={16}/>{clip.pinned ? 'Unpin' : 'Pin'}</button>
          {clip.body && <button className="button outline" onClick={copy}><Icon name="copy" size={16}/> Copy</button>}
          <button className="button outline" onClick={onEdit}><Icon name="edit" size={16}/> Edit</button>
          <button className="button outline" onClick={onArchive}><Icon name="inbox" size={16}/>{clip.archived ? 'Unarchive' : 'Archive'}</button>
        </>}
      </div>
      {clip.artwork === 'dots' && <div className="inspection-art"><MatrixArt/></div>}
      {url ? <a className="inspect-link" href={url.href} target="_blank" rel="noopener noreferrer"><Icon name="link" size={18}/><span>{url.href}</span><Icon name="external" size={16}/></a> : clip.body && <p className="inspect-body">{clip.body}</p>}
      {!!files.length && <div className="inspector-files">{files.map(file => <div key={file.id}>
        {isPdf(file) && preview ? <img className="inspection-image pdf-preview" src={assetUrl(preview)} loading="lazy" decoding="async" alt={'Page 1 preview of ' + clip.title}/> :
          canPreview(file) && <AttachmentPreview file={file} className="inspection-image" width={900} alt={isPdf(file) ? 'Page 1 preview of ' + file.name : file.name}/>}
        <button className="button outline download-button" onClick={() => download(file.blob, file.name)}><Icon name="download" size={17}/><span>{file.name}</span></button>
      </div>)}</div>}
      <dl className="inspection-meta">
        <div><dt>Captured</dt><dd>{longDate(clip.created)}</dd></div>
        {clip.source && <div><dt>Source</dt><dd>{{ desktop: 'Windows clipboard', clipboard: 'Clipboard paste', manual: 'Manual capture' }[clip.source]}</dd></div>}
        {clip.category && <div><dt>Category</dt><dd>{clip.category}</dd></div>}
        {!!clip.tags?.length && <div><dt>Tags</dt><dd>{clip.tags.join(', ')}</dd></div>}
        <div><dt><label htmlFor="inspect-collection">Collection</label></dt><dd><div className="select-wrap"><select id="inspect-collection" disabled={!!clip.trashed} value={clip.collection ?? ''} onChange={event => onMove(event.target.value || undefined)}><option value="">None</option>{collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select><Icon name="down" size={16}/></div></dd></div>
      </dl>
      {clip.original && <details className="inspect-section"><summary>Original capture</summary><Snippet text={clip.original.body || clip.original.title}/>{clip.original.attachments.map(file => <button key={file.id} className="button outline download-button" onClick={() => download(file.blob, file.name)}><Icon name="download" size={17}/><span>{file.name}</span></button>)}</details>}
      {!!files.length && <section className="inspect-section extracted"><div className="section-heading"><h3>Extracted text</h3>
        {!clip.trashed && (busy ? <button className="button outline" onClick={onCancel}>Cancel</button> : <button className="button outline" onClick={onRead}>{clip.processing ? 'Read again' : 'Read files'}</button>)}</div>
        {busy && <p role="status">{busy}</p>}
        {clip.processing?.note && <p className="panel-note">{clip.processing.note}</p>}
        {!busy && !clip.processing && <p className="panel-note">Read supported files to make their text searchable.</p>}
        {clip.processing?.passages.map((passage, index) => <details key={index} className="passage" open={index === 0 || undefined}>
          <summary>{passage.page ? 'Page ' + passage.page + ' · ' : ''}{passage.method.toUpperCase()}{passage.confidence !== undefined ? ' · ' + Math.round(passage.confidence) + '% OCR confidence' : ''}</summary>
          <Snippet text={passage.text}/>
          {passage.method === 'ocr' && !clip.trashed && <button className="text-button" onClick={() => setCorrection({ passage, text: clip.processing?.passages.find(value => value.method === 'correction' && value.attachment === passage.attachment && value.page === passage.page)?.text ?? passage.text })}>Correct text</button>}
        </details>)}
        {correction && <div className="field correction"><label htmlFor="correction">Corrected text</label><textarea id="correction" value={correction.text} rows={5} maxLength={60_000} onChange={event => setCorrection({ ...correction, text: event.target.value })}/><div className="dialog-actions"><button className="button outline" onClick={() => setCorrection(undefined)}>Cancel</button><button className="button primary" disabled={!correction.text.trim()} onClick={() => { onCorrection(correction.passage, correction.text); setCorrection(undefined) }}>Save correction</button></div></div>}
      </section>}
      {canClassify && !clip.trashed && <section className="inspect-section"><div className="section-heading"><h3>Local intelligence</h3><button className="button outline" disabled={!!busy} onClick={onClassify}>Suggest category</button></div>
        {clip.prediction && <p className="panel-note">{clip.prediction.category ? 'Suggested category: ' + clip.prediction.category + '. Review it in Review.' : 'The model abstained on this capture.'}</p>}
        {!files.length && busy && <p role="status">{busy}</p>}
        {!showRelated ? <button className="text-button" onClick={() => setShowRelated(true)}>Find related captures</button> : related ?
          related.length ? <ul className="related-list">{related.map(hit => <li key={hit.clip.id}><button className="text-button" onClick={() => onOpen(hit.clip.id)}>{hit.clip.title}</button><p>{hit.snippet}</p></li>)}</ul> : <p className="panel-note">No strong matches in this library.</p>
          : <p role="status">{relatedError ? 'Could not search the local model.' : 'Comparing captures locally…'}</p>}
      </section>}
      <button className="text-button danger-text" onClick={onDelete}><Icon name="trash" size={17}/> {clip.trashed ? 'Delete permanently' : 'Move to Trash'}</button>
    </div>
  </Dialog>
}
