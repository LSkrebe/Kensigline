import { TerminalTopBarActions, TerminalTopBarBrand } from './TerminalTopBarChrome.jsx'

export function DeepCompactChrome({
  backendUp = true,
  macroActive = false,
  onMacroClick,
  settingsActive = false,
  onSettingsClick,
  onBrandClick = null,
  subjectLabel = '',
  price = null,
  priceChange = null,
  priceChangePct = null,
}) {
  const label = String(subjectLabel ?? '').trim()
  const ch = priceChange != null && Number.isFinite(Number(priceChange)) ? Number(priceChange) : null
  const chPct =
    priceChangePct != null && Number.isFinite(Number(priceChangePct)) ? Number(priceChangePct) : null
  const up = ch != null ? ch >= 0 : true
  const showPrice = price != null && Number.isFinite(Number(price))

  const trail =
    label || showPrice ? (
      <div className="deepCompactChromeTrail">
        {label ? <span className="deepCompactChromeSubject mono">{label}</span> : null}
        {showPrice ? (
          <>
            <span className="deepCompactChromePrice mono">${Number(price).toFixed(2)}</span>
            {ch != null && chPct != null ? (
              <span className={['deepCompactChromeChange mono', up ? 'isUp' : 'isDown'].join(' ')}>
                {up ? '+' : ''}
                {ch.toFixed(2)} ({up ? '+' : ''}
                {chPct.toFixed(2)}%)
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    ) : null

  return (
    <div className="deepCompactChrome terminalTopBarChrome">
      <TerminalTopBarBrand logoSrc="/mercerline_mark.png" onBrandClick={onBrandClick} />
      <TerminalTopBarActions
        leading={trail}
        macroActive={macroActive}
        onMacroClick={onMacroClick}
        settingsActive={settingsActive}
        onSettingsClick={onSettingsClick}
        hideDate
      />
    </div>
  )
}
