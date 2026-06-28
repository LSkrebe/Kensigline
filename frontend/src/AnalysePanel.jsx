export function AnalysePanel({ panelClassName = '' }) {
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
          <div className="analyseMainPanelBody discoverColScroll scrollThin" />
        </div>
      </div>
    </section>
  )
}
