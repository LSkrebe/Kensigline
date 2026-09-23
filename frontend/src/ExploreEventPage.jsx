/**
 * Event brief — between Explore recap and full dossiers.
 * Collapsing hero; body follows Explore home rhythm (story → context → directory lists).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useCollapseScroll } from './collapseScroll.js'
import { resolveExploreEventBrief } from './exploreEventBrief.js'
import { loadExploreEventBriefContext, peekExploreHomeSnapshot, getExploreRecapCache, fetchExploreEventChartSeries } from './exploreApi.js'
import { logClientDiagnostic } from './clientDiagnostics.js'
import { isLiveDataMode } from './dataMode.js'
import { MiniPriceChart, availablePriceRanges, coercePriceRangeFromOptions } from './MiniPriceChart.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
import { isExplorePlaceholderLabel } from './exploreDirectoryTrail.js'
import { exploreActorEventLabel, exploreCompanyEventLabel } from './exploreEventLabels.js'
import {ImageOrInitials,normalizeInvestorName} from './ExplorePersonRow.jsx'
import portraits from './explorePortraits.json'
import { companyLogoFallback, companyLogoSrc } from './localImages.js'
import { SkeletonList, SkeletonStatus } from './AppSkeleton.jsx'
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
  if (row.actorName) return row.sideLabel ? `${row.doc}, ${row.sideLabel}` : exploreActorEventLabel(filingDocTypeKey(row))
  if (row.openCompany || row.companyName) return exploreCompanyEventLabel(filingDocTypeKey(row))
  return 'Filing'
}

function filingRowTrail(row) {
  return row.amountLabel || row.moveLabel || '—'
}

function filingRowTrailTone(row) {
  if (isExplorePlaceholderLabel(filingRowTrail(row))) return 'isFlat'
  if (row.moveLabel && row.moveUp != null) return row.moveUp ? 'isUp' : 'isDown'
  if (row.side === 'buy') return 'isUp'
  if (row.side === 'sell') return 'isDown'
  if (row.hideTxn && row.moveUp != null) return row.moveUp ? 'isUp' : 'isDown'
  if (!row.amountLabel && !row.moveLabel) return 'isFlat'
  return ''
}

function EventDirectoryRow({
  code,
  ticker,
  companyName,
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
      <ImageOrInitials src={rowKind==='company'?companyLogoSrc(ticker??code):portraits[normalizeInvestorName(name)]?.src} fallbackSrc={rowKind==='company'?companyLogoFallback(ticker??code):null} name={rowKind==='company'?(ticker??code):name} className="explorePersonPortrait" logo={rowKind==='company'}/>
      <div className="exploreDirectoryCopy">
        <span className="exploreDirectoryName">{name}</span>
        {meta ? <span className={`exploreDirectoryMeta exploreEventFilingAction mono ${/sale|trim|sell/i.test(meta)?'isDown':/purchase|buy|add/i.test(meta)?'isUp':''}`}>{meta}</span> : null}
        <span className="explorePersonMeta mono">{dateLabel}{ticker?`, ${ticker}`:''}</span>
      </div>
      <span className="exploreEventFilingCompany"><ImageOrInitials src={companyLogoSrc(ticker??code)} fallbackSrc={companyLogoFallback(ticker??code)} name={ticker??code} className="explorePersonLogo" logo/><span>{companyName||ticker||code}</span></span>
      <span className={['exploreDirectoryAmount mono', rowKind==='company'?trailTone:''].filter(Boolean).join(' ')}>
        {trail}
      </span>

    </>
  )

  if (onClick) {
    return (
      <li className={`exploreDirectoryRow exploreDirectoryRow--${rowKind} exploreEventFilingRow`}>
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
    <li className={`exploreDirectoryRow exploreDirectoryRow--${rowKind} exploreEventFilingRow`}>
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
        ticker: row.ticker,
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
      ticker={row.ticker}
      companyName={row.companyName}
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
  openChartCompany,
}) {
  const hasChart = chartSeries?.length > 0
  if (!hasChart) return null

  const chartTickerRaw = brief.chartTicker || primary?.ticker || null
  const chartTicker = chartTickerRaw || 'Price'
  const titleClickable = Boolean(chartTickerRaw && onCompanyClick)

  const chartSection = hasChart ? (
    <section className="drpt-section">
      <p className="drpt-sectionLabel">Market</p>
      <div className="drpt-sectionHead">
        {titleClickable ? (
          <button
            type="button"
            className="exploreEventSectionTitleBtn"
            onClick={openChartCompany}
            aria-label={`Open ${chartTickerRaw} dossier`}
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

  return <div className="exploreEventMarketSingle">{chartSection}</div>
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
  const [chartSeries, setChartSeries] = useState([])
  const [chartRange, setChartRange] = useState('6M')

  useLayoutEffect(() => {
    const cached = peekExploreHomeSnapshot(backendUp)
    const recapCache = getExploreRecapCache()
    const slides = cached?.recap?.slides ?? recapCache.slides ?? []
    setBriefCtx({
      day: recapCache.day,
      slides,
      mock: false,
      pending: !slides.length || !recapCache.day,
    })
    setChartSeries([])
  }, [eventId, backendUp])

  useEffect(() => {
    let cancelled = false
    void loadExploreEventBriefContext(backendUp).then((ctx) => {
      if (cancelled) return
      setBriefCtx((prev) => {
        const slides = ctx.slides?.length ? ctx.slides : prev.slides
        if (!slides.length && ctx.pending) return { ...prev, pending: true }
        return {
          day: ctx.day ?? prev.day,
          slides,
          mock: ctx.mock === true,
          pending: ctx.pending === true,
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [eventId, backendUp])

  const brief = useMemo(() => resolveExploreEventBrief(eventId, briefCtx), [eventId, briefCtx])

  useEffect(() => {
    if (!eventId || brief || briefCtx.pending) return
    logClientDiagnostic('explore.event_not_found', {
      eventId: String(eventId),
      slideCount: briefCtx.slides?.length ?? 0,
    })
  }, [eventId, brief, briefCtx.pending, briefCtx.slides?.length])
  const slide = brief?.slide ?? null
  const kicker = slide?.kicker || 'Recap event'
  const primary = brief?.primaryCompany ?? null
  const chartRangeOptions = useMemo(
    () => availablePriceRanges(chartSeries, brief?.chartSeriesDays ?? null),
    [chartSeries, brief?.chartSeriesDays],
  )
  const { pageRef, dockRef, spacerRef } = useCollapseScroll({
    progressVars: exploreEventCollapseProgressVars,
    resetKey: eventId,
    rangeFallback: EXPLORE_EVENT_COLLAPSE_RANGE_FALLBACK,
  })

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

  const openChartCompany = useCallback(() => {
    if (!onCompanyClick) return
    const ticker = String(brief?.chartTicker || primary?.ticker || '')
      .trim()
      .toUpperCase()
    if (!ticker) return
    const company =
      brief?.companies?.find((c) => String(c.ticker ?? '').toUpperCase() === ticker) ?? primary
    onCompanyClick({ ticker, name: company?.name || ticker })
  }, [onCompanyClick, brief?.chartTicker, brief?.companies, primary])

  const heroTicker = primary?.ticker || slide?.ticker || brief?.chartTicker
  const metaBits = [
    primary?.name && primary?.ticker
      ? `${primary.name} (${primary.ticker})`
      : primary?.name || heroTicker,
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
                <div className="exploreEventHeading">
                  <ImageOrInitials src={heroTicker?companyLogoSrc(heroTicker):(brief?.people?.[0]?.name?portraits[normalizeInvestorName(brief.people[0].name)]?.src:null)} fallbackSrc={heroTicker?companyLogoFallback(heroTicker):null} name={heroTicker||brief?.people?.[0]?.name||'Event'} className="exploreEventHeroImage" logo={Boolean(heroTicker)}/>
                  <div><p className="drpt-kicker">{kicker}</p><div className="exploreEventHeroMeta mono">{metaBits.join(', ')}</div></div>
                </div>
                <h1 className="exploreEventTitle">{slide?.headline||'Event brief'}</h1>
              </header>
            </div>
          </div>
        </div>

        <div ref={spacerRef} className="drpt-collapseSpacer" aria-hidden="true" />

        <div className="exploreDirPaper">
          {!brief ? (
            briefCtx.pending ? (
              <SkeletonStatus label="Loading event brief" className="appSkelEvent">
                <span className="appSkel appSkel--title" />
                <span className="appSkel appSkel--sub" />
                <span className="appSkel appSkel--chart" />
              </SkeletonStatus>
            ) : (
            <div className="exploreEventEmpty">
              <p className="exploreEventEmptyLead">This recap event could not be found.</p>
            </div>
            )
          ) : (
            <div className="exploreEventBody">
              <EventFactsSection facts={brief.facts} />

              <EventMarketBlock
                brief={brief}
                slide={slide}
                primary={primary}
                chartSeries={chartSeries}
                chartRange={chartRange}
                onChartRangeChange={setChartRange}
                chartRangeOptions={chartRangeOptions}
                onCompanyClick={onCompanyClick}
                openChartCompany={openChartCompany}
              />

              {(brief.filingRows.length || briefCtx.pending || slide?.memberIds?.length) ? (
                <EventListSection
                  kicker={brief.listLabel || 'In this event'}
                  title={brief.listTitle || 'Filings'}
                  countLabel={
                    brief.filingRows.length ? (brief.listCountLabel ||
                    `${brief.filingRows.length} filing${brief.filingRows.length === 1 ? '' : 's'}`) : null
                  }
                >
                  {!brief.filingRows.length ? (briefCtx.pending ? <SkeletonList count={3} tag="li" /> : <li className="exploreEventFilingsStatus">Filings could not be loaded.</li>) : null}
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


            </div>
          )}
        </div>
      </div>
    </div>
  )
}
