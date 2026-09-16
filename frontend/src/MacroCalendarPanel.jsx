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
  MACRO_IMPACT_FILTER_DEFAULT,
  MACRO_IMPACT_FILTER_TYPES,
  MACRO_WEEKDAY_LABELS,
  parseMonthKey,
  shiftMonthKey,
} from './macroCalendarData.js'
import { readBoolPref, readFilterSet, UI_PREF_KEYS, writeBoolPref, writeFilterSet } from './uiPreferences.js'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import './ExplorePage.css'
import './MacroCalendarPage.css'

const MACRO_COMPACT_MONTH_MQ = '(max-width: 900px)'

function useMediaQuery(mq) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(mq).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(mq)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mq])

  return matches
}

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
  { id: 'region', label: 'Coverage', title: 'Region', types: MACRO_REGION_FILTER_TYPES },
  { id: 'impact', label: 'Releases', title: 'Impact', types: MACRO_IMPACT_FILTER_TYPES },
]

function MacroFilterIcon() {
  return (
    <svg className="mcalStripFilterIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
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

function MacroFilterConfirmIcon() {
  return (
    <svg className="mcalStripFilterIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
        d="M6 12l4 4 8-10"
      />
    </svg>
  )
}

function cloneFilterSet(set) {
  return new Set(set)
}

function toggleFilterSet(setter, id) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

function MacroFilterPicker({
  sections,
  enabled,
  onToggle,
  ariaLabel,
  showMarketHolidays = true,
  onToggleMarketHolidays = null,
}) {
  return (
    <div className="mcalFilter scrollThin" role="group" aria-label={ariaLabel}>
      <header className="mcalFilterHero">
        <p className="mcalFilterKicker">Macro calendar</p>
        <h2 className="mcalFilterTitle">Filters</h2>
      </header>
      <div className="mcalFilterSections">
        {sections.map((section, idx) => (
          <section key={section.id || section.title || String(idx)} className="mcalFilterSection">
            {section.label || section.title ? (
              <header className="mcalFilterSectionHead">
                {section.label ? <p className="mcalFilterSectionLabel">{section.label}</p> : null}
                {section.title ? <h3 className="mcalFilterSectionTitle">{section.title}</h3> : null}
              </header>
            ) : null}
            <div className="mcalFilterPanel">
              <div className="mcalFilterPanelBody">
                {(Array.isArray(section.types) ? section.types : []).map(({ id, label, code }) => {
                  const on = enabled?.has(id) ?? false
                  return (
                    <label key={id} className="mcalFilterRow">
                      <span className="mcalFilterRowMain">
                        <span className="mcalFilterRowLabel">{label}</span>
                        {code ? (
                          <span
                            className={[
                              'mcalFilterRowCode',
                              section.id === 'impact' ? `mcalFilterRowCode--${id}` : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {code}
                          </span>
                        ) : null}
                      </span>
                      <span className="mcalFilterRowControl">
                        <span className="mcalSwitch">
                          <input
                            type="checkbox"
                            className="mcalSwitchInput"
                            checked={on}
                            onChange={() => onToggle(id)}
                          />
                          <span className="mcalSwitchTrack" aria-hidden="true">
                            <span className="mcalSwitchThumb" />
                          </span>
                        </span>
                      </span>
                    </label>
                  )
                })}
                {section.id === 'impact' && typeof onToggleMarketHolidays === 'function' ? (
                  <label className="mcalFilterRow">
                    <span className="mcalFilterRowMain">
                      <span className="mcalFilterRowLabel">Market holidays</span>
                      <span className="mcalFilterRowCode mcalFilterRowCode--holiday">MKT</span>
                    </span>
                    <span className="mcalFilterRowControl">
                      <span className="mcalSwitch">
                        <input
                          type="checkbox"
                          className="mcalSwitchInput"
                          checked={Boolean(showMarketHolidays)}
                          onChange={onToggleMarketHolidays}
                        />
                        <span className="mcalSwitchTrack" aria-hidden="true">
                          <span className="mcalSwitchThumb" />
                        </span>
                      </span>
                    </span>
                  </label>
                ) : null}
                {Array.from({ length: section.padRows ?? 0 }, (_, padIdx) => (
                  <div
                    key={`pad-${section.id}-${padIdx}`}
                    className="mcalFilterRow mcalFilterRow--spacer"
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function MacroStripMonthNav({ monthKey, onChange }) {
  const compact = useMediaQuery(MACRO_COMPACT_MONTH_MQ)
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
      <span className="mcalStripMonthLabel">{formatMacroMonthTitle(monthKey, { compact })}</span>
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
  onBrandClick = null,
  viewMonth,
  onViewMonthChange,
  filterOpen,
  onFilterOpen,
  onFilterConfirm,
  onFilterCancel,
}) {
  return (
    <div className="mcalStrip">
      <div className="exploreRecapCompactBg" aria-hidden="true" />
      <TerminalTopBarChrome
        className="exploreRecapChrome"
        logoSrc="/mercerline_mark.png"
        backendUp={backendUp}
        macroActive
        onMacroClick={filterOpen ? onFilterCancel : onMacroClick}
        onBrandClick={onBrandClick}
        macroCloseClassName={filterOpen ? 'mcalStripCancelBtn' : ''}
        macroCloseAriaLabel={filterOpen ? 'Cancel filter changes' : undefined}
        hideDate
        hideSettings
        leading={
          !filterOpen ? (
            <div className="mcalStripActions">
              <MacroStripMonthNav monthKey={viewMonth} onChange={onViewMonthChange} />
            </div>
          ) : null
        }
        iconLeading={
          <button
            type="button"
            className={[
              'terminalTopBarIconBtn',
              'mcalStripFilterBtn',
              filterOpen ? 'mcalStripFilterBtn--confirm' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={filterOpen ? 'Apply filters' : 'Filter macro calendar'}
            title={filterOpen ? 'Apply' : 'Filter'}
            onClick={filterOpen ? onFilterConfirm : onFilterOpen}
          >
            {filterOpen ? <MacroFilterConfirmIcon /> : <MacroFilterIcon />}
          </button>
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

function holidayStatusLabel(status) {
  return status === 'early-close' ? 'Early close' : 'Closed'
}

function MacroMonthDayCell({ cell, holiday = null }) {
  const events = Array.isArray(cell?.events) ? cell.events : []
  const outside = cell.kind === 'outside'
  const quiet = !outside && !events.length && !holiday

  return (
    <div
      className={[
        'macroCalMonthCell',
        outside ? 'macroCalMonthCell--outside' : '',
        cell.isToday ? 'macroCalMonthCell--today' : '',
        quiet ? 'macroCalMonthCell--quiet' : '',
        holiday ? 'macroCalMonthCell--holiday' : '',
        holiday?.status === 'early-close' ? 'macroCalMonthCell--earlyClose' : '',
        holiday?.status === 'closed' ? 'macroCalMonthCell--closed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="gridcell"
      aria-label={
        outside
          ? undefined
          : [
              `${cell.dayNum}${cell.isToday ? ', today' : ''}`,
              holiday ? `${holidayStatusLabel(holiday.status)}: ${holiday.name}` : null,
              events.length ? `${events.length} releases` : holiday ? null : 'no releases',
            ]
              .filter(Boolean)
              .join(', ')
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
          {holiday ? (
            <div
              className={[
                'macroCalMonthHoliday',
                holiday.status === 'early-close' ? 'macroCalMonthHoliday--early' : 'macroCalMonthHoliday--closed',
              ].join(' ')}
              title={`${holidayStatusLabel(holiday.status)} · ${holiday.name}`}
            >
              <span className="macroCalMonthHolidayStatus mono">{holidayStatusLabel(holiday.status)}</span>
              <span className="macroCalMonthHolidayName">{holiday.name}</span>
            </div>
          ) : null}
          {events.map((event) => (
            <MacroMonthEventPill key={event.id} event={event} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MacroMonthGrid({ cells, holidaysByDate = null }) {
  const days = cells.filter(cell => cell.kind === 'in-month' && (cell.events.length || holidaysByDate?.has(cell.date)))
  return <div className="mcalAgenda" aria-label="Macro calendar month">
    {days.map(cell => {
      const holiday = holidaysByDate?.get(cell.date)
      const date = new Date(`${cell.date}T12:00:00`)
      return <section className="mcalAgendaDay" key={cell.date}>
        <header className="mcalAgendaDate"><span className="mono">{date.toLocaleDateString('en-US',{weekday:'short'})}</span><h2>{cell.dayNum}</h2>{cell.isToday ? <span className="mono">Today</span> : null}</header>
        <ul className="mcalAgendaEvents">
          {holiday ? <li className="mcalAgendaEvent"><span className="mcalAgendaTime mono">Market</span><span className="mcalAgendaTitle">{holiday.name}</span><span className="mcalAgendaRegion mono">US</span><span className="mcalAgendaImpact mono">{holidayStatusLabel(holiday.status)}</span></li> : null}
          {cell.events.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(event => <li className="mcalAgendaEvent" key={event.id}>
            <time className="mcalAgendaTime mono" title="Eastern Time">{event.time} ET</time>
            <span className="mcalAgendaTitle">{event.title}</span>
            <span className="mcalAgendaRegion mono">{event.region}</span>
            <span className={`mcalAgendaImpact mcalAgendaImpact--${event.impact} mono`}>{event.impact}</span>
          </li>)}
        </ul>
      </section>
    })}
  </div>
}

export function MacroCalendarPanel({ backendUp = false, onMacroClick, onBrandClick = null }) {
  const [viewMonth, setViewMonth] = useState(() => currentMonthKey())
  const [liveMacro, setLiveMacro] = useState(null)
  const [liveHolidays, setLiveHolidays] = useState([])
  const [fetching, setFetching] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSnapshot, setFilterSnapshot] = useState(null)
  const [regionFilters, setRegionFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.macroRegionFilters, MACRO_REGION_FILTER_DEFAULT),
  )
  const [impactFilters, setImpactFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.macroImpactFilters, MACRO_IMPACT_FILTER_DEFAULT),
  )
  const [showMarketHolidays, setShowMarketHolidays] = useState(() =>
    readBoolPref(UI_PREF_KEYS.macroShowMarketHolidays, true),
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
    writeBoolPref(UI_PREF_KEYS.macroShowMarketHolidays, showMarketHolidays)
  }, [showMarketHolidays])

  useEffect(() => {
    const fetchOpts = { month: viewMonth }
    const cached = peekMacroCalendarCache(fetchOpts)
    if (cached && Array.isArray(cached.macro)) {
      setLiveMacro(cached.macro)
      setLiveHolidays(Array.isArray(cached.market_holidays) ? cached.market_holidays : [])
    }

    if (!cached) { setLiveMacro(null); setLiveHolidays([]) }
    let alive = true
    setFetchError(false)
    setFetching(true)
    void fetchMacroCalendar(fetchOpts).then((data) => {
      if (!alive) return
      setFetching(false)
      if (Array.isArray(data?.macro)) setLiveMacro(data.macro)
      else setLiveMacro(cached?.macro ?? [])
      setLiveHolidays(Array.isArray(data?.market_holidays) ? data.market_holidays : cached?.market_holidays ?? [])
    }).catch(() => { if (alive) { setFetching(false); setFetchError(true) } })
    return () => {
      alive = false
    }
  }, [viewMonth, retry])

  useEffect(() => {
    if (backendUp) prefetchMacroCalendar({ month: viewMonth })
  }, [backendUp, viewMonth])

  const macroSource = useMemo(() => {
    if (!monthParsed) return []
    return Array.isArray(liveMacro) ? liveMacro : []
  }, [backendUp, liveMacro, monthParsed])

  const filteredDays = useMemo(
    () => applyMacroEventFilters(macroSource, { regions: regionFilters, impacts: impactFilters }),
    [macroSource, regionFilters, impactFilters],
  )

  const daysByDate = useMemo(() => new Map(filteredDays.map((day) => [day.date, day])), [filteredDays])

  const holidaysByDate = useMemo(() => {
    if (!showMarketHolidays) return new Map()
    const map = new Map()
    for (const h of liveHolidays ?? []) {
      if (h?.date) map.set(h.date, h)
    }
    return map
  }, [liveHolidays, showMarketHolidays])

  const gridCells = useMemo(() => {
    if (!monthParsed) return []
    return buildMacroMonthGrid(monthParsed.year, monthParsed.month, daysByDate)
  }, [monthParsed, daysByDate])

  const hasVisibleEvents = useMemo(
    () => gridCells.some((cell) => cell.kind === 'in-month' && cell.events.length > 0),
    [gridCells],
  )

  const hasVisibleHolidays = useMemo(
    () =>
      showMarketHolidays &&
      gridCells.some((cell) => cell.kind === 'in-month' && holidaysByDate.has(cell.date)),
    [gridCells, holidaysByDate, showMarketHolidays],
  )

  const showGrid = hasVisibleEvents || hasVisibleHolidays

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

  const openFilters = useCallback(() => {
    setFilterSnapshot({
      region: cloneFilterSet(regionFilters),
      impact: cloneFilterSet(impactFilters),
      holidays: showMarketHolidays,
    })
    setFilterOpen(true)
  }, [regionFilters, impactFilters, showMarketHolidays])

  const confirmFilters = useCallback(() => {
    setFilterSnapshot(null)
    setFilterOpen(false)
  }, [])

  const cancelFilters = useCallback(() => {
    if (filterSnapshot) {
      setRegionFilters(filterSnapshot.region)
      setImpactFilters(filterSnapshot.impact)
      setShowMarketHolidays(Boolean(filterSnapshot.holidays))
    }
    setFilterSnapshot(null)
    setFilterOpen(false)
  }, [filterSnapshot])

  const loading = fetching && liveMacro == null

  return (
    <div
      className={['mcalShell', filterOpen ? 'mcalShell--filterOpen' : ''].filter(Boolean).join(' ')}
      aria-label="Macro calendar"
    >
      <MacroCalendarStrip
        backendUp={backendUp}
        onMacroClick={onMacroClick}
        onBrandClick={onBrandClick}
        viewMonth={viewMonth}
        onViewMonthChange={setViewMonth}
        filterOpen={filterOpen}
        onFilterOpen={openFilters}
        onFilterConfirm={confirmFilters}
        onFilterCancel={cancelFilters}
      />

      <div className="mcalScroll scrollThin">
        <div
          className={['mcalBodyContent', filterOpen ? 'mcalBodyContent--filterOpen' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="mcalMain" aria-hidden={filterOpen || undefined}>
            <header className="mcalPageHeading"><p className="mcalFilterKicker">Economic releases</p><h1>Macro calendar</h1></header>
            {loading ? (
              <p className="mcalEmpty">Loading macro calendar…</p>
            ) : fetchError ? (
              <div className="mcalEmpty" role="status"><span>Calendar unavailable. Try again.</span><button className="mcalRetry" onClick={() => setRetry(n => n + 1)}>Retry</button></div>
            ) : !showGrid ? (
              <p className="mcalEmpty">{macroSource.some(day => day.events?.length) ? 'No releases match your filters.' : 'No scheduled releases available for this month.'}</p>
            ) : null}
            {monthParsed && !loading && showGrid ? (
              <MacroMonthGrid cells={gridCells} holidaysByDate={holidaysByDate} />
            ) : null}
          </div>
          {filterOpen ? (
            <MacroFilterPicker
              sections={MACRO_FILTER_SECTIONS}
              enabled={macroFilterEnabled}
              onToggle={onMacroFilterToggle}
              showMarketHolidays={showMarketHolidays}
              onToggleMarketHolidays={() => setShowMarketHolidays((v) => !v)}
              ariaLabel="Macro calendar filters"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
