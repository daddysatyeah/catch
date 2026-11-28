import { Fragment, useEffect, useRef, useState } from 'react'
import { mergeLibrary } from './backup'
import { CaptureDialog, type SaveResult } from './capture'
import { exactDuplicates, maxAttachmentBytes, maxTextLength, prepareClip, rasterType } from './content'
import { CollectionDialog, ConfirmDialog, TourDialog } from './dialogs'
import { assetUrl, Icon } from './graphics'
import { classifyClip } from './inference'
import { InspectDialog } from './inspector'
import { DataSettings, DesktopSettings, ImportDialog, ModelSettings, ReviewPage } from './library-ui'
import { attachmentsOf, safeUrl, starterLibrary, visibleClips, type Clip, type Collection, type Library, type Passage } from './model'
import type { ClipboardValue, DesktopStatus } from './platform'
import { applyCaptureState, recordSearch } from './privacy'
import { decide } from './review'
import { SearchResults } from './search'
import { sensitiveReason } from './sensitive'
import { isShowcase, mergeShowcase, missingShowcase } from './showcase'
import { exportLibrary, useLibrary } from './store'
import { useModels } from './use-models'
import { Collections, Empty, Header, InboxEmpty, PageTitle, PinnedCards, Settings, Sidebar, Timeline, type BulkAction, type Page } from './views'

type Overlay =
  | { type: 'tour' | 'remove-demo' | 'import' | 'clear' | 'enable-monitoring' }
  | { type: 'capture' | 'collection'; id?: string }
  | { type: 'inspect' | 'purge' | 'delete-collection'; id: string }

const pages: Record<string, string> = {
  inbox: 'Inbox', pinned: 'Pinned', collections: 'Collections', settings: 'Settings', review: 'Review',
  search: 'Search', archive: 'Archive', trash: 'Trash', viewed: 'Recently viewed',
}
const readPage = () => window.location.hash.slice(1) || 'inbox'
const desktop = window.catchDesktop
const emptyLibrary = starterLibrary()

