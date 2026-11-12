import { useId, useState } from 'react'
import { ImageOrInitials, normalizeInvestorName } from './ExplorePersonRow.jsx'
import {
  explorePerformerReturn,
  formatExploreTapeReturn,
} from './ExploreWatchlistSection.jsx'
import portraits from './explorePortraits.json'
import { IntroReveal } from './IntroReveal.jsx'
import { selectIntroCoverage, useIntroExplorePeople } from './introExplorePeople.js'
import { scrollIntroToPricing } from './introScroll.js'
import { INTRO_COVERAGE } from './marketingContent.js'

function CoverageFace({ row, range, active, onActivate, onDeactivate }) {
  const panelId = useId()
  const portrait = portraits[normalizeInvestorName(row.name)]
  const logo = portrait?.kind === 'logo'
  const thumb = portrait?.thumb || portrait?.src
  const perf = formatExploreTapeReturn(explorePerformerReturn(row, range))
  const open = active === row.actorSlug

  return (
    <button
      type="button"
      className={['lpCoverageFace', open ? 'isActive' : '', logo ? 'isLogo' : ''].filter(Boolean).join(' ')}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`${row.name}${perf ? `, ${perf.text}` : ''}, see pricing`}
      onMouseEnter={() => onActivate(row.actorSlug)}
      onMouseLeave={onDeactivate}
      onFocus={() => onActivate(row.actorSlug)}
      onBlur={onDeactivate}
      onClick={() => scrollIntroToPricing()}
    >
      <ImageOrInitials src={thumb} name={row.name} className="lpCoverageFaceImg" logo={logo} discover={false} />
      <span
        id={panelId}
        className={['lpCoverageTip', open ? 'isOpen' : ''].filter(Boolean).join(' ')}
        role="tooltip"
      >
        <span className="lpCoverageTipName">{row.name}</span>
        {perf ? <span className={`lpCoverageTipPnl ${perf.tone}`}>{perf.text}</span> : null}
      </span>
    </button>
  )
}

/** Face grid - hover/focus reveals name + yearly PnL. */
export function IntroCoverageSection() {
  const { people, loading, range } = useIntroExplorePeople()
  const columns = selectIntroCoverage(people, 4, range)
  const hasFaces = columns.some((col) => col.faces?.length)
  const pending = loading || !hasFaces
  const [active, setActive] = useState(null)

  return (
    <section id="coverage" className="lpSection lpCoverageSection" aria-labelledby="lp-coverage-title">
      <IntroReveal revealKey="coverage-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{INTRO_COVERAGE.kicker}</p>
        <h2 id="lp-coverage-title" className="lpSectionTitle">
          {INTRO_COVERAGE.title}
        </h2>
        {INTRO_COVERAGE.lead ? <p className="lpSectionLead">{INTRO_COVERAGE.lead}</p> : null}
      </IntroReveal>

      <IntroReveal revealKey="coverage-grid" delay={70}>
        <div className="lpCoverageGrid" aria-busy={pending || undefined}>
          {(pending
            ? [
                { id: 'politicians', label: 'Politicians' },
                { id: 'insiders', label: 'Insiders' },
                { id: 'institutions', label: 'Funds' },
              ]
            : columns
          ).map((col) => (
            <div className="lpCoverageCol" key={col.id}>
              <div className="lpCoverageFaces">
                {pending
                  ? Array.from({ length: 4 }, (_, index) => (
                      <span
                        key={`${col.id}-skel-${index}`}
                        className="lpCoverageFace lpCoverageFace--skel"
                        aria-hidden="true"
                      >
                        <span className="lpStoryPlaceholderBar lpCoverageFaceSkel" />
                      </span>
                    ))
                  : col.faces.map((face) => (
                      <CoverageFace
                        key={face.actorSlug || face.id}
                        row={face}
                        range={range}
                        active={active}
                        onActivate={setActive}
                        onDeactivate={() => setActive(null)}
                      />
                    ))}
              </div>
              <p className="lpCoverageColLabel">{col.label}</p>
            </div>
          ))}
        </div>
      </IntroReveal>
    </section>
  )
}
