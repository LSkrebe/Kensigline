export function AnalysePanel({
  panelClassName = '',
  ticker,
  price = null,
  sector,
  domicile = null,
  mcap,
  earnings = null,
  children = null,
}) {
  const t = String(ticker ?? '').trim().toUpperCase()
  const showPrice = price != null && Number.isFinite(Number(price))

  return (
    <section
      className={['panel', 'discoverCol', 'feed', 'feedCompact', 'analyseMainPanel', panelClassName]
        .filter(Boolean)
        .join(' ')}
      aria-label="Analyse"
    >
      <header className="feedCompactHeader">
        <div className="panelTitle feedCompactTitle">ANALYSE</div>
      </header>
      <div className="feedCompactBody discoverColBody">
        <div className="feedCompactMain">
          <div className="analyseMainPanelBody discoverColScroll scrollThin">
            <div className="analyseCompanyBlock">
              <div className="contextCompanyCard" aria-label="Company snapshot">
                <div
                  className={[
                    'contextCompanyTopRow',
                    showPrice ? '' : 'contextCompanyTopRow--tickerOnly',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="contextCompanyTicker">{t || '—'}</div>
                  {showPrice ? (
                    <div className="contextCompanyPrice">${Number(price).toFixed(2)}</div>
                  ) : null}
                </div>
                {sector ? <div className="contextCompanyMeta">{sector}</div> : null}
                {domicile ? (
                  <div className="contextCompanyMeta contextCompanyMeta--domicile">{domicile}</div>
                ) : null}
                {mcap ? <div className="contextCompanyMeta">{mcap}</div> : null}
                {earnings ? (
                  <div
                    className={[
                      'contextCompanyEarnings',
                      earnings.soon ? 'contextCompanyEarnings--soon' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="contextCompanyEarningsK">EARNINGS</span>
                    <span className="contextCompanyEarningsV">{earnings.label}</span>
                  </div>
                ) : null}
              </div>
              <div className="analysePriceChart contextCompanyChart" aria-label="Price chart">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
