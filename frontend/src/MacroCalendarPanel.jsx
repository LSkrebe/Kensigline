import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMacroCalendar,
  MACRO_CALENDAR_DEFAULTS,
  peekMacroCalendarCache,
  prefetchMacroCalendar,
} from './macroClient.js'
import {
  filterMacroCalendarDays,
  formatMacroDayHeader,
  getUpcomingMacroDays,
  MACRO_IMPACT_FILTER_DEFAULT,
  MACRO_IMPACT_FILTER_TYPES,
} from './macroCalendarData.js'
import { readFilterSet, UI_PREF_KEYS, writeFilterSet } from './uiPreferences.js'

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
    <div className="feedCompactFilterPicker scrollThin" role="group" aria-label={ariaLabel}>
      {sections.map((section, idx) => (
        <div key={section.title || String(idx)} className="feedFilterSection">
          {section.title ? <p className="feedFilterSectionTitle">{section.title}</p> : null}
          {(Array.isArray(section.types) ? section.types : []).map(({ id, label, code }) => (
            <label key={id} className="feedFilterTypeRow">
              <input type="checkbox" checked={enabled?.has(id) ?? false} onChange={() => onToggle(id)} />
              <span className="feedFilterTypeLabel">{label}</span>
              <span className="feedFilterTypeCode mono" title={id}>
                {code ?? id}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

function MacroCalendarSearch({ value, onChange }) {
  return (
    <label className="researchFeedSearch">
      <input
        className="researchFeedSearchInput"
        type="search"
        value={value}
        placeholder="Search releases"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
        aria-label="Search macro calendar"
        spellCheck={false}
        autoComplete="off"
      />
      <svg className="researchFeedSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </label>
  )
}

function MacroCalendarEventCard({ event }) {
  return (
    <article className={['discoverMacroEvent', `discoverMacroEvent--${event.impact}`].join(' ')}>
      <div className="discoverMacroEventLayout">
        <p className="discoverMacroEventTitle">{event.title}</p>
        <div className="discoverMacroEventAside">
          <span className="discoverMacroEventTime mono">{event.time}</span>
          <span className="discoverMacroEventRegion mono dim">
            {MACRO_REGION_LABEL[event.region] ?? event.region}
          </span>
        </div>
      </div>
    </article>
  )
}

function MacroCalDayColumn({ day }) {
  const head = formatMacroDayHeader(day.date)
  const events = Array.isArray(day?.events) ? day.events : []

  return (
    <div className="discoverMacroDay discoverMacroDay--col">
      <header className="discoverMacroDayHead">
        <span className="discoverMacroDayWeekday mono">{head.weekday}</span>
        <span className="discoverMacroDayDate mono dim">{head.label}</span>
        {head.isToday ? <span className="discoverMacroDayToday mono">Today</span> : null}
      </header>
      <div className="discoverMacroDayBody">
        {!events.length ? (
          <p className="discoverMacroDayEmpty mono dim">Quiet session</p>
        ) : events.length === 1 ? (
          <MacroCalendarEventCard event={events[0]} />
        ) : (
          <article className="discoverMacroEvent discoverMacroEvent--group">
            <div className="discoverMacroEventGroupList">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={['discoverMacroEventRow', `discoverMacroEvent--${event.impact}`].join(' ')}
                >
                  <div className="discoverMacroEventLayout">
                    <p className="discoverMacroEventTitle">{event.title}</p>
                    <div className="discoverMacroEventAside">
                      <span className="discoverMacroEventTime mono">{event.time}</span>
                      <span className="discoverMacroEventRegion mono dim">
                        {MACRO_REGION_LABEL[event.region] ?? event.region}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}
      </div>
    </div>
  )
}

function macroEventMatchesQuery(event, needle) {
  if (!needle) return true
  const hay = [event?.title, event?.region, event?.time].map((s) => String(s ?? '').toLowerCase()).join(' ')
  return hay.includes(needle)
}

function filterMacroDaysByQuery(days, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return days
  return days
    .map((day) => ({
      ...day,
      events: (Array.isArray(day?.events) ? day.events : []).filter((event) => macroEventMatchesQuery(event, needle)),
    }))
    .filter((day) => day.events.length > 0)
}

export function MacroCalendarPanel({ backendUp = false }) {
  const [query, setQuery] = useState('')
  const [liveMacro, setLiveMacro] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [regionFilters, setRegionFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.macroRegionFilters, MACRO_REGION_FILTER_DEFAULT),
  )
  const [impactFilters, setImpactFilters] = useState(() =>
    readFilterSet(UI_PREF_KEYS.macroImpactFilters, MACRO_IMPACT_FILTER_DEFAULT),
  )

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

    const fetchOpts = { ...MACRO_CALENDAR_DEFAULTS }
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
  }, [backendUp])

  useEffect(() => {
    if (backendUp) prefetchMacroCalendar()
  }, [backendUp])

  const macroSource = useMemo(() => {
    if (backendUp) return Array.isArray(liveMacro) ? liveMacro : []
    return getUpcomingMacroDays(MACRO_CALENDAR_DEFAULTS.days)
  }, [backendUp, liveMacro])

  const filteredDays = useMemo(
    () => filterMacroCalendarDays(macroSource, { regions: regionFilters, impacts: impactFilters }),
    [macroSource, regionFilters, impactFilters],
  )

  const days = useMemo(() => filterMacroDaysByQuery(filteredDays, query), [filteredDays, query])

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
  const refreshing = backendUp && fetching && liveMacro != null

  return (
    <div className="macroCalendarPage" aria-label="Macro calendar">
      <header className="macroCalendarPageHead">
        <div className="macroCalendarPageHeadMain">
          <h1 className="macroCalendarPageTitle">MACRO CALENDAR</h1>
          <p className="macroCalendarPageSubtitle mono dim">
            Upcoming economic releases{refreshing ? ' · refreshing' : ''}
          </p>
        </div>
        <div className="macroCalendarPageTools">
          <MacroCalendarSearch value={query} onChange={setQuery} />
          <button
            type="button"
            className={['feedCompactFilterBtn', filterOpen ? 'isActive' : ''].filter(Boolean).join(' ')}
            aria-label="Filter macro calendar"
            title="Filter"
            aria-pressed={filterOpen || undefined}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <MacroFilterIcon />
          </button>
        </div>
      </header>

      <div className="macroCalendarPageBody">
        <div
          className={['macroCalendarPageContent', 'scrollThin', filterOpen ? 'macroCalendarPageContent--filterOpen' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="macroCalendarPageMain" aria-hidden={filterOpen || undefined}>
            {!days.length ? (
              <p className="macroCalendarEmpty mono dim">
                {loading
                  ? 'Loading macro calendar…'
                  : query.trim()
                    ? 'No matching macro releases.'
                    : 'No upcoming macro releases.'}
              </p>
            ) : (
              <div className="macroCalWeek discoverMacroWeek">
                {days.map((day) => (
                  <MacroCalDayColumn key={day.date} day={day} />
                ))}
              </div>
            )}
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
