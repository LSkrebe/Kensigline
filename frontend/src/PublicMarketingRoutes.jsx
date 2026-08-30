import { useEffect } from 'react'
import { LearnIndexPage } from './LearnIndexPage.jsx'
import { LearnLessonPage } from './LearnLessonPage.jsx'
import { ResearchEventPage } from './ResearchEventPage.jsx'
import { ResearchIndexPage } from './ResearchIndexPage.jsx'
import { ResearchTickerPage } from './ResearchTickerPage.jsx'
import {
  isLearnIndexPath,
  isResearchIndexPath,
  matchLearnLessonPath,
  matchLegacyCompanyPath,
  matchResearchEventPath,
  matchResearchTickerPath,
} from './publicRoutes.js'
import { navigateMarketing } from './marketingRoute.js'

/** Public indexable pages — Learn, Research, legacy company redirects. */
export function PublicMarketingRoutes({ path }) {
  const normalized = String(path ?? '/').replace(/\/$/, '') || '/'
  const legacyCompany = matchLegacyCompanyPath(normalized)

  useEffect(() => {
    if (!legacyCompany) return
    const next = `/research/ticker/${legacyCompany.ticker}`
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', next)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } else {
      navigateMarketing(next)
    }
  }, [legacyCompany])

  if (legacyCompany) return <ResearchTickerPage ticker={legacyCompany.ticker} />

  const learnLesson = matchLearnLessonPath(normalized)
  const researchEvent = matchResearchEventPath(normalized)
  const researchTicker = matchResearchTickerPath(normalized)

  if (isLearnIndexPath(normalized)) return <LearnIndexPage />
  if (learnLesson) return <LearnLessonPage slug={learnLesson.slug} />
  if (isResearchIndexPath(normalized)) return <ResearchIndexPage />
  if (researchEvent) return <ResearchEventPage dayKey={researchEvent.dayKey} />
  if (researchTicker) return <ResearchTickerPage ticker={researchTicker.ticker} />

  return null
}

export function isPublicMarketingPath(path) {
  const normalized = String(path ?? '/').replace(/\/$/, '') || '/'
  return (
    Boolean(matchLegacyCompanyPath(normalized)) ||
    isLearnIndexPath(normalized) ||
    Boolean(matchLearnLessonPath(normalized)) ||
    isResearchIndexPath(normalized) ||
    Boolean(matchResearchEventPath(normalized)) ||
    Boolean(matchResearchTickerPath(normalized))
  )
}
