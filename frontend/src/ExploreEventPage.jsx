/**
 * Event brief — mid-depth page between Explore recap and full company/investor dossiers.
 * Same dock/paper shell as directory + deep pages; event-scoped body only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveExploreEventBrief } from './exploreEventBrief.js'
import { MiniPriceChart, PRICE_RANGE_OPTS } from './MiniPriceChart.jsx'
import { TerminalTopBarChrome } from './TerminalTopBarChrome.jsx'
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

function EventChartRange({ value, onChange }) {
  return (
    <div className="drpt-chartRange researchPriceRange" role="group" aria-label="Chart range">
      {PRICE_RANGE_OPTS.map((r) => (
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

function EventSection({ label, title, onTitleClick = null, titleOpenLabel = null, children, headExtra = null }) {
  const titleClickable = typeof onTitleClick === 'function' && title
  return (
    <section className="drpt-section">
      {label ? <p className="drpt-sectionLabel">{label}</p> : null}
      {title || headExtra ? (
        <div className="drpt-sectionHead">
          {titleClickable ? (
            <button
              type="button"
              className="exploreEventSectionTitleBtn"
              onClick={onTitleClick}
              aria-label={titleOpenLabel || `Open ${title}`}
            >
              <span className="drpt-sectionTitle">{title}</span>
              <span className="exploreEventSectionChevron mono" aria-hidden="true">
                &gt;
              </span>
            </button>
          ) : title ? (
            <h2 className="drpt-sectionTitle">{title}</h2>
          ) : null}
          {headExtra}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function eventTxnTone(side) {
  if (side === 'buy') return 'buy'
  if (side === 'sell') return 'sell'
  return 'neutral'
}

function EventFilingRow({ row, onCompanyClick, onInvestorClick }) {
  const openInvestor = Boolean(row.actorName && onInvestorClick && !row.openCompany)
  const openCompany = Boolean(row.ticker && onCompanyClick && (row.openCompany || !row.actorName))
  const clickable = openInvestor || openCompany
  const title = row.actorName || row.headline || row.companyName || 'Filing'
  const txnLabel = row.hideTxn
    ? null
    : row.side === 'buy'
      ? 'BUY'
      : row.side === 'sell'
        ? 'SELL'
        : null
  const txnTone = eventTxnTone(row.side)

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

  const Tag = clickable ? 'button' : 'div'

  return (
    <li className="drpt-docItem">
      <Tag
        type={clickable ? 'button' : undefined}
        className={[
          'drpt-docRow',
          'drpt-docRow--flow',
          row.hideTxn ? 'drpt-docRow--flowNoTxn' : '',
          clickable ? 'drpt-docRow--link' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={clickable ? open : undefined}
        aria-label={
          clickable
            ? openInvestor
              ? `Open ${row.actorName} dossier`
              : `Open ${row.ticker} dossier`
            : undefined
        }
      >
        <span className="drpt-docCode">{row.code || '—'}</span>
        <span className="drpt-docMain">
          <span className="drpt-docKind">{title}</span>
        </span>
        {row.hideTxn ? null : txnLabel ? (
          <span className={`drpt-docTxn drpt-docTxn--${txnTone}`}>{txnLabel}</span>
        ) : (
          <span className="drpt-docTxn drpt-docTxn--empty">—</span>
        )}
        <span
          className={[
            'drpt-docAmt',
            row.hideTxn && row.moveLabel ? (row.moveUp ? 'isUp' : 'isDown') : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {row.amountLabel || row.moveLabel || '—'}
        </span>
        <time className="drpt-docDate">{row.dateLabel || '—'}</time>
      </Tag>
    </li>
  )
}

function EventCompanyRow({ company, onCompanyClick }) {
  const ticker = company.ticker
  const canOpen = Boolean(onCompanyClick && ticker)
  const Tag = canOpen ? 'button' : 'div'
  const moveLabel =
    company.dayMovePct != null && Number.isFinite(company.dayMovePct)
      ? `${company.dayMovePct >= 0 ? '+' : ''}${company.dayMovePct.toFixed(1)}%`
      : '—'

  return (
    <li className="drpt-docItem">
      <Tag
        type={canOpen ? 'button' : undefined}
        className={[
          'drpt-docRow',
          'drpt-docRow--flow',
          'drpt-docRow--flowNoTxn',
          canOpen ? 'drpt-docRow--link' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={
          canOpen ? () => onCompanyClick({ ticker, name: company.name }) : undefined
        }
        aria-label={canOpen ? `Open ${ticker} dossier` : undefined}
      >
        <span className="drpt-docCode">{ticker}</span>
        <span className="drpt-docMain">
          <span className="drpt-docKind">{company.name || ticker}</span>
        </span>
        <span className="drpt-docAmt">{moveLabel}</span>
        <time className="drpt-docDate">Today</time>
      </Tag>
    </li>
  )
}

export function ExploreEventPage({
  eventId = null,
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  onCompanyClick = null,
  onInvestorClick = null,
}) {
  const brief = useMemo(() => resolveExploreEventBrief(eventId), [eventId])
  const slide = brief?.slide ?? null
  const title = slide?.headline || 'Event brief'
  const kicker = slide?.kicker || 'Recap event'
  const primary = brief?.primaryCompany ?? null
  const [chartRange, setChartRange] = useState('6M')
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)

  useEffect(() => {
    setChartRange('6M')
  }, [eventId])

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

  const metaBits = [brief?.catalog?.title, slide?.source, primary?.ticker].filter(Boolean)

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
                collapsibleSearch
                showSearch
                showClose={!!onCloseClick}
                onCloseClick={onCloseClick}
                searchPlaceholder="Search company, investor"
                searchPlaceholderMobile="Search"
              />
            </div>
            <div className="drpt-expanded">
              <header className={['drpt-topbar', metaBits.length ? '' : 'drpt-topbar--noMeta'].filter(Boolean).join(' ')}>
                <div className="drpt-topbarIdentity">
                  <p className="drpt-kicker">{kicker}</p>
                  <div className="drpt-topbarTitleRow">
                    <h1 className="drpt-topbarTicker">{title}</h1>
                  </div>
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
            <div className="exploreEventBrief">
              <div className="drpt-row--market">
                <EventSection
                  label="Market"
                  title={primary?.ticker || 'Price'}
                  onTitleClick={primary && onCompanyClick ? openPrimaryCompany : null}
                  titleOpenLabel={primary ? `Open ${primary.ticker} dossier` : null}
                  headExtra={
                    brief.chartSeries?.length ? (
                      <EventChartRange value={chartRange} onChange={setChartRange} />
                    ) : null
                  }
                >
                  {brief.chartSeries?.length ? (
                    <div className="drpt-figure drpt-figure--chart">
                      <MiniPriceChart
                        series={brief.chartSeries}
                        label={brief.chartTicker || 'PRICE'}
                        showMeta={false}
                        chartRange={chartRange}
                        onChartRangeChange={setChartRange}
                        trimLeadingPlateau
                        hideAxisLabels
                        flushEdges
                        showHoverTooltip
                      />
                    </div>
                  ) : (
                    <p className="exploreEventEmptyLead">No price series for this event.</p>
                  )}
                </EventSection>

                <EventSection label="Snapshot" title="Event facts">
                  <div className="drpt-metricGrid">
                    {brief.facts.map((fact) => (
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
                        {fact.period ? (
                          <span className="drpt-metricPeriod">{fact.period}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </EventSection>
              </div>

              {brief.filingRows.length ? (
                <EventSection
                  label={brief.listLabel || 'In this event'}
                  title={brief.listTitle || 'Filings'}
                  headExtra={
                    <span className="drpt-sectionCount">
                      {brief.listCountLabel ||
                        `${brief.filingRows.length} filing${brief.filingRows.length === 1 ? '' : 's'}`}
                    </span>
                  }
                >
                  <div className="drpt-docPanel">
                    <ol className="drpt-docList">
                      {brief.filingRows.map((row) => (
                        <EventFilingRow
                          key={row.id}
                          row={row}
                          onCompanyClick={onCompanyClick}
                          onInvestorClick={onInvestorClick}
                        />
                      ))}
                    </ol>
                  </div>
                </EventSection>
              ) : null}

              {!brief.hideCompaniesSection && brief.companies.length > 1 ? (
                <EventSection
                  label="Also involved"
                  title="Companies"
                  headExtra={
                    <span className="drpt-sectionCount">
                      {brief.companies.length} companies
                    </span>
                  }
                >
                  <div className="drpt-docPanel">
                    <ol className="drpt-docList">
                      {brief.companies.map((co) => (
                        <EventCompanyRow
                          key={co.ticker}
                          company={co}
                          onCompanyClick={onCompanyClick}
                        />
                      ))}
                    </ol>
                  </div>
                </EventSection>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
