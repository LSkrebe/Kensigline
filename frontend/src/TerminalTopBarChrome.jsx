import { useEffect, useState } from 'react'

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

export function TerminalTopBarBrand({ backendUp = true, logoSrc = '/mercerline_logo.png' }) {
  return (
    <div className="terminalTopBarBrand">
      <img
        className="terminalTopBarLogo"
        src={logoSrc}
        alt=""
        decoding="async"
      />
      <span className="terminalTopBarName">MERCERLINE</span>
      <span
        className={backendUp ? 'terminalTopBarHealth isUp' : 'terminalTopBarHealth isDown'}
        title={backendUp ? 'API connected' : 'API offline'}
        aria-label={backendUp ? 'Backend up' : 'Backend down'}
      />
    </div>
  )
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
}) {
  const now = useTerminalTopBarClock(clockAt)
  const dateLabel = shortDate ? formatTerminalTopBarDateLabelShort(now) : formatTerminalTopBarDateLabel(now)

  return (
    <div className="terminalTopBarActions">
      {showSearch ? (
        <label className="exploreRecapCompactSearch">
          <input
            className="exploreRecapCompactSearchInput"
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            spellCheck={false}
            autoComplete="off"
          />
          <svg className="exploreRecapCompactSearchIcon" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <path d="M16 16 L20 20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </label>
      ) : null}
      {!showSearch && !hideDate ? (
        <time className="terminalTopBarDate mono" dateTime={formatTerminalTopBarDateTimeAttr(now)}>
          {dateLabel}
        </time>
      ) : null}
      <div className="terminalTopBarIconGroup">
        <button
          type="button"
          className={macroActive ? 'terminalTopBarIconBtn isActive isClose' : 'terminalTopBarIconBtn'}
          aria-label={macroActive ? 'Close macro calendar' : 'Macro calendar'}
          aria-current={macroActive ? 'page' : undefined}
          onClick={onMacroClick}
        >
          {macroActive ? (
            <svg className="terminalTopBarIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.89a1 1 0 0 0 1.42-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.42z"
              />
            </svg>
          ) : (
            <svg className="terminalTopBarIcon terminalTopBarIcon--calendar" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 3v2M17 3v2M5.5 8.5h13M6 6h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 6z"
              />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={settingsActive ? 'terminalTopBarIconBtn isActive isClose' : 'terminalTopBarIconBtn'}
          aria-label={settingsActive ? 'Close settings' : 'Settings'}
          aria-current={settingsActive ? 'page' : undefined}
          onClick={onSettingsClick}
        >
          {settingsActive ? (
            <svg className="terminalTopBarIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.89 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.89a1 1 0 0 0 1.42-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.42z"
              />
            </svg>
          ) : (
            <svg className="terminalTopBarIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.12.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.81a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.3.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.12-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
              />
            </svg>
          )}
        </button>
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
  logoSrc = '/mercerline_logo.png',
  className = '',
}) {
  return (
    <div className={['terminalTopBarChrome', className].filter(Boolean).join(' ')}>
      <TerminalTopBarBrand backendUp={backendUp} logoSrc={logoSrc} />
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
      />
    </div>
  )
}
