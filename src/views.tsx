import { useState } from 'react'
import { Aperture, assetUrl, Icon, MatrixArt, Wordmark, type IconName } from './graphics'
import { clockTime, describe, formatDay, kinds, visibleClips, type Clip, type Collection, type Kind, type Library, type Theme } from './model'
import { hasShowcaseId, isShowcase, showcasePreview, showcaseSize } from './showcase'

export type Page = string
export type Filter = Kind | 'all'

const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'review', label: 'Review', icon: 'review' },
  { id: 'pinned', label: 'Pinned', icon: 'pin' },
  { id: 'collections', label: 'Collections', icon: 'folder' },
]
const libraryNavigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'viewed', label: 'Recently viewed', icon: 'history' },
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'trash', label: 'Trash', icon: 'trash' },
]

export function Sidebar({ library, page, mobile, navigate, addCollection, onClose, onSearch, desktop }: {
  library: Library; page: Page; mobile: boolean; navigate: (page: Page) => void; addCollection: () => void; onClose: () => void; onSearch: () => void; desktop?: boolean
}) {
  const isDemo = library.clips.some(clip => clip.demo && !clip.trashed)
  return <>
    {mobile && <button className="mobile-scrim" aria-label="Close menu" onClick={onClose}/>}
    <aside className={'sidebar' + (mobile ? ' is-open' : '')} aria-label="Workspace sidebar">
      <button className="brand" aria-label="Catch inbox" onClick={() => navigate('inbox')}><img src={assetUrl('catch.svg')} width="34" height="34" alt=""/><Wordmark/></button>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <p className="nav-label micro">Workspace</p>
        {navigation.map(item => <button key={item.id} className={'nav-item' + (page === item.id ? ' active' : '')} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
          <Icon name={item.icon} size={18}/><span>{item.label}</span>
          {item.id === 'inbox' && <span className="nav-count">{visibleClips(library.clips).length}</span>}
        </button>)}
        <button className="nav-item" onClick={onSearch}><Icon name="search" size={18}/> Search</button>
        <div className="sidebar-divider"/>
        <p className="nav-label micro">Library</p>
        {libraryNavigation.map(item => <button key={item.id} className={'nav-item' + (page === item.id ? ' active' : '')} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} size={17}/><span>{item.label}</span></button>)}
        <div className="sidebar-divider"/>
        <div className="nav-label collection-label micro"><span>My collections</span><button className="icon-button small" aria-label="New collection" title="New collection" onClick={addCollection}><Icon name="plus" size={16}/></button></div>
        {library.collections.map(collection => <button key={collection.id} className={'nav-item collection-nav' + (page === collection.id ? ' active' : '')} aria-current={page === collection.id ? 'page' : undefined} title={collection.name} onClick={() => navigate(collection.id)}>
          <i className="collection-dot" style={{ background: collection.color }}/><span>{collection.name}</span>
        </button>)}
        {!library.collections.length && <button className="nav-item" onClick={addCollection}><Icon name="plus" size={17}/> Add a collection</button>}
      </nav>
      <div className="sidebar-bottom">
        <button className={'nav-item' + (page === 'settings' ? ' active' : '')} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}><Icon name="settings" size={18}/> Settings</button>
        <button className="device" onClick={() => navigate('settings')}>
          <span className="device-icon"><Icon name="lock" size={16}/></span>
          <span><strong>On this device</strong><small>{desktop ? 'Windows library' : isDemo ? 'Includes demo content' : 'Browser library'}</small></span>
        </button>
      </div>
    </aside>
  </>
}

export function Header({ title, scrolled, onMenu, onSearch, onCapture, menuOpen }: {
  title: string; scrolled: boolean; onMenu: () => void; onSearch: () => void; onCapture: () => void; menuOpen: boolean
}) {
  return <header className={'topbar' + (scrolled ? ' scrolled' : '')}>
    <div className="topbar-content">
      <button className="icon-button menu-trigger" aria-label="Workspace menu" aria-expanded={menuOpen} onClick={onMenu}><Icon name="menu"/></button>
      <div className="breadcrumb"><span className="crumb-root">Workspace</span><Icon name="chevron" size={13}/><strong>{title}</strong></div>
      <button className="global-search" onClick={onSearch} aria-label="Search captures" aria-keyshortcuts="Control+K Meta+K"><Icon name="search" size={19}/><span>Search anything…</span><kbd>Ctrl K</kbd></button>
      <button className="button primary header-capture" onClick={onCapture} aria-label="New capture" aria-keyshortcuts="Control+Shift+Space Meta+Shift+Space" title="New capture (Ctrl Shift Space)"><Icon name="plus" size={19}/><span>New capture</span></button>
    </div>
  </header>
}

