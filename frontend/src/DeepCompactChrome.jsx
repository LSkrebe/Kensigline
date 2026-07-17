import { TerminalTopBarActions, TerminalTopBarBrand } from './TerminalTopBarChrome.jsx'

export function DeepCompactChrome({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  onCloseClick = null,
  subjectLabel = '',
  price = null,
  priceChange = null,
  priceChangePct = null,
}) {
  const label = String(subjectLabel ?? '').trim()
  const ch = priceChange != null && Number.isFinite(Number(priceChange)) ? Number(priceChange) : null
  const chPct =
    priceChangePct != null && Number.isFinite(Number(priceChangePct)) ? Number(priceChangePct) : null
  const up = ch != null ? ch >= 0 : chPct != null ? chPct >= 0 : true
  const showPrice = price != null && Number.isFinite(Number(price))
  const showChange = ch != null && chPct != null
  const showReturnOnly = !showPrice && chPct != null

  const trail =
    label || showPrice || showReturnOnly ? (
      <div className="deepCompactChromeTrail">
        {label ? <span className="deepCompactChromeSubject mono">{label}</span> : null}
        {showPrice ? (
          <>
            <span className="deepCompactChromePrice mono">${Number(price).toFixed(2)}</span>
            {showChange ? (
              <span className={['deepCompactChromeChange mono', up ? 'isUp' : 'isDown'].join(' ')}>
                {up ? '+' : ''}
                {ch.toFixed(2)} ({up ? '+' : ''}
                {chPct.toFixed(2)}%)
              </span>
            ) : null}
          </>
        ) : showReturnOnly ? (
          <span className={['deepCompactChromeChange mono', up ? 'isUp' : 'isDown'].join(' ')}>
            {up ? '+' : ''}
            {chPct.toFixed(2)}%
          </span>
        ) : null}
      </div>
    ) : null

  return (
    <div className="deepCompactChrome terminalTopBarChrome exploreRecapChrome">
      <TerminalTopBarBrand logoSrc="/mercerline_mark.png" onBrandClick={onBrandClick} />
      <TerminalTopBarActions
        leading={trail}
        macroActive={macroActive}
        onMacroClick={onMacroClick}
        settingsActive={settingsActive}
        onSettingsClick={onSettingsClick}
        hideDate
        showClose={!!onCloseClick}
        onCloseClick={onCloseClick}
      />
    </div>
  )
}
