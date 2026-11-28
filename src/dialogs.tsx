import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Aperture, Icon, type IconName } from './graphics'
import { collectionColors, type Collection } from './model'

export function Dialog({ mode = '', title, onClose, children, initialFocus }: {
  mode?: string; title: string; onClose: () => void; children: ReactNode; initialFocus?: RefObject<HTMLElement | null>
}) {
  const element = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const dialog = element.current
    if (dialog && !dialog.open) dialog.showModal()
    initialFocus?.current?.focus({ preventScroll: true })
    return () => { if (dialog?.open) dialog.close() }
  }, [initialFocus])
  return <dialog ref={element} className={'dialog ' + mode} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-surface">{children}</div>
  </dialog>
}

export function DialogHeader({ icon, title, close, actions }: { icon: IconName; title: string; close: () => void; actions?: ReactNode }) {
  return <div className="dialog-heading"><span className="dialog-emblem"><Icon name={icon} size={19}/></span><h2>{title}</h2>{actions}<button className="icon-button" aria-label="Close" title="Close (Esc)" onClick={close}><Icon name="close"/></button></div>
}

export function CollectionDialog({ existing, collections, onClose, onSave, onDelete }: {
  existing?: Collection; collections: Collection[]; onClose: () => void; onSave: (collection: Collection) => Promise<boolean>; onDelete: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? collectionColors[0])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const title = existing ? 'Edit collection' : 'New collection'
  async function submit(event: FormEvent) {
    event.preventDefault()
    const clean = name.trim()
    if (!clean) { setError('Enter a collection name.'); return }
    if (collections.some(value => value.id !== existing?.id && value.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
      setError('A collection with this name already exists.'); return
    }
    setSaving(true)
    if (!await onSave({ id: existing?.id ?? crypto.randomUUID(), name: clean, color })) setSaving(false)
  }
  return <Dialog mode="small-dialog" title={title} onClose={onClose}>
    <DialogHeader icon="folder" title={title} close={onClose}/>
    <form className="dialog-form" onSubmit={submit}>
      <div className="field"><label htmlFor="collection-name">Name</label><input id="collection-name" autoFocus placeholder="e.g. Weekend ideas" value={name} maxLength={50} onChange={event => { setName(event.target.value); setError('') }}/></div>
      <div className="field"><span>Color</span><div className="swatches" role="group" aria-label="Collection color">{collectionColors.map((value, index) => <button type="button" key={value} aria-label={['Signal orange', 'Olive', 'Brown', 'Slate', 'Rose'][index]} aria-pressed={value === color} onClick={() => setColor(value)} style={{ background: value }}>{value === color && <Icon name="check" size={17}/>}</button>)}</div></div>
      {error && <p className="form-issue" role="alert">{error}</p>}
      <div className="dialog-actions">{existing && <button type="button" className="text-button danger-text push-left" onClick={onDelete}>Delete collection</button>}
        <button type="button" className="button outline" onClick={onClose}>Cancel</button><button className="button accent" type="submit" disabled={saving}>{existing ? 'Save changes' : 'Create collection'}</button></div>
    </form>
  </Dialog>
}

export function ConfirmDialog({ title, message, label, onClose, confirm }: { title: string; message: string; label: string; onClose: () => void; confirm: () => void }) {
  return <Dialog mode="small-dialog" title={title} onClose={onClose}>
    <DialogHeader icon="trash" title={title} close={onClose}/>
    <div className="dialog-form"><p className="confirm-copy">{message}</p>
      <div className="dialog-actions"><button autoFocus className="button outline" onClick={onClose}>Cancel</button><button className="button danger" onClick={confirm}>{label}</button></div>
    </div>
  </Dialog>
}

const tour = [
  { title: 'Keep what catches your eye.', text: 'Paste a note or link, drop a screenshot, or attach a file. Everything goes into one inbox.', icon: 'clipboard' },
  { title: 'Find it when it matters.', text: 'Search the words you remember, filter the inbox by type, or pin something you need close at hand.', icon: 'search' },
  { title: 'Make it yours.', text: 'Give related captures a collection. Your library stays in this browser, with controls for appearance and export.', icon: 'folder' },
] satisfies { title: string; text: string; icon: IconName }[]

export function TourDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const item = tour[step]
  return <Dialog mode="tour-dialog" title="Catch quick tour" onClose={onClose}>
    <div className="tour-art"><Aperture/><button className="icon-button" aria-label="Close tour" onClick={onClose}><Icon name="close"/></button></div>
    <div className="tour-body">
      <div className="tour-step"><Icon name={item.icon} size={18}/><span className="micro">Quick tour · {step + 1} of {tour.length}</span></div>
      <div aria-live="polite"><h2>{item.title}</h2><p>{item.text}</p></div>
      <div className="dialog-actions">
        <button className="button outline push-left" onClick={step ? () => setStep(step - 1) : onClose}>{step ? 'Back' : 'Skip'}</button>
        <button className="button accent" onClick={step < tour.length - 1 ? () => setStep(step + 1) : onDone}>{step < tour.length - 1 ? 'Continue' : 'Get started'}</button>
      </div>
    </div>
  </Dialog>
}
