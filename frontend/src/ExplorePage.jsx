import { useEffect, useRef } from 'react'
import { buildExploreDirectoryMock } from './exploreDirectoryMock.js'
import { ExploreDailyRecap } from './ExploreDailyRecap.jsx'
import { buildExploreDailyRecap } from './exploreRecapMock.js'
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

function actorModeLabel(mode) {
  const m = String(mode ?? '').toLowerCase()
  if (m === 'politicians' || m === 'politician') return 'Politician'
  if (m === 'institutions' || m === 'institution') return 'Institution'
  if (m === 'insider') return 'Insider'
  if (!m) return ''
  return String(mode)
}

function actorDirectoryMeta(row) {
  const txn = String(row.detail ?? '').split(' · ').slice(1).join(' · ').trim()
  const mode = actorModeLabel(row.mode)
  return txn ? `${mode} ${txn}` : mode
}

function ExploreDirectorySection({ title, kicker, children }) {
  return (
    <section className="exploreDirectorySection">
      <header className="exploreDirectorySectionHead">
        <p className="exploreDirectorySectionKicker mono">{kicker}</p>
        <h2 className="exploreDirectorySectionTitle">{title}</h2>
      </header>
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
}) {
  const recap = buildExploreDailyRecap()
  const directory = buildExploreDirectoryMock()
  const pageRef = useRef(null)
  const dockRef = useRef(null)
  const spacerRef = useRef(null)

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
        />
        </div>
        <div ref={spacerRef} className="exploreRecapCollapseSpacer" aria-hidden="true" />
        <div className="explorePageBody">
        <ExploreDirectorySection title="Companies" kicker="Directory">
          <ul className="exploreDirectoryList">
            {directory.companies.map((row) => (
              <li key={row.ticker} className="exploreDirectoryRow exploreDirectoryRow--company">
                <span className="exploreDirectoryTicker mono">{row.ticker}</span>
                <div className="exploreDirectoryCopy">
                  <span className="exploreDirectoryName">{row.name}</span>
                  <span className="exploreDirectoryMeta mono">{row.sector}</span>
                </div>
                <span className={['exploreDirectoryMove mono', row.up ? 'isUp' : 'isDown'].join(' ')}>
                  {row.move}
                </span>
              </li>
            ))}
          </ul>
        </ExploreDirectorySection>

        <ExploreDirectorySection title="Actors" kicker="Directory">
          <ul className="exploreDirectoryList">
            {directory.actors.map((row) => (
              <li key={`${row.name}-${row.ticker}`} className="exploreDirectoryRow exploreDirectoryRow--actor">
                <span className="exploreDirectoryTicker mono">{row.ticker}</span>
                <div className="exploreDirectoryCopy">
                  <span className="exploreDirectoryName">{row.name}</span>
                  <span className="exploreDirectoryMeta mono">{actorDirectoryMeta(row)}</span>
                </div>
                <span className={['exploreDirectoryAmount mono', row.up ? 'isUp' : 'isDown'].join(' ')}>
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
        </ExploreDirectorySection>
        </div>
      </div>
    </div>
  )
}
