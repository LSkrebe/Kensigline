import { useEffect, useMemo } from 'react'
import { getLearnLesson, LEARN_LESSONS } from './learn/learnContent.js'
import { PublicContentCta, PublicContentLayout } from './PublicContentLayout.jsx'
import { learnLessonPageMeta } from './publicRoutes.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { buildLearnArticleJsonLd } from './marketingSeo.js'

export function LearnLessonPage({ slug: slugProp = null }) {
  const slug = slugProp ?? ''
  const lesson = useMemo(() => getLearnLesson(slug), [slug])
  const related = useMemo(
    () => (lesson?.related ?? []).map((s) => LEARN_LESSONS.find((l) => l.slug === s)).filter(Boolean),
    [lesson],
  )

  useEffect(() => {
    if (!lesson) return
    applyPageMeta(learnLessonPageMeta(lesson))
    markAppReady()

    const schema = buildLearnArticleJsonLd(lesson)
    let el = document.head.querySelector('script[data-learn-schema]')
    if (!el) {
      el = document.createElement('script')
      el.setAttribute('type', 'application/ld+json')
      el.setAttribute('data-learn-schema', 'true')
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => {
      el?.remove()
    }
  }, [lesson])

  if (!lesson) {
    return (
      <PublicContentLayout backgroundKey="signIn">
        <p className="pubContentStatus">Lesson not found.</p>
      </PublicContentLayout>
    )
  }

  return (
    <PublicContentLayout
      backgroundKey="signIn"
      trail={
        <>
          <a href="/learn" onClick={(e) => { e.preventDefault(); navigateMarketing('/learn') }}>Learn</a>
          {' / '}
          {lesson.title}
        </>
      }
    >
      <article>
        <header className="pubContentHero">
          <p className="lpEyebrow">{lesson.eyebrow}</p>
          <h1 className="pubContentTitle">{lesson.title}</h1>
          <p className="pubContentLead">{lesson.description}</p>
        </header>

        {lesson.sections.map((section) => (
          <section className="pubContentCard" key={section.heading}>
            <h2>{section.heading}</h2>
            {(section.paragraphs ?? (section.body ? [section.body] : [])).map((para) => (
              <p key={para.slice(0, 48)}>{para}</p>
            ))}
          </section>
        ))}

        <section className="pubContentCard">
          <h2>{lesson.mercerline.heading}</h2>
          {(lesson.mercerline.paragraphs ?? (lesson.mercerline.body ? [lesson.mercerline.body] : [])).map((para) => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
          {lesson.mercerline.bullets?.length ? (
            <ul>
              {lesson.mercerline.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>

        {related.length ? (
          <div className="pubContentRelated">
            <h3>Related lessons</h3>
            <div className="pubContentRelatedLinks">
              {related.map((item) => (
                <a
                  key={item.slug}
                  href={`/learn/${item.slug}`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateMarketing(`/learn/${item.slug}`)
                  }}
                >
                  {item.title}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <PublicContentCta
          title="Apply this in Mercerline"
          body="Sign in for the daily recap and dossiers described in this guide."
          secondaryLabel="Research"
          secondaryHref="/research"
        />
      </article>
    </PublicContentLayout>
  )
}
