import { introCompanyLogoSrc, INTRO_REVIEWS } from './marketingContent.js'
import { IntroReviewChart } from './IntroReviewChart.jsx'

function ReviewCard({ review }) {
  const { catch: memberCatch } = review

  return (
    <article className="lpReviewCard">
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
  return (
    <section className="lpSection lpReviews lpSection--ruled" aria-labelledby="lp-reviews-title">
      <div className="lpSectionHead lpSectionHead--center">
        <p className="lpEyebrow">Reviews</p>
        <h2 id="lp-reviews-title" className="lpSectionTitle">
          {INTRO_REVIEWS.title}
        </h2>
        {INTRO_REVIEWS.lead ? <p className="lpSectionLead">{INTRO_REVIEWS.lead}</p> : null}
      </div>

      <div className="lpReviewGrid">
        {INTRO_REVIEWS.items.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </section>
  )
}
