import { useEffect, useState } from 'react'
import { fetchJsonSafe } from './api.js'
import { PublicContentCta, PublicContentLayout } from './PublicContentLayout.jsx'
import { RESEARCH_INDEX_META } from './publicRoutes.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'

function formatDayLabel(dayKey) {
  const m = String(dayKey ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return dayKey
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return dayKey
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function ResearchIndexPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    applyPageMeta(RESEARCH_INDEX_META)
    markAppReady()
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchJsonSafe('/api/public/research', { timeoutMs: 20_000 }).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.ok && res.data?.ok) setData(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const today = data?.today ?? null
  const featured = data?.featured ?? null
  const headline = today ?? featured
  const archive = Array.isArray(data?.archive) ? data.archive : []

  return (
    <PublicContentLayout backgroundKey="publicCompany">
      <div className="pubContentHero">
        <p className="lpEyebrow">Research</p>
        <h1 className="pubContentTitle">Daily disclosure highlights</h1>
        <p className="pubContentLead">
          One public filing story per day from Mercerline’s recap — enough context to understand the category,
          with the full rail inside for members.
        </p>
      </div>

      {loading ? <p className="pubContentStatus">Loading…</p> : null}

      {!loading && headline ? (
        <section className="pubContentCard">
          <p className="pubContentEventKicker">{today ? "Today's headline" : 'Latest highlight'}</p>
          <h2>
            <a
              href={`/research/${headline.slug}`}
              onClick={(e) => {
                e.preventDefault()
                navigateMarketing(`/research/${headline.slug}`)
              }}
            >
              {headline.headline}
            </a>
          </h2>
          <p>{headline.summary}</p>
        </section>
      ) : null}

      {!loading && !headline ? (
        <p className="pubContentStatus">No public headline is available yet today. Check back after filings clear.</p>
      ) : null}

      {archive.length ? (
        <section>
          <h2 className="pubContentListMeta" style={{ marginBottom: 12 }}>
            Recent days
          </h2>
          <ul className="pubContentList">
            {archive.map((item) => (
              <li className="pubContentListItem" key={item.slug}>
                <a
                  href={`/research/${item.slug}`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigateMarketing(`/research/${item.slug}`)
                  }}
                >
                  <span className="pubContentListMeta">
                    {formatDayLabel(item.dayKey)}, {item.doc}
                  </span>
                  <span className="pubContentListTitle">{item.title}</span>
                  <span className="pubContentListDesc">{item.ticker}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PublicContentCta
        title="See every filing as it clears"
        body="Explore shows the full daily recap, investor dossiers, and company context — not just one headline."
      />
    </PublicContentLayout>
  )
}
