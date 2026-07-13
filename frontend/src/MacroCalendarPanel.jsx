import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMacroCalendar,
  peekMacroCalendarCache,
  prefetchMacroCalendar,
} from './macroClient.js'
import {
  applyMacroEventFilters,
  buildMacroMonthGrid,
  currentMonthKey,
  formatMacroMonthTitle,
  getMacroMonthDays,
  MACRO_IMPACT_FILTER_DEFAULT,
  MACRO_IMPACT_FILTER_TYPES,
  MACRO_WEEKDAY_LABELS,
  parseMonthKey,
  shiftMonthKey,
} from './macroCalendarData.js'
import { readFilterSet, UI_PREF_KEYS, writeFilterSet } from './uiPreferences.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import './ExplorePage.css'
import './MacroCalendarPage.css'

const MACRO_REGION_LABEL = {
  US: 'US',
  EU: 'EU',
  CN: 'CN',
  UK: 'UK',
}

const MACRO_REGION_FILTER_TYPES = [
  { id: 'US', label: 'United States', code: 'US' },
  { id: 'EU', label: 'Europe', code: 'EU' },
  { id: 'CN', label: 'China', code: 'CN' },
  { id: 'UK', label: 'United Kingdom', code: 'UK' },
]

const MACRO_REGION_FILTER_DEFAULT = new Set(MACRO_REGION_FILTER_TYPES.map((t) => t.id))

const MACRO_FILTER_SECTIONS = [
  { title: 'Region', types: MACRO_REGION_FILTER_TYPES },
  { title: 'Impact', types: MACRO_IMPACT_FILTER_TYPES },
]

