import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Icon, moveReflection } from './graphics'
import { embed, indexClips } from './inference'
import { kinds, type Library } from './model'
import { defaultHybridRanking, eligible, keywordRanking, semanticRanking, type FilterSet, type Hit, type SearchMode } from './retrieval'
import { TypeMark } from './views'
import { exampleQueries, isShowcase } from './showcase'

const modeLabels = { keyword: 'Keyword', semantic: 'Semantic', hybrid: 'Hybrid' }
const searchModes = ['keyword', 'semantic', 'hybrid'] as const

function Highlight({ snippet, terms }: { snippet: string; terms: string[] }) {
  if (!terms.length) return snippet
  const escaped = terms.map(term => term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')
  const match = new RegExp('(' + escaped + ')', 'gi')
  return snippet.split(match).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)
}

export function SearchResults({ library, available, query, onQuery, inputRef, onClose, onOpen }: {
  library: Library; available: boolean; query: string; onQuery: (value: string) => void; inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void; onOpen: (id: string, query: string) => void
}) {
  const [mode, setMode] = useState<SearchMode>('hybrid')
  const [filters, setFilters] = useState<FilterSet>({})
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [ranked, setRanked] = useState<{ query: string; matches: typeof matches; hits: Hit[] }>()
  const [status, setStatus] = useState('')
  const storage = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => eligible(library.clips, filters), [library.clips, filters])
  const keyword = useMemo(() => keywordRanking(library, query, matches), [library, query, matches])
  const semantic = ranked?.query === query && ranked.matches === matches ? ranked.hits : undefined
  const activeMode = available ? mode : 'keyword'
  const results = useMemo(() => (activeMode === 'semantic' && semantic ? semantic : activeMode === 'hybrid' && semantic ? defaultHybridRanking(keyword, semantic, query) : keyword)
    .slice(0, query.trim() || Object.values(filters).some(Boolean) ? 100 : 6), [activeMode, filters, keyword, query, semantic])
  const resultCount = results.length + (results.length === 1 ? ' match' : ' matches')
  const tags = useMemo(() => [...new Set(library.clips.flatMap(clip => clip.tags ?? []))].sort(), [library.clips])

  useEffect(() => {
    if (activeMode === 'keyword' || !query.trim() || !matches.length) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setStatus('Preparing the local index…')
        const vectors = await indexClips(matches, controller.signal, (done, total) => setStatus(done < total ? 'Checking index · ' + done + '/' + total : 'Searching locally…'))
        const [vector] = await embed([query.trim()])
        if (controller.signal.aborted) return
        setRanked({ query, matches, hits: semanticRanking(matches, vectors, vector) })
        setStatus('')
      } catch {
        if (!controller.signal.aborted) setStatus('Local inference failed. Keyword results are shown.')
      }
    }, 220)
    return () => { clearTimeout(timer); controller.abort() }
  }, [activeMode, matches, query])

  useEffect(() => { storage.current?.querySelectorAll('.search-result')[selected]?.scrollIntoView({ block: 'nearest' }) }, [selected])

  function resetResults() {
    setSelected(-1); setRanked(undefined); setStatus('')
    if (storage.current) storage.current.scrollTop = 0
  }
  function updateFilter<T extends keyof FilterSet>(key: T, value: FilterSet[T]) {
    setFilters({ ...filters, [key]: value })
    resetResults()
  }
  function changeQuery(value: string) { onQuery(value); inputRef.current?.focus(); resetResults() }

  useEffect(() => {
    setSelected(-1)
    setStatus('')
  }, [query])

  useEffect(() => {
    const input = inputRef.current
    function select(event: KeyboardEvent) {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || !results.length) return
      if (event.key === 'Enter') {
        event.preventDefault()
        onOpen(results[Math.max(0, Math.min(selected, results.length - 1))].clip.id, query)
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected(selected < 0 && event.key === 'ArrowUp' ? results.length - 1 : (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
      }
    }
    input?.addEventListener('keydown', select)
    return () => input?.removeEventListener('keydown', select)
  }, [inputRef, onOpen, query, results, selected])

  return <section className="search-page" aria-label="Search results">
    <div className="search-page-title"><h1 className="inbox-title">Search</h1><button className="button outline" onClick={onClose}>Close search</button></div>
    <div className="search-controls">
      <div className="appearance-control glass-segments search-modes" role="group" aria-label="Search mode" onPointerMove={moveReflection}
        style={{ '--segment-index': searchModes.indexOf(activeMode) } as CSSProperties}>{searchModes.map(option =>
        <button key={option} aria-pressed={activeMode === option} aria-disabled={option !== 'keyword' && !available}
          onClick={() => { if (option === 'keyword' || available) { setMode(option); resetResults() } }}>{modeLabels[option]}</button>)}</div>
      <button className="button outline search-filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Icon name="sort" size={16}/> Filters</button>
    </div>
    {showFilters && <div className="search-filters">
      <label>Type<select value={filters.kind ?? ''} onChange={event => updateFilter('kind', event.target.value)}><option value="">All types</option>{Object.entries(kinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
      <label>Collection<select value={filters.collection ?? ''} onChange={event => updateFilter('collection', event.target.value)}><option value="">All collections</option>{library.collections.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label>Tag<select value={filters.tag ?? ''} onChange={event => updateFilter('tag', event.target.value)}><option value="">All tags</option>{tags.map(tag => <option key={tag}>{tag}</option>)}</select></label>
      <label>On or after<input type="date" value={filters.after ?? ''} onChange={event => updateFilter('after', event.target.value)}/></label>
      <label className="check-label"><input type="checkbox" checked={!!filters.includeArchived} onChange={event => updateFilter('includeArchived', event.target.checked)}/> Include archive</label>
    </div>}
    {!query && !!library.preferences?.recentSearches?.length && <div className="search-history"><span className="micro">Recent searches</span>{library.preferences.recentSearches.slice(0, 4).map(item => <button className="button outline" key={item} onClick={() => changeQuery(item)}>{item}</button>)}</div>}
    {!query && library.clips.some(clip => isShowcase(clip) && !clip.trashed && !clip.archived) && <div className="search-history demo-queries">
      <span className="micro">Try a demo search</span>{exampleQueries.map(example => <button className="button outline" key={example} onClick={() => changeQuery(example)}>{example}</button>)}
    </div>}
    <div className="search-content" ref={storage}>
      <div className="micro search-label" aria-live="polite">{status || (query.trim() ? (results.length ? (activeMode !== 'keyword' && !semantic ? 'Keyword matches while local search prepares' : resultCount) : 'No matches') : 'Recent captures')}</div>
      <span className="visually-hidden" aria-live="polite">{results[selected]?.clip.title}</span>
      {results.map((hit, index) => <div className={'search-result' + (index === selected ? ' selected' : '')} key={hit.clip.id}>
        <button className="clip-row" onClick={() => onOpen(hit.clip.id, query)}><TypeMark clip={hit.clip}/><span className="row-description">
          <strong>{hit.clip.title}</strong><small>{hit.page && <b>Page {hit.page} · </b>}<Highlight snippet={hit.snippet} terms={hit.matches ?? []}/></small>
        </span><Icon name="chevron" size={16}/></button>
      </div>)}
      {!results.length && <p className="search-empty">{query.trim() ? 'Try a different query or clear a filter.' : 'Your captures will appear here.'}</p>}
    </div>
    <div className="search-footer"><span>{available ? 'Searches this device' : 'Install the optional search model in Settings for semantic and hybrid search.'}</span><span><kbd>↑</kbd> <kbd>↓</kbd> Navigate <kbd>↵</kbd> Open</span></div>
  </section>
}
