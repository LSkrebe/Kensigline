import { useEffect, useState } from 'react'
import { fetchExplorePerformance } from './exploreApi.js'
import { ORIGIN_STORY } from './marketingContent.js'
import { formatSignedPct, IntroStoryDiagram, IntroStoryLegend } from './IntroStoryChart.jsx'
import { IntroReveal } from './IntroReveal.jsx'

let windowCache = null
let windowPromise = null

function loadWindow() {
  if (windowPromise) return windowPromise
  windowPromise = fetchExplorePerformance(true)
    .then((data) => {
      const points = data?.window?.points
      windowCache = Array.isArray(points) && points.length >= 2 ? points : null
      return windowCache
    })
    .catch(() => {
      windowCache = null
      return null
    })
  return windowPromise
}

/** Past-month investors vs the S&P. Same cohort snapshot the leaderboard reads. */
export function IntroStorySection() {
  const [points, setPoints] = useState(windowCache)

  useEffect(() => {
    let cancelled = false
    if (windowCache) {
      setPoints(windowCache)
      return undefined
    }
    void loadWindow().then((next) => {
      if (!cancelled) setPoints(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const last = points?.[points.length - 1]
  const move = formatSignedPct(last?.investors)
  const title = move ? `${move} this past month` : ORIGIN_STORY.title

  return (
    <section id="story" className="lpStory" aria-labelledby="lp-story-title">
      <IntroReveal revealKey="story-head" className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">{ORIGIN_STORY.kicker}</p>
        <h2 id="lp-story-title" className="lpSectionTitle">
          {title}
        </h2>
        {move ? <IntroStoryLegend investorGain={move} marketGain={formatSignedPct(last?.spy)} /> : null}
      </IntroReveal>

      <IntroReveal revealKey="story-chart" delay={80}>
        <IntroStoryDiagram points={points} />
      </IntroReveal>
    </section>
  )
}
