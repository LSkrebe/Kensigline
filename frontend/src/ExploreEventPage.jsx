/**
 * Event brief — between Explore recap and full dossiers.
 * Collapsing hero; body follows Explore home rhythm (story → context → directory lists).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveExploreEventBrief } from './exploreEventBrief.js'
import { loadExploreEventBriefContext, peekExploreHomeSnapshot, getExploreRecapCache, fetchExploreEventChartSeries } from './exploreApi.js'
import { isLiveDataMode } from './dataMode.js'
import { MiniPriceChart, availablePriceRanges, coercePriceRangeFromOptions } from './MiniPriceChart.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import { exploreActorEventLabel, exploreCompanyEventLabel } from './exploreEventLabels.js'
import './DeepReport.css'
import './ExplorePage.css'

const EXPLORE_EVENT_COLLAPSE_RANGE_FALLBACK = 1
const EXPLORE_EVENT_EXPANDED_FADE_END = 0.88
const EXPLORE_EVENT_COMPACT_FADE_START = 0

function exploreEventCollapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= EXPLORE_EVENT_EXPANDED_FADE_END ? 1 - p / EXPLORE_EVENT_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= EXPLORE_EVENT_COMPACT_FADE_START
      ? 0
      : (p - EXPLORE_EVENT_COMPACT_FADE_START) / (1 - EXPLORE_EVENT_COMPACT_FADE_START)
  return {
    '--deep-collapse': String(p),
    '--deep-expanded-opacity': String(expandedOpacity),
    '--deep-compact-opacity': String(compactOpacity),
  }
}

function filingDocTypeKey(row) {
  const doc = String(row.doc ?? '').trim().toLowerCase()
  const side = row.side
  if (doc.includes('form 4') || doc === 'form4') {
    if (side === 'buy') return 'form4_purchase'
    if (side === 'sell') return 'form4_sale'
    return 'form4'
  }
  if (doc === 'ptr') {
    if (side === 'buy') return 'ptr_purchase'
    if (side === 'sell') return 'ptr_sale'
    return 'ptr'
  }
  if (doc.includes('13f')) {
    if (side === 'buy') return '13f_add'
    if (side === 'sell') return '13f_trim'
    return '13f'
  }
  if (doc.includes('earnings')) return 'earnings'
  return doc.replace(/\s+/g, '_')
}

function filingRowMeta(row) {
  if (row.actorName) return exploreActorEventLabel(filingDocTypeKey(row))
  if (row.openCompany || row.companyName) return exploreCompanyEventLabel(filingDocTypeKey(row))
  return 'Filing'
}

function filingRowTrail(row) {
  return row.amountLabel || row.moveLabel || '—'
}

function filingRowTrailTone(row) {
  if (row.moveLabel && row.moveUp != null) return row.moveUp ? 'isUp' : 'isDown'
  if (row.side === 'buy') return 'isUp'
  if (row.side === 'sell') return 'isDown'
  if (row.hideTxn && row.moveUp != null) return row.moveUp ? 'isUp' : 'isDown'
  if (!row.amountLabel && !row.moveLabel) return 'isFlat'
  return ''
}

function EventDirectoryRow({
  code,
  name,
  meta,
  trail,
  trailTone = '',
  dateLabel = '—',
  rowKind = 'investor',
  onClick = null,
  openLabel = null,
}) {
  const inner = (
    <>
      <span className="exploreDirectoryTicker mono">{code}</span>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{name}</span>
        {meta ? <span className="exploreDirectoryMeta mono">{meta}</span> : null}
      </div>
      <span className={['exploreDirectoryAmount mono', trailTone].filter(Boolean).join(' ')}>
        {trail}
      </span>
      {dateLabel ? <span className="exploreDirectoryDate mono">{dateLabel}</span> : null}
    </>
  )

  if (onClick) {
    return (
      <li className={`exploreDirectoryRow exploreDirectoryRow--${rowKind}`}>
        <button
          type="button"
          className="exploreDirectoryRowBtn"
          onClick={onClick}
          aria-label={openLabel}
        >
          {inner}
        </button>
      </li>
    )
  }

  return (
    <li className={`exploreDirectoryRow exploreDirectoryRow--${rowKind}`}>
      {inner}
    </li>
  )
}

function EventFilingDirectoryRow({ row, onCompanyClick, onInvestorClick }) {
  const openInvestor = Boolean(row.actorName && onInvestorClick && !row.openCompany)
  const openCompany = Boolean(row.ticker && onCompanyClick && (row.openCompany || !row.actorName))
  const name = row.actorName || row.headline || row.companyName || 'Filing'

  const open = () => {
    if (openInvestor) {
      onInvestorClick({
        name: row.actorName,
        typeKey: row.typeKey,
        docType: row.doc,
      })
      return
    }
    if (openCompany) {
      onCompanyClick({ ticker: row.ticker, name: row.companyName })
    }
  }

  const onClick = openInvestor || openCompany ? open : null

  return (
    <EventDirectoryRow
      code={row.code || '—'}
      name={name}
      meta={filingRowMeta(row)}
      trail={filingRowTrail(row)}
      trailTone={filingRowTrailTone(row)}
      dateLabel={row.dateLabel ?? '—'}
      rowKind={row.openCompany && !row.actorName ? 'company' : 'investor'}
      onClick={onClick}
      openLabel={
        onClick
          ? openInvestor
            ? `Open ${row.actorName} dossier`
            : `Open ${row.ticker} dossier`
          : null
      }
    />
  )
}

function EventListSection({ kicker, title, countLabel, children }) {
  return (
    <section className="exploreDirectorySection exploreEventListSection">
      <header className="exploreEventListHead">
        <span className="exploreDirectorySectionHeadCopy">
          <span className="exploreDirectorySectionKicker mono">{kicker}</span>
          <span className="exploreDirectorySectionTitleRow">
            <span className="exploreDirectorySectionTitle">{title}</span>
          </span>
        </span>
        {countLabel ? <span className="exploreEventListCount mono">{countLabel}</span> : null}
      </header>
      <ul className="exploreDirectoryList">{children}</ul>
    </section>
  )
}

function EventChartRange({ value, onChange, options }) {
  if (!options?.length) return null
  return (
    <div className="drpt-chartRange researchPriceRange" role="group" aria-label="Chart range">
      {options.map((r) => (
        <button
          key={r}
          type="button"
          className={['researchPriceRangeBtn', value === r ? 'isActive' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange?.(r)}
          aria-pressed={value === r}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

function EventContextChips({ slide, primary }) {
  const items = [
    slide?.source ? { key: 'source', label: slide.source } : null,
    primary?.ticker ? { key: 'ticker', label: primary.ticker } : null,
    slide?.moveLabel
      ? { key: 'move', label: slide.moveLabel, up: slide.moveUp, down: slide.moveUp === false }
      : null,
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <ul className="exploreEventContextChips">
      {items.map((item) => (
        <li key={item.key}>
          <span
            className={[
              'exploreEventContextChip mono',
              item.up ? 'isUp' : '',
              item.down ? 'isDown' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

function EventContextPanel({ brief, slide, primary }) {
  const summary = brief?.summary
  const headline = slide?.headline
  const hasChips = Boolean(slide?.source || primary?.ticker || slide?.moveLabel)

  if (!headline && !summary && !hasChips) return null

  return (
    <div className="exploreEventContextPanel">
      {headline ? <h2 className="exploreEventContextTitle">{headline}</h2> : null}
      {summary ? <p className="exploreEventContextLead">{summary}</p> : null}
      <EventContextChips slide={slide} primary={primary} />
    </div>
  )
}

const DEFAULT_EVENT_FACT_SLOTS = [
  { key: 'source', label: 'Source', period: 'Document' },
  { key: 'move', label: 'Session move', period: 'Today' },
  { key: 'notional', label: 'Disclosed notional', period: 'In event' },
  { key: 'filings', label: 'Filings', period: 'In event' },
]

function normalizeEventFacts(facts = []) {
  const list = Array.isArray(facts) ? facts : []
  const slots = list.length
    ? list.map(({ key, label, period }) => ({ key, label, period }))
    : DEFAULT_EVENT_FACT_SLOTS
  const byKey = new Map(list.map((fact) => [fact.key, fact]))
  return slots.map((slot) => {
    const fact = byKey.get(slot.key)
    return {
      key: slot.key,
      label: fact?.label ?? slot.label,
      value: fact?.value ?? '—',
      period: fact?.period ?? slot.period,
      up: fact?.up,
    }
  })
}

function EventFactsSection({ facts = [] }) {
  const tiles = normalizeEventFacts(facts)

  return (
    <section className="drpt-section exploreEventFactsSection">
      <p className="drpt-sectionLabel">Snapshot</p>
      <div className="drpt-sectionHead">
        <h2 className="drpt-sectionTitle">Event facts</h2>
      </div>
      <div className="drpt-metricGrid">
        {tiles.map((fact) => (
          <div className="drpt-metricCard" key={fact.key}>
            <span className="drpt-metricLabel">{fact.label}</span>
            <span
              className={[
                'drpt-metricValue',
                fact.up === true ? 'isUp' : '',
                fact.up === false ? 'isDown' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {fact.value}
            </span>
            {fact.period ? <span className="drpt-metricPeriod">{fact.period}</span> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function EventMarketBlock({
  brief,
  slide,
  primary,
  chartSeries = [],
  chartRange,
  onChartRangeChange,
  chartRangeOptions,
  onCompanyClick,
  openPrimaryCompany,
}) {
  const hasChart = chartSeries?.length > 0
  const hasContext = Boolean(
    brief.summary ||
      slide?.headline ||
      slide?.source ||
      primary?.ticker ||
      slide?.moveLabel,
  )
  if (!hasChart && !hasContext) return null

  const chartTicker = brief.chartTicker || primary?.ticker || 'Price'
  const titleClickable = Boolean(primary && onCompanyClick)

  const chartSection = hasChart ? (
    <section className="drpt-section">
      <p className="drpt-sectionLabel">Market</p>
      <div className="drpt-sectionHead">
        {titleClickable ? (
          <button
            type="button"
            className="exploreEventSectionTitleBtn"
            onClick={openPrimaryCompany}
            aria-label={`Open ${primary.ticker} dossier`}
          >
            <span className="drpt-sectionTitle">{chartTicker}</span>
            <span className="exploreEventSectionChevron mono" aria-hidden="true">
              &gt;
            </span>
          </button>
        ) : (
          <h2 className="drpt-sectionTitle">{chartTicker}</h2>
        )}
        <EventChartRange value={chartRange} onChange={onChartRangeChange} options={chartRangeOptions} />
      </div>
      <div className="drpt-figure drpt-figure--chart">
        <MiniPriceChart
          series={chartSeries}
          label={chartTicker}
          showMeta={false}
          chartRange={chartRange}
          onChartRangeChange={onChartRangeChange}
          trimLeadingPlateau
          hideAxisLabels
          flushEdges
          showHoverTooltip
        />
      </div>
    </section>
  ) : null

  const contextAside = hasContext ? (
    <aside className="exploreEventContextAside" aria-label="Event context">
      <EventContextPanel brief={brief} slide={slide} primary={primary} />
    </aside>
  ) : null

  if (hasChart && hasContext) {
    return (
      <div className="drpt-row drpt-row--market exploreEventMarketRow">
        {chartSection}
        {contextAside}
      </div>
    )
  }

  return (
    <div className="exploreEventMarketSingle">
      {chartSection}
      {contextAside}
    </div>
  )
}

export function ExploreEventPage({
  eventId = null,
  backendUp = null,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onCompanyClick = null,
  onInvestorClick = null,
}) {
  const [briefCtx, setBriefCtx] = useState({ day: null, slides: [], mock: false, pending: true })

  useEffect(() => {
    let cancelled = false
    const cached = peekExploreHomeSnapshot(backendUp)
    const recapCache = getExploreRecapCache()
    const slides = cached?.recap?.slides ?? recapCache.slides ?? []
    if (slides.length) {
      setBriefCtx({
        day: recapCache.day,
        slides,
        mock: false,
        pending: !recapCache.day,
      })
    }
    void loadExploreEventBriefContext(backendUp).then((ctx) => {
      if (!cancelled) setBriefCtx(ctx)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, backendUp])

  const brief = useMemo(() => resolveExploreEventBrief(eventId, briefCtx), [eventId, briefCtx])
  const slide = brief?.slide ?? null
  const kicker = slide?.kicker || 'Recap event'
  const primary = brief?.primaryCompany ?? null
  const [chartSeries, setChartSeries] = useState(() => brief?.chartSeries ?? [])
  const [chartRange, setChartRange] = useState('6M')
  const chartRangeOptions = useMemo(
    () => availablePriceRanges(chartSeries, brief?.chartSeriesDays ?? null),
    [chartSeries, brief?.chartSeriesDays],
  )
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)

  useEffect(() => {
    setChartRange((prev) => coercePriceRangeFromOptions(prev, chartRangeOptions))
  }, [eventId, chartRangeOptions])

  useEffect(() => {
    const seed = brief?.chartSeries ?? []
    const ticker = brief?.chartTicker || primary?.ticker
    if (!ticker || !isLiveDataMode(backendUp)) {
      setChartSeries(seed)
      return undefined
    }
    let cancelled = false
    void fetchExploreEventChartSeries(ticker, seed, backendUp).then((series) => {
      if (!cancelled) setChartSeries(Array.isArray(series) ? series : seed)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, brief?.chartTicker, brief?.chartSeries, primary?.ticker, backendUp])

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      const range = spacer?.offsetHeight || EXPLORE_EVENT_COLLAPSE_RANGE_FALLBACK
      const progress = Math.min(1, Math.max(0, page.scrollTop / range))
      for (const [key, value] of Object.entries(exploreEventCollapseProgressVars(progress))) {
        dock.style.setProperty(key, value)
      }
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(syncCollapse)
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    syncCollapse()

    return () => {
      page.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [eventId])

  const openPrimaryCompany = useCallback(() => {
    if (!primary || !onCompanyClick) return
    onCompanyClick({ ticker: primary.ticker, name: primary.name })
  }, [onCompanyClick, primary])

  const metaBits = [
    primary?.name && primary?.ticker
      ? `${primary.name} (${primary.ticker})`
      : primary?.name || primary?.ticker,
    !primary?.name && !primary?.ticker && brief?.people?.[0]?.name ? brief.people[0].name : null,
  ].filter(Boolean)

  return (
    <div className="exploreDirShell exploreEventShell" ref={pageRef}>
      <div className="drpt-stickWrap">
        <div ref={dockRef} className="drpt-dock">
          <div className="drpt-viewport">
            <div className="drpt-expandedBg" aria-hidden="true" />
            <div className="drpt-chromeBar">
              <div className="drpt-compactBg" aria-hidden="true" />
              <TerminalTopBarChrome
                className="exploreRecapChrome"
                logoSrc="/mercerline_mark.png"
                backendUp={backendUp}
                macroActive={macroActive}
                onMacroClick={onMacroClick}
                settingsActive={settingsActive}
                onSettingsClick={onSettingsClick}
                onBrandClick={onBrandClick}
                hideDate
                showClose={!!onCloseClick}
                onCloseClick={onCloseClick}
              />
            </div>
            <div className="drpt-expanded">
              <header
                className={[
                  'drpt-topbar',
                  'drpt-topbar--event',
                  metaBits.length ? '' : 'drpt-topbar--noMeta',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="drpt-topbarIdentity">
                  <p className="drpt-kicker exploreEventHeroKicker">{kicker}</p>
                </div>
                {metaBits.length ? (
                  <div className="drpt-topbarMeta">
                    {metaBits.map((bit) => (
                      <span key={bit}>{bit}</span>
                    ))}
                  </div>
                ) : null}
                {slide?.moveLabel ? (
                  <div className="drpt-topbarPrice drpt-topbarAside">
                    <span
                      className={['drpt-priceChange', 'mono', slide.moveUp ? 'isUp' : 'isDown'].join(
                        ' ',
                      )}
                    >
                      {slide.moveLabel}
                    </span>
                  </div>
                ) : null}
              </header>
            </div>
          </div>
        </div>

        <div ref={spacerRef} className="drpt-collapseSpacer" aria-hidden="true" />

        <div className="exploreDirPaper">
          {!brief ? (
            <div className="exploreEventEmpty">
              <p className="drpt-sectionLabel">Event brief</p>
              <p className="exploreEventEmptyLead">This recap event could not be found.</p>
            </div>
          ) : (
            <div className="exploreEventBody">
              <EventMarketBlock
                brief={brief}
                slide={slide}
                primary={primary}
                chartSeries={chartSeries}
                chartRange={chartRange}
                onChartRangeChange={setChartRange}
                chartRangeOptions={chartRangeOptions}
                onCompanyClick={onCompanyClick}
                openPrimaryCompany={openPrimaryCompany}
              />

              <EventFactsSection facts={brief.facts} />

              {brief.filingRows.length ? (
                <EventListSection
                  kicker={brief.listLabel || 'In this event'}
                  title={brief.listTitle || 'Filings'}
                  countLabel={
                    brief.listCountLabel ||
                    `${brief.filingRows.length} filing${brief.filingRows.length === 1 ? '' : 's'}`
                  }
                >
                  {brief.filingRows.map((row) => (
                    <EventFilingDirectoryRow
                      key={row.id}
                      row={row}
                      onCompanyClick={onCompanyClick}
                      onInvestorClick={onInvestorClick}
                    />
                  ))}
                </EventListSection>
              ) : null}

              {brief.people?.length > 1 ? (
                <EventListSection
                  kicker="Also involved"
                  title="People"
                  countLabel={String(brief.people.length)}
                >
                  {brief.people.map((person) => (
                    <EventDirectoryRow
                      key={person.id}
                      code="F4"
                      name={person.name}
                      meta={person.role || 'Insider'}
                      trail="—"
                      trailTone="isFlat"
                      onClick={
                        onInvestorClick
                          ? () =>
                              onInvestorClick({
                                name: person.name,
                                typeKey: person.typeKey,
                              })
                          : null
                      }
                      openLabel={`Open ${person.name} dossier`}
                    />
                  ))}
                </EventListSection>
              ) : null}

              {!brief.hideCompaniesSection && brief.companies?.length > 1 ? (
                <EventListSection
                  kicker="Also involved"
                  title="Companies"
                  countLabel={String(brief.companies.length)}
                >
                  {brief.companies.map((company) => {
                    const moveLabel =
                      company.dayMovePct != null && Number.isFinite(company.dayMovePct)
                        ? `${company.dayMovePct >= 0 ? '+' : ''}${company.dayMovePct.toFixed(1)}%`
                        : '—'
                    return (
                      <EventDirectoryRow
                        key={company.ticker}
                        code={company.ticker}
                        name={company.name || company.ticker}
                        meta="In event"
                        trail={moveLabel}
                        trailTone={
                          company.dayMovePct != null
                            ? company.dayMovePct >= 0
                              ? 'isUp'
                              : 'isDown'
                            : 'isFlat'
                        }
                        rowKind="company"
                        onClick={
                          onCompanyClick
                            ? () =>
                                onCompanyClick({
                                  ticker: company.ticker,
                                  name: company.name,
                                })
                            : null
                        }
                        openLabel={`Open ${company.ticker} dossier`}
                      />
                    )
                  })}
                </EventListSection>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
