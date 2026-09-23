import { useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { PublicContentCta, PublicContentLayout } from './PublicContentLayout.jsx'
import { researchEventPageMeta } from './publicRoutes.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import { buildResearchEventJsonLd } from './marketingSeo.js'
import { SkeletonStatus } from './AppSkeleton.jsx'

function formatDayLabel(dayKey) {
  const m = String(dayKey ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return dayKey
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return dayKey
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function ResearchEventPage({ dayKey: dayKeyProp = null }) {
  const dayKey = String(dayKeyProp ?? '').trim()
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!dayKey) return
    let cancelled = false
    setLoading(true)
    setMissing(false)
    void fetchJsonSafe(`/api/public/research?day=${encodeURIComponent(dayKey)}`, { timeoutMs: 20_000 }).then(
      (res) => {
        if (cancelled) return
        setLoading(false)
        if (res.ok && res.data?.ok && res.data.event) {
          setEvent(res.data.event)
          applyPageMeta(researchEventPageMeta(res.data.event))
        } else {
          setEvent(null)
          setMissing(true)
          applyPageMeta({
            title: `Research ${dayKey} - Mercerline`,
            description: 'Daily US equity disclosure highlight from Mercerline.',
            path: `/research/${dayKey}`,
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [dayKey])

  useEffect(() => {
    markAppReady()
  }, [])

  useEffect(() => {
    if (!event) return
    const schema = buildResearchEventJsonLd(event)
    let el = document.head.querySelector('script[data-research-schema]')
    if (!el) {
      el = document.createElement('script')
      el.setAttribute('type', 'application/ld+json')
      el.setAttribute('data-research-schema', 'true')
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => {
      el?.remove()
    }
  }, [event])

  return (
    <PublicContentLayout
      backgroundKey="publicCompany"
      trail={
        <>
          <a href="/research" onClick={(e) => { e.preventDefault(); navigateMarketing('/research') }}>Research</a>
          {' / '}
          {dayKey}
        </>
      }
    >
      {loading ? (
        <SkeletonStatus label="Loading" className="appSkelEvent">
          <span className="appSkel appSkel--title" />
          <span className="appSkel appSkel--sub" />
        </SkeletonStatus>
      ) : null}

      {!loading && missing ? (
        <p className="pubContentStatus">No public research page is available for this date.</p>
      ) : null}

      {!loading && event ? (
        <article>
          <header className="pubContentHero">
            <p className="pubContentEventKicker">Event of the day, {formatDayLabel(event.dayKey)}</p>
            <span className="pubContentEventDoc">{event.doc}</span>
            <h1 className="pubContentTitle">{event.headline}</h1>
            <p className="pubContentLead">{event.summary}</p>
          </header>

          <section className="pubContentCard">
            <h2>Why it matters</h2>
            <p>{event.context}</p>
          </section>

          <section className="pubContentCard">
            <h2>Ticker context</h2>
            <p>
              This story involves{' '}
              <a
                href={`/research/ticker/${event.ticker}`}
                onClick={(e) => {
                  e.preventDefault()
                  navigateMarketing(`/research/ticker/${event.ticker}`)
                }}
              >
                {event.companyName} ({event.ticker})
              </a>
              . Public pages show one headline per day — not the full filing rail.
            </p>
          </section>

          <div className="pubContentRelated">
            <h3>Learn the filing types</h3>
            <div className="pubContentRelatedLinks">
              <a href="/learn/form-4-insider-filings" onClick={(e) => { e.preventDefault(); navigateMarketing('/learn/form-4-insider-filings') }}>
                Form 4 guide
              </a>
              <a href="/learn/politician-ptr-disclosures" onClick={(e) => { e.preventDefault(); navigateMarketing('/learn/politician-ptr-disclosures') }}>
                PTR guide
              </a>
            </div>
          </div>

          <PublicContentCta
            title="Full dossier inside Mercerline"
            body="Members see every filing in the daily recap, open investor dossiers, and jump to company context — not just today’s headline."
          />
        </article>
      ) : null}
    </PublicContentLayout>
  )
}