export function Welcome({ onCapture, onTour, onCollapse, firstRun, demoLoading, onDemo, onEmpty }: {
  onCapture: () => void; onTour: () => void; onCollapse: () => void
  firstRun: boolean; demoLoading: boolean; onDemo: () => void; onEmpty: () => void
}) {
  return <section className="hero" aria-labelledby="hero-title">
    <Aperture/>
    {!firstRun && <button className="icon-button collapse-hero" aria-label="Collapse introduction" title="Collapse introduction" onClick={onCollapse}><Icon name="close" size={18}/></button>}
    <div className="hero-copy">
      <div className="hero-kicker micro"><span className="signal"/><span>Your personal inbox</span></div>
      <h1 id="hero-title">Copy anything.<br/><span>Forget nothing.</span></h1>
      <p>{firstRun ? 'Try search and Review with ' + showcaseSize + ' sample captures, or start a library of your own.' : 'A place for the things you want to keep.'}</p>
      <div className="hero-actions">
        {firstRun ? <>
          <button className="button accent" onClick={onDemo} disabled={demoLoading}><Icon name="folder" size={17}/> {demoLoading ? 'Loading demo…' : 'Explore demo library'}</button>
          <button className="button tour-button" onClick={onEmpty} disabled={demoLoading}>Start with an empty library</button>
        </> : <>
          <button className="button accent" onClick={onCapture}><Icon name="plus" size={18}/> Capture something</button>
          <button className="button tour-button" onClick={onTour}><Icon name="play" size={15}/> Quick tour</button>
        </>}
      </div>
    </div>
  </section>
}

export function CompactInbox({ onWelcome, onReview }: { onWelcome: () => void; onReview: () => void }) {
  return <div className="compact-inbox"><div><div className="micro title-eyebrow"><span className="signal"/> Personal workspace</div><h1>Inbox</h1></div>
    <div className="compact-actions"><button className="button outline" onClick={onReview}><Icon name="review" size={17}/> Review</button><button className="icon-button" title="Show introduction" aria-label="Show introduction" onClick={onWelcome}><Icon name="info" size={18}/></button></div>
  </div>
}

export function TypeMark({ clip }: { clip: Clip }) {
  return <span className={'type-mark kind-' + clip.kind}><Icon name={clip.kind} size={18}/></span>
}

function ClipCard({ clip, open }: { clip: Clip; open: () => void }) {
  const preview = showcasePreview(clip)
  return <button className="clip-card" onClick={open}>
    <div className={'card-art ' + (preview ? 'showcase-art' + (clip.kind === 'file' ? ' document-preview' : '') : clip.artwork ?? 'basic-art')}>
      {preview ? <img src={assetUrl(preview)} alt="" decoding="async"/> : clip.artwork === 'dots' ? <MatrixArt/> : clip.artwork === 'quote' ?
        <><span className="quote-mark" aria-hidden="true">“</span><span className="quote-text">{clip.body}</span></> :
        <><Icon name={clip.kind} size={33}/><span>{describe(clip)}</span></>}
      <span className="card-pin" aria-label="Pinned"><Icon name="pin" size={15}/></span>
    </div>
    <div className="card-caption"><TypeMark clip={clip}/><span className="card-caption-copy"><strong>{clip.title}</strong><small>{kinds[clip.kind]}{clip.demo && ' · Demo'}</small></span><Icon name="chevron" size={17}/></div>
  </button>
}

export function PinnedCards({ clips, onOpen, onViewAll, compact }: { clips: Clip[]; onOpen: (id: string) => void; onViewAll?: () => void; compact?: boolean }) {
  return <section className={'pinned-section' + (compact ? ' compact-pins' : '')} aria-label="Pinned captures">
    {onViewAll && <div className="section-heading"><h2><Icon name="pin" size={18}/> Pinned</h2><button className="text-button" onClick={onViewAll}>View all <Icon name="chevron" size={14}/></button></div>}
    <div className="pinned-grid">{clips.map(clip => <ClipCard key={clip.id} clip={clip} open={() => onOpen(clip.id)}/>)}</div>
  </section>
}

export function ClipRow({ clip, onOpen, search = false }: { clip: Clip; onOpen: () => void; search?: boolean }) {
  return <button className="clip-row" onClick={onOpen}>
    <TypeMark clip={clip}/>
    <span className="row-description"><strong>{clip.title}</strong><small>{describe(clip)}{clip.demo && ' · Demo'}</small></span>
    {!search && <span className="row-time">{clockTime(clip.created)}</span>}
    <Icon name="chevron" size={16}/>
  </button>
}

