import { useEffect, useRef, useState } from 'react'
import { introCompanyLogoSrc, INTRO_REVIEWS } from './marketingContent.js'
import { IntroReviewChart } from './IntroReviewChart.jsx'

function ReviewCard({ review, index }) {
  const { catch: memberCatch } = review

  return (
    <article className="lpReviewCard" data-review-index={index}>
      {memberCatch ? (
        <div className="lpReviewCatch">
          <div className="lpReviewCatchHero">
            <img
              className="lpReviewCatchLogo"
              src={introCompanyLogoSrc(memberCatch.ticker)}
              alt=""
              width={56}
              height={56}
              loading="lazy"
              decoding="async"
            />
            <p className="lpReviewCatchMove">{memberCatch.move}</p>
          </div>
          <div className="lpReviewCatchChart">
            <IntroReviewChart
              ticker={memberCatch.ticker}
              filedIso={memberCatch.filedIso}
              chartEnd={memberCatch.chartEnd}
            />
          </div>
        </div>
      ) : null}

      <blockquote className="lpReviewCardQuote">
        <p>{review.quote}</p>
      </blockquote>
      <footer className="lpReviewCardMeta">
        <cite className="lpReviewName">{review.name}</cite>
      </footer>
    </article>
  )
}

export function IntroReviewsSection() {
  const trackRef = useRef(null)
  const [activeReview, setActiveReview] = useState(0)
  const { items } = INTRO_REVIEWS

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined

    const mq = window.matchMedia('(max-width: 899px)')
    const slides = [...track.querySelectorAll('.lpReviewCard')]
    if (!slides.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (!mq.matches) return
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!best) return
        const idx = Number(best.target.getAttribute('data-review-index'))
        if (!Number.isNaN(idx)) setActiveReview(idx)
      },
      { root: track, threshold: [0.5, 0.75] },
    )

    const attach = () => {
      observer.disconnect()
      if (!mq.matches) {
        setActiveReview(0)
        return
      }
      slides.forEach((slide) => observer.observe(slide))
    }

    attach()
    mq.addEventListener('change', attach)
    return () => {
      observer.disconnect()
      mq.removeEventListener('change', attach)
    }
  }, [items.length])

  return (
    <section className="lpSection lpReviews lpSection--ruled" aria-labelledby="lp-reviews-title">
      <div className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">Reviews</p>
        <h2 id="lp-reviews-title" className="lpSectionTitle">
          {INTRO_REVIEWS.title}
        </h2>
        {INTRO_REVIEWS.lead ? <p className="lpSectionLead">{INTRO_REVIEWS.lead}</p> : null}
      </div>

      <div className="lpReviewGrid" ref={trackRef}>
        {items.map((review, index) => (
          <ReviewCard key={review.id} review={review} index={index} />
        ))}
      </div>

      <div className="lpReviewDots" aria-hidden="true">
        {items.map((review, index) => (
          <span
            key={review.id}
            className={['lpReviewDot', index === activeReview ? 'lpReviewDot--active' : '']
              .filter(Boolean)
              .join(' ')}
          />
        ))}
      </div>
    </section>
  )
}
