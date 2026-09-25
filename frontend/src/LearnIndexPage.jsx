import { useEffect } from 'react'
import { LEARN_LESSONS } from './learn/learnContent.js'
import { PublicContentCta, PublicContentLayout } from './PublicContentLayout.jsx'
import { LEARN_INDEX_META } from './publicRoutes.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'

export function LearnIndexPage() {
  useEffect(() => {
    applyPageMeta(LEARN_INDEX_META)
    markAppReady()
  }, [])

  return (
    <PublicContentLayout backgroundKey="signIn">
      <div className="pubContentHero">
        <p className="lpEyebrow">Learn</p>
        <h1 className="pubContentTitle">How filings work</h1>
        <p className="pubContentLead">
          Short guides on Form 4, PTR, and 13F - then open Explore for the live feed.
        </p>
      </div>

      <ul className="pubContentList">
        {LEARN_LESSONS.map((lesson) => (
          <li className="pubContentListItem" key={lesson.slug}>
            <a
              href={`/learn/${lesson.slug}`}
              onClick={(e) => {
                e.preventDefault()
                navigateMarketing(`/learn/${lesson.slug}`)
              }}
            >
              <span className="pubContentListMeta">{lesson.eyebrow}</span>
              <span className="pubContentListTitle">{lesson.title}</span>
              <span className="pubContentListDesc">{lesson.description}</span>
            </a>
          </li>
        ))}
      </ul>

      <PublicContentCta
        body="Full Explore rankings, dossiers, and filing briefs for members."
        secondaryLabel="Research"
        secondaryHref="/research"
      />
    </PublicContentLayout>
  )
}