export function Empty({ icon, title, text, action, onAction }: { icon: IconName; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty"><span className="empty-icon"><Icon name={icon} size={26}/></span><h2>{title}</h2><p>{text}</p>{action && <button className="button outline" onClick={onAction}>{action}</button>}</div>
}

export type BulkAction = 'archive' | 'unarchive' | 'trash' | 'restore'

export function Timeline({ clips, onOpen, onCapture, heading = 'Recent captures', actions = ['archive', 'trash'], onBulk, byViewed = false }: {
  clips: Clip[]; onOpen: (id: string) => void; onCapture?: () => void; heading?: string; actions?: BulkAction[]; onBulk?: (ids: string[], action: BulkAction) => void; byViewed?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [newest, setNewest] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [limit, setLimit] = useState(80)
  const options: Filter[] = ['all', 'text', 'link', 'image', 'file']
  const time = (clip: Clip) => byViewed ? clip.viewed ?? clip.created : clip.created
  const filtered = clips.filter(clip => filter === 'all' || clip.kind === filter)
    .sort((a, b) => newest ? time(b) - time(a) : time(a) - time(b))
  const shown = filtered.slice(0, limit)
  const chosen = selected.filter(id => shown.some(clip => clip.id === id))
  const groups: [string, Clip[]][] = []
  for (const clip of shown) {
    const day = formatDay(time(clip))
    const last = groups.at(-1)
    if (last?.[0] === day) last[1].push(clip)
    else groups.push([day, [clip]])
  }
  return <section className="recent-section" aria-label={heading}>
    <div className="section-heading"><h2>{heading}</h2><div className="timeline-controls">{onBulk && !!clips.length && <button className="button sort-button" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected([]) }}>{selecting ? 'Done' : 'Select'}</button>}<button className="button sort-button" onClick={() => setNewest(!newest)} title="Change sort order"><Icon name="sort" size={16}/>{newest ? 'Newest first' : 'Oldest first'}</button></div></div>
    <div className="filter-bar" role="group" aria-label="Filter by type">{options.map(kind => <button key={kind} aria-pressed={kind === filter} onClick={() => setFilter(kind)}>{kind === 'all' ? 'All captures' : kind === 'text' ? 'Text' : kinds[kind] + 's'}</button>)}</div>
    {selecting && <div className="bulk-actions"><label className="check-label"><input type="checkbox" checked={!!shown.length && shown.length === chosen.length} onChange={event => setSelected(event.target.checked ? shown.map(clip => clip.id) : [])}/> {chosen.length ? chosen.length + ' selected' : 'Select visible'}</label>{actions.map(action => <button key={action} className="button outline" disabled={!chosen.length} onClick={() => { onBulk?.(chosen, action); setSelected([]); setSelecting(false) }}>{{ archive: 'Archive', unarchive: 'Unarchive', restore: 'Restore', trash: 'Move to Trash' }[action]}</button>)}</div>}
    {groups.map(([day, group]) => <div className="day-group" key={day}><h3 className="micro">{day}</h3><div className="rows">{group.map(clip => <div className="select-row" key={clip.id}>
      {selecting && <input type="checkbox" aria-label={'Select ' + clip.title} checked={chosen.includes(clip.id)} onChange={event => setSelected(event.target.checked ? [...selected, clip.id] : selected.filter(id => id !== clip.id))}/>}
      <ClipRow clip={clip} onOpen={() => onOpen(clip.id)}/>
    </div>)}</div></div>)}
    {shown.length < filtered.length && <button className="button outline load-more" onClick={() => setLimit(limit + 80)}>Show more captures</button>}
    {!groups.length && <Empty icon="inbox" title={filter === 'all' ? 'Nothing here yet' : 'No matching captures'} text={filter === 'all' ? (onCapture ? 'Save a note, a link, an image, or a file.' : 'Captures will appear here when available.') : 'Choose another type to see more.'} action={filter === 'all' ? (onCapture ? 'New capture' : undefined) : 'Show all captures'} onAction={filter === 'all' ? onCapture : () => setFilter('all')}/>}
  </section>
}