export function App() {
  const { library: loadedLibrary, update, error, load } = useLibrary()
  const library = loadedLibrary ?? emptyLibrary
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const searchOrigin = useRef<Page>('inbox')
  const models = useModels()
  const [requestedPage, setRequestedPage] = useState<Page>(readPage)
  const [overlay, setOverlay] = useState<Overlay>()
  const [mobile, setMobile] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState<{ id: string; label: string }>()
  const [demoLoading, setDemoLoading] = useState(false)
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus>()
  const toastTimer = useRef<number>(0)
  const closeTimer = useRef<number>(0)
  const dialogEpoch = useRef(0)
  const toastRegion = useRef<HTMLDivElement>(null)
  const main = useRef<HTMLElement>(null)
  const mobileTrigger = useRef<HTMLElement | null>(null)
  const overlayReturn = useRef<HTMLElement | null>(null)
  const job = useRef<AbortController | undefined>(undefined)
  const attempted = useRef(new Set<string>())
  const importingDemo = useRef(false)
  const activeCollection = library?.collections.find(value => value.id === requestedPage)
  const page = Object.hasOwn(pages, requestedPage) || activeCollection ? requestedPage : 'inbox'
  const title = activeCollection?.name ?? pages[page] ?? 'Inbox'
  const selectedClip = overlay && 'id' in overlay ? library?.clips.find(clip => clip.id === overlay.id) : undefined
  const selectedCollection = overlay && 'id' in overlay ? library?.collections.find(collection => collection.id === overlay.id) : undefined
  const canClassify = models.status.semantic.phase === 'ready' && !library?.preferences?.semanticDisabled
  const ocrEnabled = !!library?.preferences?.ocr && models.status.ocr.phase === 'ready'

  function closeMenu() {
    if (mobile) requestAnimationFrame(() => { if (!document.querySelector('dialog[open]')) mobileTrigger.current?.focus() })
    setMobile(false)
  }
  function show(next: Overlay, target?: HTMLElement | null) {
    window.clearTimeout(closeTimer.current)
    const closing = document.querySelector('dialog[data-closing]')
    if (closing) dialogEpoch.current++
    if (!overlay || closing) {
      const current = document.activeElement
      overlayReturn.current = target ?? (mobile ? mobileTrigger.current : current instanceof HTMLElement && current !== document.body ? current : main.current)
    }
    setOverlay(next)
  }
  function close() {
    const target = overlayReturn.current
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]')
    if (!dialog && document.querySelector('dialog[data-closing]')) return
    overlayReturn.current = null
    if (dialog) {
      dialog.dataset.closing = ''
      dialog.close()
    }
    if (!document.querySelector('dialog[open]')) (target?.isConnected ? target : main.current)?.focus({ preventScroll: true })
    if (!dialog || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduce === 'true') {
      setOverlay(undefined)
      return
    }
    closeTimer.current = window.setTimeout(() => setOverlay(undefined), 160)
  }
  function openSearch() {
    navigate('search')
    if (mobile) requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }))
    else searchInput.current?.focus({ preventScroll: true })
  }
  function changeQuery(value: string) {
    setQuery(value)
    if (value) navigate('search')
    else if (page === 'search') exitSearch()
  }
  function exitSearch() {
    setQuery('')
    navigate(searchOrigin.current)
    searchInput.current?.focus({ preventScroll: true })
  }
  const openCapture = () => { if (loadedLibrary) show({ type: 'capture' }) }
  const openTour = () => show({ type: 'tour' })
  const addCollection = () => { show({ type: 'collection' }); closeMenu() }

  function navigate(target: Page) {
    if (target === 'search' && page !== 'search') searchOrigin.current = page
    const hash = target === 'inbox' ? '' : target
    if (window.location.hash.slice(1) !== hash) window.location.hash = hash
    setRequestedPage(target)
    if (target !== 'search') setQuery('')
    closeMenu()
  }
  function notify(message: string) {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 3300)
  }
  async function commit(change: (value: Library) => Library, message?: string) {
    try {
      await update(change)
      if (message) notify(message)
      return true
    } catch (error) {
      notify(error instanceof DOMException && error.name === 'QuotaExceededError' ?
        'Local storage is full. Export a backup before freeing space.' : 'Couldn’t update the local library. Try again.')
      return false
    }
  }
  function openClip(id: string, query = '', target?: HTMLElement | null) {
    show({ type: 'inspect', id }, target)
    void commit(state => {
      const value = recordSearch(state, query)
      return { ...value, clips: value.clips.map(clip => clip.id === id && !clip.trashed ? { ...clip, viewed: Date.now() } : clip) }
    })
  }
  function changeClip(id: string, change: (clip: Clip, state: Library) => Clip, message?: string) {
    return commit(state => ({ ...state, clips: state.clips.map(clip => clip.id === id ? change(clip, state) : clip) }), message)
  }
  function setPreferences(preferences: Partial<NonNullable<Library['preferences']>>) {
    return commit(state => ({ ...state, preferences: { ...state.preferences, ...preferences } }))
  }

  useEffect(() => {
    const onHash = () => {
      const target = readPage()
      setRequestedPage(target)
      if (target !== 'search') setQuery('')
    }
    const onScroll = () => setScrolled(window.scrollY > 9)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('scroll', onScroll); window.clearTimeout(toastTimer.current); window.clearTimeout(closeTimer.current); job.current?.abort() }
  }, [])
  useEffect(() => {
    const appearance = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = library?.theme === 'system' ? (appearance.matches ? 'dark' : 'light') : library?.theme ?? 'light'
      document.documentElement.dataset.reduce = String(!!library?.reduced)
      document.documentElement.dataset.solid = String(!!library?.preferences?.reduceTransparency)
    }
    apply()
    appearance.addEventListener('change', apply)
    return () => appearance.removeEventListener('change', apply)
  }, [library?.theme, library?.reduced, library?.preferences?.reduceTransparency])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.title = title + ' — Catch'
  }, [page, title])
  useEffect(() => {
    const region = toastRegion.current
    if (!region?.showPopover) return
    if (toast && !region.matches(':popover-open')) region.showPopover()
    if (!toast && region.matches(':popover-open')) region.hidePopover()
  }, [toast])
  useEffect(() => {
    if (!mobile) return
    const wide = matchMedia('(min-width: 781px)')
    const onWide = () => { if (wide.matches) setMobile(false) }
    wide.addEventListener('change', onWide)
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    sidebar?.querySelector<HTMLButtonElement>('.brand')?.focus()
    const lockFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobile(false); requestAnimationFrame(() => mobileTrigger.current?.focus()) }
      if (event.key !== 'Tab' || !sidebar) return
      const buttons = [...sidebar.querySelectorAll<HTMLButtonElement>('button')]
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', lockFocus)
    return () => { wide.removeEventListener('change', onWide); document.removeEventListener('keydown', lockFocus) }
  }, [mobile])
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if ((overlay && !document.querySelector('dialog[data-closing]')) || event.isComposing || event.defaultPrevented) return
      if (event.key === 'Escape' && page === 'search' && !mobile) { event.preventDefault(); exitSearch(); return }
      if (loadedLibrary && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyN') {
        event.preventDefault(); show({ type: 'capture' }, mobile ? mobileTrigger.current : document.querySelector<HTMLElement>('.header-capture')); closeMenu()
        return
      }
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return
      if (event.key.toLowerCase() === 'k' && !event.shiftKey) { event.preventDefault(); openSearch() }
      if (loadedLibrary && event.code === 'Space' && event.shiftKey) {
        event.preventDefault(); show({ type: 'capture' }, document.querySelector<HTMLElement>('.header-capture')); closeMenu()
      }
    }
    window.addEventListener('keydown', shortcuts)
    const stopQuickCapture = desktop?.onQuickCapture(() => {
      if (loadedLibrary && !overlay) { show({ type: 'capture' }, document.querySelector<HTMLElement>('.header-capture')); closeMenu() }
    })
    return () => { window.removeEventListener('keydown', shortcuts); stopQuickCapture?.() }
  }, [overlay, mobile, page, loadedLibrary])
  useEffect(() => {
    if (!desktop) return
    void desktop.getStatus().then(setDesktopStatus).catch(() => undefined)
    const stopStatus = desktop.onStatus(setDesktopStatus)
    const stopCapture = desktop.onCapture(value => { void captureFromDesktop(value) })
    return () => { stopStatus(); stopCapture() }
  }, [update])
  useEffect(() => {
    if (!loadedLibrary || busy || job.current) return
    const candidates = library.clips.filter(clip => !clip.trashed && (!clip.demo || isShowcase(clip)))
    const active = [...candidates.filter(clip => !clip.demo), ...candidates.filter(isShowcase)]
    const pending = active.find(clip => !clip.processing && !attempted.current.has('read:' + clip.id + clip.modified) &&
      attachmentsOf(clip).some(file => /\.(pdf|docx|txt|md|markdown|csv|tsv)$/i.test(file.name) || (ocrEnabled && rasterType.test(file.blob.type))))
    const interactive = page === 'search' || overlay?.type === 'inspect'
    const modelJob = !pending && !interactive && canClassify && library.preferences?.autoClassify ?
      active.find(clip => !clip.prediction && !attempted.current.has('classify:' + clip.id + clip.modified)) : undefined
    const candidate = pending ?? modelJob
    if (!candidate) return
    const mode = pending ? 'read' : 'classify'
    const timer = setTimeout(() => {
      if (job.current) return
      attempted.current.add(mode + ':' + candidate.id + candidate.modified)
      void runJob(candidate, mode, true)
    }, 360)
    return () => clearTimeout(timer)
  }, [library, loadedLibrary, busy, canClassify, ocrEnabled, overlay?.type, page])

  const inbox = visibleClips(library.clips)
  const pinned = inbox.filter(clip => clip.pinned).sort((a, b) => b.created - a.created)

  async function loadDemo() {
    if (!loadedLibrary || importingDemo.current) return
    importingDemo.current = true
    setDemoLoading(true)
    try {
      const prepared = await missingShowcase(library, assetUrl)
      if (await commit(state => mergeShowcase(state, prepared))) {
        navigate('inbox')
        requestAnimationFrame(() => main.current?.focus({ preventScroll: true }))
      }
    } catch {
      notify('Couldn’t load the demo files. Check your connection and try again.')
    } finally {
      importingDemo.current = false
      setDemoLoading(false)
    }
  }

  async function writeCapture(draft: Clip, keepDuplicate: boolean, unattended = false): Promise<SaveResult> {
    try {
      const prepared = await prepareClip(draft)
      let duplicate: Clip | undefined
      let saved = false
      await update(current => {
        duplicate = keepDuplicate ? undefined : exactDuplicates(prepared, current.clips)[0]
        if (duplicate) return current
        const prior = current.clips.find(value => value.id === draft.id)
        if (prior?.trashed) return current
        const collection = current.collections.some(value => value.id === prepared.collection) ? prepared.collection : undefined
        const sameFiles = prior && JSON.stringify(attachmentsOf(prior).map(file => file.id + ':' + file.hash)) === JSON.stringify(attachmentsOf(prepared).map(file => file.id + ':' + file.hash))
        const processing = sameFiles ? prior.processing : undefined
        const prediction = sameFiles && prior?.body === prepared.body && prior?.title === prepared.title ? prior.prediction : undefined
        const clip = { ...prior, ...prepared, collection, processing, prediction, demo: false }
        saved = true
        return { ...current, clips: prior ? current.clips.map(value => value.id === clip.id ? clip : value) : [clip, ...current.clips] }
      })
      if (duplicate) return { duplicate: duplicate.title }
      if (!saved) return { issue: 'This capture was moved to Trash while you were editing.' }
      if (!unattended) notify(selectedClip ? 'Capture updated' : 'Saved to Catch')
      return { saved: true }
    } catch (error) {
      return { issue: error instanceof DOMException && error.name === 'QuotaExceededError' ? 'Local storage is full. Export a backup before freeing space.' :
        error instanceof Error && /^(?:Use an attachment|Choose up to)/.test(error.message) ? error.message : 'Couldn’t save this capture. Try again.' }
    }
  }

  async function captureFromDesktop(payload: ClipboardValue) {
    let clip: Clip
    const id = crypto.randomUUID()
    if (payload.kind === 'text') {
      if (typeof payload.text !== 'string' || payload.text.length > maxTextLength || !payload.text.trim() || sensitiveReason(payload.text)) return
      const url = safeUrl(payload.text)
      clip = { id, body: payload.text, title: (url?.hostname || payload.text.trim().split('\n')[0]).slice(0, 160), kind: url ? 'link' : 'text', created: Date.now(), source: 'desktop' }
    } else {
      if (!(payload.bytes instanceof Uint8Array) || payload.bytes.length > maxAttachmentBytes) return
      const blob = new Blob([Uint8Array.from(payload.bytes)], { type: 'image/png' })
      clip = { id, title: 'Clipboard image', body: '', created: Date.now(), kind: 'image', source: 'desktop',
        attachments: [{ id: crypto.randomUUID(), name: 'clipboard.png', blob }] }
    }
    const result = await writeCapture(clip, false, true)
    if (result.issue) notify('Couldn’t save the monitored capture.')
  }

  async function saveClip(clip: Clip, keepDuplicate: boolean) {
    const result = await writeCapture(clip, keepDuplicate)
    if (result.saved) selectedClip ? openClip(clip.id) : close()
    return result
  }
  async function saveCollection(collection: Collection) {
    const success = await commit(state => {
      if (state.collections.some(value => value.id !== collection.id && value.name.toLowerCase() === collection.name.toLowerCase())) throw new Error('Duplicate collection')
      return { ...state, collections: state.collections.some(value => value.id === collection.id) ?
        state.collections.map(value => value.id === collection.id ? collection : value) : [...state.collections, collection] }
    }, selectedCollection ? 'Collection updated' : 'Collection created')
    if (success) { close(); if (!selectedCollection) navigate(collection.id) }
    return success
  }
  function bulk(ids: string[], action: BulkAction) {
    const matching = new Set(ids)
    const messages = { archive: 'Moved to Archive', unarchive: 'Returned to Inbox', trash: 'Moved to Trash · restore it there', restore: 'Restored from Trash' }
    return commit(state => ({ ...state, clips: state.clips.map(clip => matching.has(clip.id) ? applyCaptureState(clip, action) : clip) }), messages[action])
  }
  async function runJob(clip: Clip, action: 'read' | 'classify', background = false) {
    if (job.current) { notify('Catch is already processing a capture.'); return }
    const controller = new AbortController()
    job.current = controller
    const progress = (label: string) => { if (!controller.signal.aborted) setBusy({ id: clip.id, label }) }
    progress(action === 'read' ? 'Preparing attachments…' : 'Comparing local category embeddings…')
    try {
      const change = action === 'read' ? await (async () => {
        const { extractClip } = await import('./extraction')
        const processing = await extractClip(clip, ocrEnabled, controller.signal, progress)
        const corrections = clip.processing?.passages.filter(value => value.method === 'correction') ?? []
        return { processing: { ...processing, passages: [...processing.passages, ...corrections] }, prediction: undefined }
      })() : { prediction: await classifyClip(clip, controller.signal) }
      controller.signal.throwIfAborted()
      await changeClip(clip.id, current => current.modified === clip.modified && !current.trashed ?
        { ...current, ...change, modified: Date.now() } : current, background ? undefined : action === 'read' ? 'Finished reading files' : 'Category check finished')
    } catch {
      if (controller.signal.aborted) notify('Processing cancelled')
      else if (!background) notify('Local processing failed. Check Settings or retry.')
    } finally {
      job.current = undefined
      setBusy(undefined)
    }
  }
  function saveCorrection(clip: Clip, passage: Passage, text: string) {
    return changeClip(clip.id, current => {
      if (!current.processing) return current
      const passages = current.processing.passages.filter(value => value.method !== 'correction' || value.page !== passage.page || value.attachment !== passage.attachment)
      return { ...current, modified: Date.now(), prediction: undefined, processing: { ...current.processing, passages: [...passages, { ...passage, method: 'correction', confidence: undefined, text }] } }
    }, 'Correction saved')
  }
  async function desktopAction(promise: Promise<DesktopStatus> | undefined) {
    if (!promise) return
    try { setDesktopStatus(await promise) } catch { notify('Could not update Windows clipboard settings.') }
  }

  function renderOverlay() {
    if (!overlay || !loadedLibrary) return null
    switch (overlay.type) {
      case 'capture': return <CaptureDialog collections={library.collections} defaultCollection={activeCollection?.id} existing={selectedClip} onClose={() => selectedClip ? show({ type: 'inspect', id: selectedClip.id }) : close()} onSave={saveClip}/>
      case 'inspect': return selectedClip && <InspectDialog key={selectedClip.id} clip={selectedClip} collections={library.collections} siblings={library.clips} canClassify={canClassify}
        busy={busy?.id === selectedClip.id ? busy.label : undefined} onClose={close} notify={notify} onOpen={openClip}
        onPin={() => changeClip(selectedClip.id, clip => ({ ...clip, pinned: !clip.pinned }), selectedClip.pinned ? 'Capture unpinned' : 'Capture pinned')}
        onEdit={() => show({ type: 'capture', id: selectedClip.id })}
        onMove={collection => changeClip(selectedClip.id, (clip, state) => ({ ...clip, collection: state.collections.some(value => value.id === collection) ? collection : undefined }), collection ? 'Capture moved' : 'Removed from collection')}
        onArchive={() => void bulk([selectedClip.id], selectedClip.archived ? 'unarchive' : 'archive').then(ok => { if (ok) close() })}
        onRestore={() => void bulk([selectedClip.id], 'restore').then(ok => { if (ok) close() })}
        onDelete={() => selectedClip.trashed ? show({ type: 'purge', id: selectedClip.id }) : void bulk([selectedClip.id], 'trash').then(ok => { if (ok) close() })}
        onRead={() => void runJob(selectedClip, 'read')} onClassify={() => void runJob(selectedClip, 'classify')} onCancel={() => job.current?.abort()}
        onCorrection={(passage, text) => saveCorrection(selectedClip, passage, text)}/>
      case 'collection': return <CollectionDialog existing={selectedCollection} collections={library.collections} onClose={close} onSave={saveCollection} onDelete={() => selectedCollection && show({ type: 'delete-collection', id: selectedCollection.id })}/>
      case 'tour': return <TourDialog onClose={close} onDone={async () => { if (await commit(state => ({ ...state, tourDone: true, welcomeCollapsed: true }))) close() }}/>
      case 'import': return <ImportDialog onClose={close} onImport={async (imported, preferences) => {
        const success = await commit(state => mergeLibrary(state, imported, preferences), 'Backup merged')
        if (success) close()
        return success
      }}/>
      case 'clear': return <ConfirmDialog title="Move library to Trash?" message="This moves every capture to Trash, including archived items. You can restore them there." label="Move to Trash" onClose={close} confirm={async () => {
        if (await commit(state => ({ ...state, clips: state.clips.map(clip => clip.trashed ? clip : applyCaptureState(clip, 'trash')) }), 'Library moved to Trash')) { close(); navigate('trash') }
      }}/>
      case 'enable-monitoring': return <ConfirmDialog title="Enable clipboard monitoring?" message="While Catch is running, newly copied text can enter its Windows library. You can pause immediately in Settings or the tray. Likely secrets are skipped, but the filter is imperfect. Images follow the separate capture preference." label="Enable monitoring" onClose={close} confirm={async () => { await desktopAction(desktop?.setMonitoring(true)); close() }}/>
      case 'purge': return selectedClip && <ConfirmDialog title="Permanently delete capture?" message={'“' + selectedClip.title + '” and its original files will be erased from this library.'} label="Delete permanently" onClose={() => show({ type: 'inspect', id: selectedClip.id })} confirm={async () => {
        if (await commit(state => ({ ...state, clips: state.clips.filter(clip => clip.id !== selectedClip.id || !clip.trashed) }), 'Capture deleted permanently')) close()
      }}/>
      case 'delete-collection': return selectedCollection && <ConfirmDialog title="Delete collection?" message={'Captures in “' + selectedCollection.name + '” will remain in the library without a collection.'} label="Delete collection" onClose={() => show({ type: 'collection', id: selectedCollection.id })} confirm={async () => {
        if (await commit(state => ({ ...state, collections: state.collections.filter(value => value.id !== selectedCollection.id), clips: state.clips.map(clip => clip.collection === selectedCollection.id ? { ...clip, collection: undefined } : clip) }), 'Collection deleted')) {
          if (page === selectedCollection.id) navigate('collections')
          close()
        }
      }}/>
      case 'remove-demo': return <ConfirmDialog title="Remove demo content?" message="This moves unchanged examples to Trash. Your captures and collections stay in place." label="Move examples to Trash" onClose={close} confirm={async () => {
        if (await commit(state => ({ ...state, clips: state.clips.map(clip => clip.demo && !clip.trashed ? applyCaptureState(clip, 'trash') : clip) }), 'Examples moved to Trash')) close()
      }}/>
    }
  }

  return <div className={'app-shell' + (loadedLibrary ? ' library-ready' : '') + (mobile ? ' mobile-menu-open' : '')}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); main.current?.focus() }}>Skip to content</a>
    <Sidebar library={library} page={page} mobile={mobile} navigate={navigate} addCollection={addCollection} onClose={closeMenu} onSearch={openSearch} desktop={!!desktop}/>
    <div className="workspace" inert={mobile || undefined}>
      <Header scrolled={scrolled} onMenu={() => { mobileTrigger.current = document.activeElement as HTMLElement; setMobile(true) }}
        inputRef={searchInput} query={query} onQuery={changeQuery} onClear={exitSearch} onInbox={() => navigate('inbox')}
        onCapture={openCapture} captureReady={!!loadedLibrary} menuOpen={mobile}/>
      <main id="main-content" className="main-content" ref={main} tabIndex={-1}>
        {!loadedLibrary ? <><h1 className="inbox-title">Inbox</h1>{error ?
          <Empty icon="inbox" title="Couldn’t open your library" text="Close other Catch tabs and try again." action="Try again" onAction={load}/> :
          <p className="library-opening" role="status">Opening your library…</p>}</> : <>
        {page === 'inbox' && <>
          <h1 className="inbox-title">Inbox</h1>
          {!!pinned.length && <PinnedCards clips={pinned.slice(0, 2)} onOpen={openClip} onViewAll={() => navigate('pinned')}/>}
          {inbox.length ? <Timeline key={page} clips={inbox} onOpen={openClip} onBulk={bulk}/> : <InboxEmpty onCapture={openCapture}/>}
        </>}
        {page === 'search' && <SearchResults library={library} available={canClassify} query={query} onQuery={changeQuery}
          inputRef={searchInput} onClose={exitSearch} onOpen={(id, term) => openClip(id, term, searchInput.current)}/>}
        {page === 'pinned' && <><PageTitle eyebrow="Your library" title="Pinned" description="Keep the important things close at hand."/>
          {pinned.length ? <PinnedCards clips={pinned} onOpen={openClip}/> : <Empty icon="pin" title="Nothing pinned yet" text="Open any capture and choose Pin to keep it here." action="Go to inbox" onAction={() => navigate('inbox')}/>}</>}
        {page === 'collections' && <Collections library={library} navigate={navigate} create={addCollection} edit={collection => show({ type: 'collection', id: collection.id })}/>}
        {activeCollection && <>
          <PageTitle eyebrow="Collection" title={activeCollection.name} description="Captures filed in this collection."><button className="button outline" onClick={() => show({ type: 'collection', id: activeCollection.id })}><Icon name="edit" size={16}/> Edit collection</button></PageTitle>
          <Timeline key={page} heading="Captures" clips={inbox.filter(clip => clip.collection === activeCollection.id)} onOpen={openClip} onCapture={openCapture} onBulk={bulk}/>
        </>}
        {page === 'archive' && <><PageTitle eyebrow="Your library" title="Archive" description="Filed away from your inbox. Restore these captures whenever you need them."/><Timeline key={page} heading="Archived captures" clips={library.clips.filter(clip => clip.archived && !clip.trashed)} actions={['unarchive', 'trash']} onOpen={openClip} onBulk={bulk}/></>}
        {page === 'trash' && <><PageTitle eyebrow="Your library" title="Trash" description="Restore a capture or open it to delete it permanently."/><Timeline key={page} heading="Trashed captures" clips={library.clips.filter(clip => !!clip.trashed)} actions={['restore']} onOpen={openClip} onBulk={bulk}/></>}
        {page === 'viewed' && <><PageTitle eyebrow="Your library" title="Recently viewed" description="Rediscover the captures you opened on this device."/><Timeline key={page} heading="View history" clips={library.clips.filter(clip => clip.viewed && !clip.trashed)} byViewed onOpen={openClip}/></>}
        {page === 'review' && <ReviewPage library={library} onOpen={openClip}
          onResolve={(item, state, edit) => void changeClip(item.clip.id, clip => decide(clip, item, state, edit), state ? 'Review saved' : 'Suggestion reopened')}
          onCombine={item => void changeClip(item.clip.id, clip => ({ ...decide(clip, item, 'accepted'), tags: [...new Set([...(clip.tags ?? []), ...(item.related?.tags ?? [])])].slice(0, 30) }), 'Tags merged; both captures kept')}
          onDiscard={item => { if (item.related) void bulk([item.related.id], 'trash') }}
          onComplete={(id, task, complete) => void changeClip(id, clip => ({ ...clip, tasks: clip.tasks?.map(value => value.id === task ? { ...value, complete } : value) }), complete ? 'Task completed' : 'Task reopened')}/>}
        {page === 'settings' && <Settings library={library} desktop={!!desktop} setTheme={theme => commit(state => ({ ...state, theme }))} setReduced={reduced => commit(state => ({ ...state, reduced }))}
          onExport={async () => { try { await exportLibrary(library); notify('Library exported') } catch (error) { notify(error instanceof Error ? error.message : 'Couldn’t export the library.') } }}
          onRemoveDemo={() => show({ type: 'remove-demo' })} onLoadDemo={loadDemo} demoLoading={demoLoading} onTour={openTour}>
          <DataSettings library={library} desktop={!!desktop} setPreferences={setPreferences} onImport={() => show({ type: 'import' })} onClear={() => show({ type: 'clear' })}/>
          <ModelSettings models={models} enabled={ocrEnabled} setOcr={ocr => void setPreferences({ ocr })}
            semantic={canClassify} setSemantic={enabled => void setPreferences({ semanticDisabled: !enabled })}
            auto={canClassify && !!library.preferences?.autoClassify} setAuto={autoClassify => void setPreferences({ autoClassify })}/>
          {desktopStatus && <DesktopSettings status={desktopStatus} change={enabled => enabled ? show({ type: 'enable-monitoring' }) : void desktopAction(desktop?.setMonitoring(false))}
            images={enabled => void desktopAction(desktop?.setImages(enabled))} shortcut={value => void desktopAction(desktop?.setShortcut(value))}/>}
        </Settings>}
        <footer className="workspace-footer"><span><Icon name="lock" size={14}/> Stored locally</span><button className="text-button" onClick={openTour}>{library.tourDone ? 'Replay quick tour' : 'Catch quick tour'}</button></footer>
        </>}
      </main>
    </div>
    <Fragment key={dialogEpoch.current}>{renderOverlay()}</Fragment>
    <div className="toast-region" ref={toastRegion} popover="manual" role="status">{toast && <div className="toast"><span className="signal"/>{toast}</div>}</div>
  </div>
}
