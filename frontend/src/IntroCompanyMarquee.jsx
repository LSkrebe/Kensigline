import { INTRO_TRACKED_COMPANIES, introCompanyLogoSrc } from './marketingContent.js'

/** Repeat logo sets so wide viewports never show empty track during the loop. */
const MARQUEE_COPIES = 6

function buildMarqueeLoop(tickers) {
  return Array.from({ length: MARQUEE_COPIES }, () => tickers).flat()
}

export function MarqueeRow({ tickers, reverse = false }) {
  const loop = buildMarqueeLoop(tickers)
  return (
    <div className="lpMarqueeRow">
      <div
        className={['lpMarqueeTrack', reverse ? 'lpMarqueeTrack--reverse' : ''].filter(Boolean).join(' ')}
        style={{ '--lp-marquee-copies': MARQUEE_COPIES }}
        aria-hidden="true"
      >
        {loop.map((company, i) => (
          <span className="lpMarqueeItem" key={`${company.ticker}-${i}`}>
            <img
              className="lpMarqueeLogo"
              src={introCompanyLogoSrc(company.ticker)}
              alt={company.name}
              width={28}
              height={28}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

/** Dual slow marquees of recognizable tracked company logos (intro validation strip). */
export function IntroCompanyMarquee({ embedded = false }) {
  const { rowA, rowB } = INTRO_TRACKED_COMPANIES
  return (
    <section
      className={['lpCompanyMarquee', embedded ? 'lpCompanyMarquee--embedded' : ''].filter(Boolean).join(' ')}
      aria-label="Companies we track"
    >
      <div className="lpCompanyMarqueeInner">
        <MarqueeRow tickers={rowA} />
        <MarqueeRow tickers={rowB} reverse />
      </div>
    </section>
  )
}