function MacroFilterIcon() {
  return (
    <svg className="feedCompactFilterIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6h16l-6 7v5l-4 2v-7L4 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function toggleFilterSet(setter, id) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

function MacroFilterPicker({ sections, enabled, onToggle, ariaLabel }) {
  return (
    <div className="mcalFilterPicker feedCompactFilterPicker scrollThin" role="group" aria-label={ariaLabel}>
      {sections.map((section, idx) => (
        <div key={section.title || String(idx)} className="feedFilterSection">
          {section.title ? <p className="feedFilterSectionTitle">{section.title}</p> : null}
          {(Array.isArray(section.types) ? section.types : []).map(({ id, label, code }) => (
            <label key={id} className="feedFilterTypeRow">
              <input type="checkbox" checked={enabled?.has(id) ?? false} onChange={() => onToggle(id)} />
              <span className="feedFilterTypeLabel">{label}</span>
              <span
                className={[
                  'feedFilterTypeCode',
                  'mono',
                  section.title === 'Impact' ? `feedFilterTypeCode--impact-${id}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={id}
              >
                {code ?? id}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

function MacroStripMonthNav({ monthKey, onChange }) {
  return (
    <div className="mcalStripMonthNav" role="navigation" aria-label="Calendar month">
      <button
        type="button"
        className="mcalStripMonthBtn mono"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonthKey(monthKey, -1))}
      >
        ‹
      </button>
      <span className="mcalStripMonthLabel">{formatMacroMonthTitle(monthKey)}</span>
      <button
        type="button"
        className="mcalStripMonthBtn mono"
        aria-label="Next month"
        onClick={() => onChange(shiftMonthKey(monthKey, 1))}
      >
        ›
      </button>
    </div>
  )
}

function MacroCalendarStrip({
  backendUp,
  onMacroClick,
  viewMonth,
  onViewMonthChange,
  filterOpen,
  onFilterToggle,
}) {
  return (
    <div className="mcalStrip">
      <div className="exploreRecapCompactBg" aria-hidden="true" />
      <TerminalTopBarChrome
        className="exploreRecapChrome"
        logoSrc="/mercerline_mark.png"
        backendUp={backendUp}
        macroActive
        onMacroClick={onMacroClick}
        hideDate
        hideSettings
        leading={
          <div className="mcalStripActions">
            <MacroStripMonthNav monthKey={viewMonth} onChange={onViewMonthChange} />
            <button
              type="button"
              className={['mcalStripFilterBtn', filterOpen ? 'isActive' : ''].filter(Boolean).join(' ')}
              aria-label="Filter macro calendar"
              title="Filter"
              aria-pressed={filterOpen || undefined}
              onClick={onFilterToggle}
            >
              <MacroFilterIcon />
            </button>
          </div>
        }
      />
    </div>
  )
}

function MacroMonthEventPill({ event }) {
  return (
    <div
      className={['macroCalMonthEvent', `macroCalMonthEvent--${event.impact}`].filter(Boolean).join(' ')}
      title={`${event.time} ET · ${event.title} (${MACRO_REGION_LABEL[event.region] ?? event.region})`}
    >
      <span className="macroCalMonthEventTime mono">{event.time}</span>
      <span className="macroCalMonthEventTitle">{event.title}</span>
    </div>
  )
}

function MacroMonthDayCell({ cell }) {
  const events = Array.isArray(cell?.events) ? cell.events : []
  const outside = cell.kind === 'outside'
  const quiet = !outside && !events.length

  return (
    <div
      className={[
        'macroCalMonthCell',
        outside ? 'macroCalMonthCell--outside' : '',
        cell.isToday ? 'macroCalMonthCell--today' : '',
        quiet ? 'macroCalMonthCell--quiet' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="gridcell"
      aria-label={
        outside
          ? undefined
          : `${cell.dayNum}${cell.isToday ? ', today' : ''}${events.length ? `, ${events.length} releases` : ', no releases'}`
      }
    >
      <div className="macroCalMonthCellHead">
        <div className="macroCalMonthCellHeadMain">
          {cell.weekdayLabel ? (
            <span className="macroCalMonthCellWeekday mono dim">{cell.weekdayLabel}</span>
          ) : null}
          <span className="macroCalMonthCellDay mono">{cell.dayNum}</span>
        </div>
        {cell.isToday ? <span className="macroCalMonthCellToday mono">Today</span> : null}
      </div>
      {!outside ? (
        <div className="macroCalMonthCellBody">
          {events.map((event) => (
            <MacroMonthEventPill key={event.id} event={event} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MacroMonthGrid({ cells }) {
  return (
    <div className="macroCalMonth" role="grid" aria-label="Macro calendar month">
      <div className="macroCalMonthWeekdays" aria-hidden="true">
        {MACRO_WEEKDAY_LABELS.map((label) => (
          <span key={label} className="macroCalMonthWeekday mono dim">
            {label}
          </span>
        ))}
      </div>
      <div className="macroCalMonthGrid">
        {cells.map((cell) => (
          <MacroMonthDayCell key={cell.date} cell={cell} />
        ))}
      </div>
    </div>
  )
}

export function MacroCalendarPanel({ backendUp = false, onMacroClick }) {
  const [viewMonth, setViewMonth] = useState(() => currentMonthKey())
  const [liveMacro, setLiveMacro] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [regionFilters, setRegionFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.macroRegionFilters, MACRO_REGION_FILTER_DEFAULT),
  )
  const [impactFilters, setImpactFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.macroImpactFilters, MACRO_IMPACT_FILTER_DEFAULT),
  )

  const monthParsed = useMemo(() => parseMonthKey(viewMonth), [viewMonth])

  const toggleMacroFilter = useCallback((dimension, id) => {
    if (dimension === 'region') toggleFilterSet(setRegionFilters, id)
    else if (dimension === 'impact') toggleFilterSet(setImpactFilters, id)
  }, [])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.macroRegionFilters, regionFilters)
  }, [regionFilters])

  useEffect(() => {
    writeFilterSet(UI_PREF_KEYS.macroImpactFilters, impactFilters)
  }, [impactFilters])

  useEffect(() => {
    if (!backendUp) {
      setLiveMacro(null)
      setFetching(false)
      return undefined
    }

    const fetchOpts = { month: viewMonth }
    const cached = peekMacroCalendarCache(fetchOpts)
    if (cached && Array.isArray(cached.macro)) {
      setLiveMacro(cached.macro)
    }

    let alive = true
    setFetching(true)
    void fetchMacroCalendar(fetchOpts).then((data) => {
      if (!alive) return
      setFetching(false)
      if (Array.isArray(data?.macro)) setLiveMacro(data.macro)
      else setLiveMacro(cached ?? [])
    })
    return () => {
      alive = false
    }
  }, [backendUp, viewMonth])

  useEffect(() => {
    if (backendUp) prefetchMacroCalendar({ month: viewMonth })
  }, [backendUp, viewMonth])

  const macroSource = useMemo(() => {
    if (!monthParsed) return []
    if (backendUp) return Array.isArray(liveMacro) ? liveMacro : []
    return getMacroMonthDays(monthParsed.year, monthParsed.month)
  }, [backendUp, liveMacro, monthParsed])

  const filteredDays = useMemo(
    () => applyMacroEventFilters(macroSource, { regions: regionFilters, impacts: impactFilters }),
    [macroSource, regionFilters, impactFilters],
  )

  const daysByDate = useMemo(() => new Map(filteredDays.map((day) => [day.date, day])), [filteredDays])

  const gridCells = useMemo(() => {
    if (!monthParsed) return []
    return buildMacroMonthGrid(monthParsed.year, monthParsed.month, daysByDate)
  }, [monthParsed, daysByDate])

  const hasVisibleEvents = useMemo(
    () => gridCells.some((cell) => cell.kind === 'in-month' && cell.events.length > 0),
    [gridCells],
  )

  const macroFilterEnabled = useMemo(() => {
    const merged = new Set()
    for (const id of regionFilters ?? []) merged.add(id)
    for (const id of impactFilters ?? []) merged.add(id)
    return merged
  }, [regionFilters, impactFilters])

  const onMacroFilterToggle = useCallback(
    (id) => {
      if (MACRO_REGION_FILTER_DEFAULT.has(id)) {
        toggleMacroFilter('region', id)
        return
      }
      if (MACRO_IMPACT_FILTER_DEFAULT.has(id)) {
        toggleMacroFilter('impact', id)
      }
    },
    [toggleMacroFilter],
  )

  const loading = backendUp && fetching && liveMacro == null

  return (
    <div className="mcalShell" aria-label="Macro calendar">
      <MacroCalendarStrip
        backendUp={backendUp}
        onMacroClick={onMacroClick}
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        filterOpen={filterOpen}
        onFilterToggle={() => setFilterOpen((open) => !open)}
      />

      <div className="mcalScroll scrollThin">
        <div
          className={['mcalBodyContent', filterOpen ? 'mcalBodyContent--filterOpen' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="mcalMain" aria-hidden={filterOpen || undefined}>
            {loading ? (
              <p className="mcalEmpty">Loading macro calendar…</p>
            ) : !hasVisibleEvents ? (
              <p className="mcalEmpty">No macro releases this month.</p>
            ) : null}
            {monthParsed && !loading && hasVisibleEvents ? <MacroMonthGrid cells={gridCells} /> : null}
          </div>
          {filterOpen ? (
            <MacroFilterPicker
              sections={MACRO_FILTER_SECTIONS}
              enabled={macroFilterEnabled}
              onToggle={onMacroFilterToggle}
              ariaLabel="Macro calendar filters"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
