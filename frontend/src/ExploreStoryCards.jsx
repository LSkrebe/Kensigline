import {ImageOrInitials} from './ExplorePersonRow.jsx'
import { companyLogoFallback, companyLogoSrc } from './localImages.js'
import { MiniPriceChart } from './MiniPriceChart.jsx'
import { exploreMoveLabelTone } from './exploreDirectoryTrail.js'

const EXPLORE_STORY_SPARK_W = 120
const EXPLORE_STORY_SPARK_H = 48

function ExploreStoryRow({ slide, onOpenEvent, dateLabel }) {
  const openEvent = () => {
    if (typeof onOpenEvent === 'function') onOpenEvent(slide)
  }
  const hasChart = Array.isArray(slide.priceSeries) && slide.priceSeries.length > 1

  return (
    <li className="exploreStoryRow">
      <button
        type="button"
        className="exploreStoryRowBtn"
        aria-label={`Open event brief: ${slide.headline}`}
        onClick={openEvent}
      >
        <div className="exploreStoryRowCopy">
          <div className="exploreStoryHeading">
            <ImageOrInitials src={slide.ticker?companyLogoSrc(slide.ticker):null} fallbackSrc={slide.ticker?companyLogoFallback(slide.ticker):null} name={slide.ticker||slide.source} className="exploreStoryLogo" logo/>
            <div className="exploreStoryHeadingText">
              <p className="exploreRecapSlideKicker mono">{slide.kicker}</p>
              <span className="exploreStoryRowTitle">{slide.headline}</span>
            </div>
          </div>
          <p className="exploreRecapEventSummary exploreStoryRowSummary">{slide.summary}</p>
          <div className="exploreRecapEventMeta">
            <span className="exploreRecapMetaItem mono">{slide.source}</span>
            {slide.ticker ? <span className="exploreRecapMetaItem mono">{slide.ticker}</span> : null}
            {dateLabel?<time className="exploreRecapMetaItem mono">{dateLabel}</time>:null}
          </div>
        </div>
        {hasChart ? (
          <div className="exploreStoryRowChart" aria-hidden="true">
            <MiniPriceChart
              series={slide.priceSeries}
              label={slide.ticker}
              showMeta={false}
              chartRange="1M"
              trimLeadingPlateau
              hideAxisLabels
              lineOnly
              layoutSize={{ w: EXPLORE_STORY_SPARK_W, h: EXPLORE_STORY_SPARK_H }}
            />
          </div>
        ) : null}
        {slide.moveLabel ? (
          <span
            className={['exploreStoryRowMove', 'exploreDirectoryMove', 'mono', slide.moveLabel.includes('%')?exploreMoveLabelTone(slide.moveLabel, slide.moveUp):'isFlat'].join(' ')}
          >
            {slide.moveLabel}
          </span>
        ) : null}

      </button>
    </li>
  )
}

export function ExploreStoryCards({ slides = [], onOpenEvent = null, sectionKicker = 'Latest', dateLabel = null }) {
  if (!slides.length) return null

  return (
    <section className="exploreStorySection" aria-label="Headlines">
      <header className="exploreStorySectionHead">
        <span className="exploreDirectorySectionHeadCopy">
          <span className="exploreDirectorySectionKicker mono">{sectionKicker}</span>
          <span className="exploreDirectorySectionTitleRow">
            <span className="exploreDirectorySectionTitle">Headlines</span>
          </span>
        </span>
      </header>
      <ul className="exploreStoryList">
        {slides.map((slide) => (
          <ExploreStoryRow key={slide.id} slide={slide} onOpenEvent={onOpenEvent} dateLabel={dateLabel} />
        ))}
      </ul>
    </section>
  )
}
