import { useEffect, useRef, useState } from 'react'

const COMPACT_SEARCH_MQ = '(max-width: 640px)'
const EXPLORE_COLLAPSIBLE_SEARCH_MQ = '(max-width: 960px)'

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

function useCompactSearchLayout() {
  return useMediaQuery(COMPACT_SEARCH_MQ)
}

function useExploreCollapsibleSearchLayout() {
  return useMediaQuery(EXPLORE_COLLAPSIBLE_SEARCH_MQ)
}

function ExploreSearchIcon() {
  return (
    <svg className="terminalTopBarIcon exploreRecapSearchToggleIcon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M14.5 14.5 L19 19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
    </svg>
  )
}

function formatHhMmLocal(d) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatTerminalTopBarDateTimeAttr(d = new Date()) {
  return d.toISOString()
}

function formatTerminalTopBarDateLabel(d = new Date()) {
  const date = d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  return `${date}, ${formatHhMmLocal(d)}`
}

function formatTerminalTopBarDateLabelShort(d = new Date()) {
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return `${date}, ${formatHhMmLocal(d)}`
}

function useTerminalTopBarClock(clockAt = null) {
  const frozenMs = clockAt != null ? new Date(clockAt).getTime() : null
  const [now, setNow] = useState(() => (Number.isFinite(frozenMs) ? new Date(frozenMs) : new Date()))

  useEffect(() => {
    if (Number.isFinite(frozenMs)) {
      setNow(new Date(frozenMs))
      return undefined
    }
    const tick = () => setNow(new Date())
    const msToNextMinute = 60000 - (Date.now() % 60000)
    let intervalId = 0
    const startId = window.setTimeout(() => {
      tick()
      intervalId = window.setInterval(tick, 60000)
    }, msToNextMinute)
    return () => {
      window.clearTimeout(startId)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [frozenMs])

  return now
}

export function TerminalTopBarBrand({ logoSrc = '/mercerline_logo.png', onBrandClick = null }) {
  const content = (
    <>
      <span className="terminalTopBarLogoClip">
        <img
          className="terminalTopBarLogo"
          src={logoSrc}
          alt=""
          decoding="async"
        />
      </span>
      <span className="terminalTopBarName">MERCERLINE</span>
    </>
  )

  if (onBrandClick) {
    return (
      <button
        type="button"
        className="terminalTopBarBrand"
        onClick={onBrandClick}
        aria-label="Explore home"
      >
        {content}
      </button>
    )
  }

  return <div className="terminalTopBarBrand">{content}</div>
}

export function TerminalTopBarActions({
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  clockAt = null,
  hideDate = false,
  shortDate = false,
  showSearch = false,
  searchPlaceholder = 'Search',
  searchPlaceholderMobile = null,
  leading = null,
  hideMacro = false,
  hideSettings = false,
  macroCloseClassName = '',
  macroCloseAriaLabel = null,
  collapsibleSearch = false,
}) {
  const now = useTerminalTopBarClock(clockAt)
  const compactSearch = useCompactSearchLayout()
  const collapsibleSearchLayout = useExploreCollapsibleSearchLayout()
  const useCollapsibleSearch = collapsibleSearch && collapsibleSearchLayout
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef(null)
  const dateLabel = shortDate ? formatTerminalTopBarDateLabelShort(now) : formatTerminalTopBarDateLabel(now)
  const activeSearchPlaceholder = compactSearch
    ? (searchPlaceholderMobile ?? searchPlaceholder)
    : searchPlaceholder

  useEffect(() => {
    if (!useCollapsibleSearch) setSearchOpen(false)
  }, [useCollapsibleSearch])

  useEffect(() => {
    if (macroActive || settingsActive) setSearchOpen(false)
  }, [macroActive, settingsActive])

  useEffect(() => {
    if (!searchOpen) return undefined
    const input = searchInputRef.current
    if (input) input.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen])

  const showSearchField = showSearch && (!useCollapsibleSearch || searchOpen)
  const showSearchToggle = showSearch && useCollapsibleSearch && !searchOpen

  return (
    <div
      className={[
        'terminalTopBarActions',
        useCollapsibleSearch ? 'terminalTopBarActions--collapsibleSearch' : '',
        useCollapsibleSearch && searchOpen ? 'terminalTopBarActions--searchOpen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showSearchToggle ? (
        <button
          type="button"
          className="terminalTopBarIconBtn exploreRecapSearchToggleBtn"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <ExploreSearchIcon />
        </button>
      ) : null}
      {showSearchField ? (
        <label className="exploreRecapCompactSearch">
          <input
            ref={searchInputRef}
            className="exploreRecapCompactSearchInput"
            type="search"
            placeholder={activeSearchPlaceholder}
            aria-label={activeSearchPlaceholder}
            spellCheck={false}
            autoComplete="off"
          />
          {useCollapsibleSearch && searchOpen ? (
            <button
              type="button"
              className="exploreRecapCompactSearchTrailBtn"
              aria-label="Close search"
              onClick={() => setSearchOpen(false)}
            >
              <svg className="exploreRecapCompactSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="square"
                  d="M7 7l10 10M17 7L7 17"
                />
              </svg>
            </button>
          ) : (
            <svg className="exploreRecapCompactSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
              <path
                d="M14.5 14.5 L19 19"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
              />
            </svg>
          )}
        </label>
      ) : null}
      {!showSearch && !hideDate ? (
        <time className="terminalTopBarDate mono" dateTime={formatTerminalTopBarDateTimeAttr(now)}>
          {dateLabel}
        </time>
      ) : null}
      {leading}
      <div className="terminalTopBarIconGroup">
        {!hideMacro ? (
          <button
            type="button"
            className={[
              macroActive ? 'terminalTopBarIconBtn isClose' : 'terminalTopBarIconBtn',
              macroActive && macroCloseClassName ? macroCloseClassName : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={
              macroActive
                ? (macroCloseAriaLabel ?? 'Close macro calendar')
                : 'Macro calendar'
            }
            aria-current={macroActive ? 'page' : undefined}
            onClick={onMacroClick}
          >
            {macroActive ? (
              <svg className="terminalTopBarIcon terminalTopBarIcon--close" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="square"
                  d="M7 7l10 10M17 7L7 17"
                />
              </svg>
            ) : (
              <svg className="terminalTopBarIcon terminalTopBarIcon--macro" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="1.5" d="M5 5h14v16H5z" />
                <path stroke="currentColor" strokeWidth="1.5" d="M5 9h14" />
                <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" d="M9 3v4M15 3v4" />
                <rect x="8" y="12" width="3" height="3" fill="currentColor" />
                <rect x="13" y="12" width="3" height="3" fill="currentColor" opacity="0.45" />
              </svg>
            )}
          </button>
        ) : null}
        {!hideSettings ? (
          <button
            type="button"
            className={settingsActive ? 'terminalTopBarIconBtn isClose' : 'terminalTopBarIconBtn'}
            aria-label={settingsActive ? 'Close settings' : 'Settings'}
            aria-current={settingsActive ? 'page' : undefined}
            onClick={onSettingsClick}
          >
            {settingsActive ? (
              <svg className="terminalTopBarIcon terminalTopBarIcon--close" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="square"
                  d="M7 7l10 10M17 7L7 17"
                />
              </svg>
            ) : (
              <svg className="terminalTopBarIcon terminalTopBarIcon--settings" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                  d="M4 7h12M4 12h16M4 17h9"
                />
                <circle cx="18" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="14" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="17" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function TerminalTopBarChrome({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  clockAt = null,
  hideDate = false,
  shortDate = false,
  showSearch = false,
  searchPlaceholder = 'Search',
  searchPlaceholderMobile = null,
  logoSrc = '/mercerline_logo.png',
  className = '',
  hideMacro = false,
  hideSettings = false,
  leading = null,
  macroCloseClassName = '',
  macroCloseAriaLabel = null,
  onBrandClick = null,
  collapsibleSearch = false,
}) {
  return (
    <div className={['terminalTopBarChrome', className].filter(Boolean).join(' ')}>
      <TerminalTopBarBrand logoSrc={logoSrc} onBrandClick={onBrandClick} />
      <TerminalTopBarActions
        macroActive={macroActive}
        onMacroClick={onMacroClick}
        settingsActive={settingsActive}
        onSettingsClick={onSettingsClick}
        clockAt={clockAt}
        hideDate={hideDate}
        shortDate={shortDate}
        showSearch={showSearch}
        searchPlaceholder={searchPlaceholder}
        searchPlaceholderMobile={searchPlaceholderMobile}
        hideMacro={hideMacro}
        hideSettings={hideSettings}
        leading={leading}
        macroCloseClassName={macroCloseClassName}
        macroCloseAriaLabel={macroCloseAriaLabel}
        collapsibleSearch={collapsibleSearch}
      />
    </div>
  )
}