export function PageTitle({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-title"><div><div className="micro title-eyebrow"><span className="signal"/>{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children}</div>
}

export function Collections({ library, navigate, create, edit }: { library: Library; navigate: (page: Page) => void; create: () => void; edit: (collection: Collection) => void }) {
  return <>
    <PageTitle eyebrow="Your library" title="Collections" description="Keep the things that belong together in one place."><button className="button primary" onClick={create}><Icon name="plus" size={17}/> New collection</button></PageTitle>
    {library.collections.length ? <div className="collection-grid">{library.collections.map(collection => {
      const count = visibleClips(library.clips).filter(clip => clip.collection === collection.id).length
      return <article className="collection-card" key={collection.id}>
        <button className="collection-open" onClick={() => navigate(collection.id)}>
          <span className="collection-emblem" style={{ color: collection.color }}><Icon name="folder" size={28}/></span>
          <strong>{collection.name}</strong><small>{count} {count === 1 ? 'capture' : 'captures'}</small>
        </button>
        <button className="icon-button collection-edit" aria-label={'Edit ' + collection.name} title="Edit collection" onClick={() => edit(collection)}><Icon name="edit" size={16}/></button>
      </article>
    })}</div> : <Empty icon="folder" title="No collections yet" text="Create one from the button above, or file a capture later."/>}
  </>
}

const appearances: { id: Theme; icon: IconName; label: string }[] = [
  { id: 'light', icon: 'sun', label: 'Light' }, { id: 'dark', icon: 'moon', label: 'Dark' }, { id: 'system', icon: 'monitor', label: 'System' },
]

export function Settings({ library, setTheme, setReduced, onExport, onRemoveDemo, onLoadDemo, demoLoading, onTour, desktop, children }: {
  library: Library; setTheme: (theme: Theme) => void; setReduced: (reduced: boolean) => void; onExport: () => void; onRemoveDemo: () => void; onTour: () => void
  onLoadDemo: () => void; demoLoading: boolean; desktop?: boolean; children?: React.ReactNode
}) {
  const pack = library.clips.filter(isShowcase)
  const hasExamples = library.clips.some(clip => clip.demo && !clip.trashed)
  const mayLoad = library.showcaseChoice !== 'demo' || library.clips.filter(hasShowcaseId).length < showcaseSize || pack.some(clip => clip.trashed)
  return <>
    <PageTitle eyebrow="Your workspace" title="Settings" description="Make Catch feel at home on this device."/>
    <div className="settings-stack">
      <section className="settings-panel"><h2><Icon name="sun" size={19}/> Appearance</h2>
        <div className="settings-row"><div><strong>Theme</strong><p>Choose an appearance or follow your system.</p></div>
          <div className="appearance-control" role="group" aria-label="Theme">{appearances.map(value => <button key={value.id} aria-pressed={library.theme === value.id} onClick={() => setTheme(value.id)}><Icon name={value.icon} size={16}/>{value.label}</button>)}</div>
        </div>
        <div className="settings-row"><div><strong>Reduce motion</strong><p>Use fewer transitions and skip smooth scrolling.</p></div><button className="switch" role="switch" aria-label="Reduce motion" aria-checked={library.reduced} onClick={() => setReduced(!library.reduced)}><span/></button></div>
      </section>
      <section className="settings-panel"><h2><Icon name="lock" size={18}/> Privacy and storage</h2>
        <div className="settings-row"><div><strong>{desktop ? 'Stored in this Windows profile' : 'Stored in this browser'}</strong><p>{desktop ? 'Windows storage stays separate from browser libraries. Use a backup to transfer captures.' : 'Captures and attachments stay in this browser profile. Clearing site data removes your library.'} Catch uses local storage without its own encryption layer.</p></div></div>
        <div className="settings-row"><div><strong>Export library</strong><p>Download your captures, collections, and attachments as JSON.</p></div><button className="button outline" onClick={onExport}><Icon name="download" size={16}/> Export</button></div>
        <div className="settings-row"><div><strong>Demo library</strong><p>Explore {showcaseSize} examples stored on this device. Keyword search works immediately. Semantic search, category suggestions and OCR use optional models.</p></div>
          <div className="demo-controls">
            {mayLoad && <button className="button outline" onClick={onLoadDemo} disabled={demoLoading}>{demoLoading ? 'Loading demo…' : library.showcaseChoice === 'demo' ? 'Restore demo library' : 'Explore demo library'}</button>}
            {hasExamples && <button className="button outline" onClick={onRemoveDemo} disabled={demoLoading}>Remove examples</button>}
          </div>
        </div>
      </section>
      {children}
      <section className="settings-panel"><h2><Icon name="info" size={19}/> Using Catch</h2>
        <div className="settings-row"><div><strong>Quick tour</strong><p>Learn how to capture, find, and organize items.</p></div><button className="button outline" onClick={onTour}>Start tour</button></div>
        <div className="settings-row"><div><strong>Keyboard shortcuts</strong><p>Search or capture from anywhere in Catch.</p></div><div className="shortcut-list"><span>Search <kbd>Ctrl K</kbd></span><span>Capture <kbd>Ctrl ⇧ Space</kbd></span></div></div>
      </section>
    </div>
  </>
}
