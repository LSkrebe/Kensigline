import { useCallback, useEffect, useRef } from 'react'
import { buildExploreDirectoryHomePreview } from './exploreDirectoryMock.js'
import { ExploreDirectoryCompanyRow, ExploreDirectoryInvestorRow } from './ExploreDirectoryRows.jsx'
import { ExploreDailyRecap } from './ExploreDailyRecap.jsx'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
import { navigateExploreCompanies, navigateExploreEventDetail, navigateExploreInvestors } from './terminalRoute.js'
import './ExplorePage.css'

const COLLAPSE_RANGE_FALLBACK = 1
/** Scroll progress (0–1) at which recap hero / expanded bg finishes fading. */
const EXPLORE_EXPANDED_FADE_END = 0.88
/** Strip bg_2 fades in from the start of collapse through 100% scroll. */
const EXPLORE_COMPACT_FADE_START = 0

function collapseProgressVars(progress) {
  const p = Math.min(1, Math.max(0, progress))
  const expandedOpacity = p <= EXPLORE_EXPANDED_FADE_END ? 1 - p / EXPLORE_EXPANDED_FADE_END : 0
  const compactOpacity =
    p <= EXPLORE_COMPACT_FADE_START
      ? 0
      : (p - EXPLORE_COMPACT_FADE_START) / (1 - EXPLORE_COMPACT_FADE_START)
  return {
    '--explore-collapse': String(p),
    '--explore-expanded-opacity': String(expandedOpacity),
    '--explore-compact-opacity': String(compactOpacity),
  }
}

function ExploreDirectorySection({ title, kicker, onOpen, children }) {
  return (
    <section className="exploreDirectorySection">
      <button
        type="button"
        className="exploreDirectorySectionHead"
        aria-label={`Open ${title}`}
        onClick={onOpen}
      >
        <span className="exploreDirectorySectionHeadCopy">
          <span className="exploreDirectorySectionKicker mono">{kicker}</span>
          <span className="exploreDirectorySectionTitleRow">
            <span className="exploreDirectorySectionTitle">{title}</span>
            <span className="exploreDirectorySectionChevron mono" aria-hidden="true">
              &gt;
            </span>
          </span>
        </span>
      </button>
      {children}
    </section>
  )
}

export function ExplorePage({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCompanyRowClick = null,
  onInvestorRowClick = null,
  onEventClick = null,
}) {
  const recap = buildExploreDailyRecap()
  const directoryPreview = buildExploreDirectoryHomePreview()
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)

  const openRecapEvent = useCallback(
    (slide) => {
      if (typeof onEventClick === 'function') {
        onEventClick(slide)
        return
      }
      if (slide?.id) navigateExploreEventDetail(slide.id)
    },
    [onEventClick],
  )

  const requestRecapCollapse = useCallback(() => {
    const page = pageRef.current
    const spacer = spacerRef.current
    if (!page || !spacer) return
    page.scrollTo({ top: spacer.offsetHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const page = pageRef.current
    const dock = dockRef.current
    const spacer = spacerRef.current
    if (!page || !dock) return undefined

    let raf = 0

    const syncCollapse = () => {
      raf = 0
      const range = spacer?.offsetHeight || COLLAPSE_RANGE_FALLBACK
      const progress = Math.min(1, Math.max(0, page.scrollTop / range))
      for (const [key, value] of Object.entries(collapseProgressVars(progress))) {
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
  }, [])

  return (
    <div className="explorePage" ref={pageRef}>
      <div className="exploreRecapStickWrap">
        <div ref={dockRef} className="exploreRecapDock">
          <ExploreDailyRecap
            recap={recap}
            backendUp={backendUp}
            macroActive={macroActive}
            onMacroClick={onMacroClick}
            settingsActive={settingsActive}
            onSettingsClick={onSettingsClick}
            onBrandClick={onBrandClick}
            onRequestCollapse={requestRecapCollapse}
            onOpenEvent={openRecapEvent}
          />
        </div>
        <div ref={spacerRef} className="exploreRecapCollapseSpacer" aria-hidden="true" />
        <div className="explorePageBody">
        <ExploreDirectorySection
          title="Investors"
          kicker="Latest"
          onOpen={() => navigateExploreInvestors()}
        >
          <ul className="exploreDirectoryList">
            {directoryPreview.investors.map((row) => (
              <ExploreDirectoryInvestorRow key={row.id} row={row} onClick={onInvestorRowClick} />
            ))}
          </ul>
        </ExploreDirectorySection>

        <ExploreDirectorySection
          title="Companies"
          kicker="Latest"
          onOpen={() => navigateExploreCompanies()}
        >
          <ul className="exploreDirectoryList">
            {directoryPreview.companies.map((row) => (
              <ExploreDirectoryCompanyRow key={row.id} row={row} onClick={onCompanyRowClick} />
            ))}
          </ul>
        </ExploreDirectorySection>
        </div>
      </div>
    </div>
  )
}
