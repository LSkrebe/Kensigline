const FEED_ROWS = [
  { active: false, nameW: 74, date: '05-28' },
  { active: true, nameW: 68, date: '05-27' },
  { active: false, nameW: 62, date: '05-24' },
  { active: false, nameW: 70, date: '05-21' },
  { active: false, nameW: 58, date: '05-19' },
  { active: false, nameW: 64, date: '05-16' },
  { active: false, nameW: 52, date: '05-14' },
  { active: false, nameW: 66, date: '05-12' },
  { active: false, nameW: 60, date: '05-09' },
  { active: false, nameW: 55, date: '05-07' },
  { active: false, nameW: 72, date: '05-05' },
  { active: false, nameW: 48, date: '05-02' },
  { active: false, nameW: 63, date: '04-30' },
  { active: false, nameW: 57, date: '04-28' },
]

const PAPER_DOCS = [
  { variant: 'doc', source: 'SEC · 8-K' },
  { variant: 'txn', source: 'Form 4' },
  { variant: 'txn', source: 'PTR' },
]

function TeaserGhost({ width = '100%', short, tall }) {
  return (
    <span
      className={[
        'mktTeaserGhost',
        short ? 'mktTeaserGhost--short' : '',
        tall ? 'mktTeaserGhost--tall' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={typeof width === 'number' ? { width: `${width}%` } : { width }}
    />
  )
}

function TeaserPaperDoc({ variant, source }) {
  return (
    <div className="mktTeaserPaperDoc">
      <div className="mktTeaserPaperDocCard">
        <div
          className={[
            'mktTeaserPaperDocRail',
            variant === 'doc' ? 'mktTeaserPaperDocRail--ticker' : 'mktTeaserPaperDocRail--photo',
          ].join(' ')}
        >
          {variant === 'doc' ? (
            <span className="mktTeaserPaperRailTicker">····</span>
          ) : (
            <span className="mktTeaserPaperThumb" aria-hidden="true" />
          )}
        </div>
        <div className="mktTeaserPaperDocMain">
          <div className="mktTeaserPaperDocMeta">
            <span className="mktTeaserPaperDocSource">{source}</span>
            <span className="mktTeaserPaperDocDate">···· ····</span>
          </div>
          {variant === 'doc' ? (
            <>
              <TeaserGhost width="92%" />
              <TeaserGhost width="78%" short />
              <TeaserGhost width="64%" short />
            </>
          ) : (
            <>
              <div className="mktTeaserPaperTxnRow">
                <TeaserGhost width="56%" />
                <TeaserGhost width="28%" short />
              </div>
              <div className="mktTeaserPaperTxnRow">
                <TeaserGhost width="44%" short />
                <TeaserGhost width="22%" short />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Terminal-shaped teaser — same panels and chrome as live UI, no real ticker or filing data. */
export function IntroTerminalPreview({ staticResearch = false }) {
  if (!staticResearch) return null

  return (
    <div className="mktTeaser" aria-hidden="true">
      <div className="mktTeaserShell">
        <header className="mktTeaserTopBar">
          <div className="mktTeaserTopBarStart">
            <div className="mktTeaserBrand">
              <img
                className="mktTeaserLogo"
                src="/mercerline_logo_transparent.png"
                alt=""
                width={22}
                height={22}
                decoding="async"
              />
              <span className="mktTeaserBrandName">MERCERLINE</span>
              <span className="mktTeaserHealth isUp" />
            </div>
          </div>

          <div className="mktTeaserTopBarCenter">
            <div className="mktTeaserIntelSwitch" role="presentation">
              <span className="mktTeaserIntelBtn isActive">Market intelligence</span>
              <span className="mktTeaserIntelSep">|</span>
              <span className="mktTeaserIntelBtn">Clinical intelligence</span>
            </div>
          </div>

          <div className="mktTeaserTopBarEnd">
            <span className="mktTeaserClock mono">····-··-·· ··:··</span>
            <span className="mktTeaserSettingsIcon" aria-hidden="true" />
          </div>
        </header>

        <div className="mktTeaserWorkspace">
          <nav className="mktTeaserSideRail" aria-hidden="true">
            <div className="mktTeaserSideTab isActive">
              <span className="mktTeaserSideTabLabel">RESEARCH</span>
            </div>
            <div className="mktTeaserSideTab">
              <span className="mktTeaserSideTabLabel">DISCOVER</span>
            </div>
            <div className="mktTeaserSideTab">
              <span className="mktTeaserSideTabLabel mktTeaserSideTabLabel--investigate">INVESTIGATE</span>
            </div>
          </nav>

          <div className="mktTeaserGrid">
            <section className="mktTeaserPanel mktTeaserPanel--feed">
              <div className="mktTeaserPanelHead">
                <span className="mktTeaserPanelTitle">FEED</span>
                <div className="mktTeaserPanelHeadEnd">
                  <span className="mktTeaserFilterIcon" aria-hidden="true" />
                  <span className="mktTeaserPanelMeta mono">1/3</span>
                </div>
              </div>

              <div className="mktTeaserFeedSearch">
                <span className="mktTeaserSearchIcon" aria-hidden="true" />
                <span className="mktTeaserSearchPlaceholder">Search events…</span>
              </div>

              <div className="mktTeaserFeedList">
                {FEED_ROWS.map((row) => (
                  <div
                    key={row.date}
                    className={row.active ? 'mktTeaserFeedRow isActive' : 'mktTeaserFeedRow'}
                  >
                    <TeaserGhost width={row.nameW} />
                    <span className="mktTeaserFeedDate mono">{row.date}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mktTeaserPanel mktTeaserPanel--paper">
              <div className="mktTeaserPanelHead mktTeaserPanelHead--paper">
                <span className="mktTeaserPaperTicker">···· · ····</span>
                <div className="mktTeaserPanelHeadEnd">
                  <span className="mktTeaserShotIcon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
                      <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
                    </svg>
                  </span>
                </div>
              </div>

              <div className="mktTeaserPaperBody">
                <div className="mktTeaserPaperHero">
                  <TeaserGhost width="88%" tall />
                  <TeaserGhost width="54%" short />
                </div>

                <div className="mktTeaserPaperDocs">
                  {PAPER_DOCS.slice(0, 2).map((doc) => (
                    <TeaserPaperDoc key={doc.source} {...doc} />
                  ))}

                  <div className="mktTeaserPaperToday">
                    <span className="mktTeaserPaperTodayRule" />
                    <span className="mktTeaserPaperTodayLabel">TODAY</span>
                  </div>

                  <TeaserPaperDoc {...PAPER_DOCS[2]} />
                </div>
              </div>
            </section>

            <section className="mktTeaserPanel mktTeaserPanel--context">
              <div className="mktTeaserPanelHead">
                <span className="mktTeaserPanelTitle">CONTEXT</span>
              </div>

              <div className="mktTeaserContextBody">
                <div className="mktTeaserContextCard">
                  <div className="mktTeaserContextTop">
                    <span className="mktTeaserContextTicker">····</span>
                    <span className="mktTeaserContextPrice">····</span>
                  </div>
                  <TeaserGhost width="72%" short />

                  <div className="mktTeaserChartBlock">
                    <div className="mktTeaserChartRanges">
                      <span className="mktTeaserRangeBtn isActive">1M</span>
                      <span className="mktTeaserRangeBtn">3M</span>
                      <span className="mktTeaserRangeBtn">1Y</span>
                    </div>
                    <svg className="mktTeaserChartSvg" viewBox="0 0 240 96" preserveAspectRatio="none" aria-hidden="true">
                      <defs>
                        <linearGradient id="mktTeaserChartFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(255,255,255,0.14)" />
                          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1="24" x2="240" y2="24" className="mktTeaserChartGrid" />
                      <line x1="0" y1="48" x2="240" y2="48" className="mktTeaserChartGrid" />
                      <line x1="0" y1="72" x2="240" y2="72" className="mktTeaserChartGrid" />
                      <path
                        d="M0 68 C36 62, 48 28, 72 38 S108 58, 132 32 S168 18, 204 42 L240 36 L240 96 L0 96 Z"
                        fill="url(#mktTeaserChartFill)"
                      />
                      <path
                        d="M0 68 C36 62, 48 28, 72 38 S108 58, 132 32 S168 18, 204 42 L240 36"
                        fill="none"
                        className="mktTeaserChartLine"
                      />
                    </svg>
                  </div>

                  <div className="mktTeaserContextEarnings">
                    <span className="mktTeaserContextEarningsK">EARNINGS</span>
                    <span className="mktTeaserContextEarningsV">···· ····</span>
                  </div>
                </div>

                <div className="mktTeaserContextSection">
                  <div className="mktTeaserContextSectionHead">
                    <span className="mktTeaserContextSectionTitle">Fundamentals</span>
                  </div>
                  <div className="mktTeaserFundTable">
                    <div className="mktTeaserFundRow mktTeaserFundRow--head">
                      <span className="mktTeaserFundLabel" />
                      <span className="mktTeaserFundHead">FY24</span>
                      <span className="mktTeaserFundHead">FY25</span>
                      <span className="mktTeaserFundHead">FY26</span>
                      <span className="mktTeaserFundHead">FY27</span>
                    </div>
                    {['Rev growth', 'Gross margin', 'Net margin'].map((label) => (
                      <div key={label} className="mktTeaserFundRow">
                        <span className="mktTeaserFundLabel">{label}</span>
                        <TeaserGhost width="100%" short />
                        <TeaserGhost width="100%" short />
                        <TeaserGhost width="100%" short />
                        <TeaserGhost width="100%" short />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mktTeaserContextSection">
                  <div className="mktTeaserContextSectionHead">
                    <span className="mktTeaserContextSectionTitle">Ownership</span>
                  </div>
                  <div className="mktTeaserOwnership">
                    <div className="mktTeaserOwnershipDonut" aria-hidden="true">
                      <svg viewBox="0 0 126 126">
                        <circle cx="63" cy="63" r="44" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="18" />
                        <circle
                          cx="63"
                          cy="63"
                          r="44"
                          fill="none"
                          stroke="rgba(140,255,195,0.75)"
                          strokeWidth="18"
                          strokeDasharray="55 221"
                          transform="rotate(-90 63 63)"
                        />
                        <circle
                          cx="63"
                          cy="63"
                          r="44"
                          fill="none"
                          stroke="rgba(120,180,255,0.75)"
                          strokeWidth="18"
                          strokeDasharray="42 221"
                          strokeDashoffset="-58"
                          transform="rotate(-90 63 63)"
                        />
                        <circle
                          cx="63"
                          cy="63"
                          r="44"
                          fill="none"
                          stroke="rgba(255,255,255,0.22)"
                          strokeWidth="18"
                          strokeDasharray="124 221"
                          strokeDashoffset="-104"
                          transform="rotate(-90 63 63)"
                        />
                      </svg>
                      <span className="mktTeaserOwnershipDonutCenter">LATEST</span>
                    </div>
                    <ul className="mktTeaserOwnershipLegend">
                      {[
                        { color: 'rgba(140,255,195,0.9)', label: 'Insiders' },
                        { color: 'rgba(120,180,255,0.9)', label: 'Institutions' },
                        { color: 'rgba(255,255,255,0.3)', label: 'Retail' },
                      ].map((row) => (
                        <li key={row.label} className="mktTeaserOwnershipLegendRow">
                          <span className="mktTeaserOwnershipSwatch" style={{ background: row.color }} />
                          <span className="mktTeaserOwnershipLegendLabel">{row.label}</span>
                          <TeaserGhost width={28} short />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="mktTeaserTexture" aria-hidden="true" />
      </div>
    </div>
  )
}
