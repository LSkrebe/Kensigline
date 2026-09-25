import { ImageOrInitials, normalizeInvestorName } from './ExplorePersonRow.jsx'
import {
  exploreHoldingsFor,
  explorePerformerReturn,
  formatExploreTapeReturn,
} from './ExploreWatchlistSection.jsx'
import portraits from './explorePortraits.json'
import { companyLogoFallback, companyLogoSrc } from './localImages.js'
import { IntroReveal } from './IntroReveal.jsx'
import { selectIntroLeaders, useIntroExplorePeople } from './introExplorePeople.js'
import { scrollIntroToPricing } from './introScroll.js'
import { INTRO_LEADERS } from './marketingContent.js'
import './ExplorePage.css'

function HoldingsGrid({ tickers = [] }) {
  const total = tickers.length
  if (!total) return null
  const showOverflow = total > 4
  const visible = showOverflow ? tickers.slice(0, 3) : tickers.slice(0, 4)
  const extra = showOverflow ? total - 3 : 0

  return (
    <span className="lpLeaderHoldings" aria-hidden="true">
      {visible.map((ticker) => (
        <ImageOrInitials
          key={ticker}
          src={companyLogoSrc(ticker)}
          fallbackSrc={companyLogoFallback(ticker)}
          name={ticker}
          className="lpLeaderHolding"
          logo
          discover={false}
        />
      ))}
      {extra > 0 ? <span className="lpLeaderHolding lpLeaderHolding--more">+{extra}</span> : null}
    </span>
  )
}

/** Explore tape rows - wider list with holdings mosaic on the right. */
export function IntroLeadersSection() {
  const { people, range } = useIntroExplorePeople()
  const rows = selectIntroLeaders(people, 6, range)

  return (
    <section id="leaders" className="lpSection lpLeadersSection lpSection--ruled" aria-labelledby="lp-leaders-title">
      <IntroReveal revealKey="leaders-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{INTRO_LEADERS.kicker}</p>
        <h2 id="lp-leaders-title" className="lpSectionTitle">
          {INTRO_LEADERS.title}
        </h2>
        {INTRO_LEADERS.lead ? <p className="lpSectionLead">{INTRO_LEADERS.lead}</p> : null}
      </IntroReveal>

      <IntroReveal revealKey="leaders-list" delay={70} className="lpLeadersTape">
        <ul className="exploreTapeList" aria-label="Top yearly performers">
          {rows.map((row, index) => {
            const portrait = portraits[normalizeInvestorName(row.name)]
            const logo = portrait?.kind === 'logo'
            const thumb = portrait?.thumb || portrait?.src
            const perf = formatExploreTapeReturn(explorePerformerReturn(row, range))
            const holdings = exploreHoldingsFor(row.actorSlug)
            return (
              <li className="exploreTapeRow" key={row.actorSlug || row.id}>
                <button
                  type="button"
                  className="exploreTapeRowBtn lpLeaderRowBtn"
                  aria-label={`${row.name}, see pricing`}
                  onClick={() => scrollIntroToPricing()}
                >
                  <span className="exploreTapeRank">{index + 1}</span>
                  <span className={`exploreTapeAvatar${logo ? ' isLogo' : ''}`}>
                    <ImageOrInitials
                      src={thumb}
                      name={row.name}
                      className="explorePersonPortrait"
                      logo={logo}
                      discover={false}
                    />
                  </span>
                  <span className="exploreTapeCopy">
                    {perf ? <span className={`exploreTapeReturn ${perf.tone}`}>{perf.text}</span> : null}
                    <span className="exploreTapeName">{row.name}</span>
                    <span className="exploreTapeMeta">{row.modeLabel || 'Investor'}</span>
                  </span>
                  <HoldingsGrid tickers={holdings} />
                </button>
              </li>
            )
          })}
        </ul>
      </IntroReveal>
    </section>
  )
}
