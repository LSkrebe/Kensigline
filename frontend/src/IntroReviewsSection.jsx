import { INTRO_REVIEWS } from './marketingContent.js'

function StarRating({ rating = 5, max = 5, className = '' }) {
  const fullStars = Math.floor(rating)
  const partialFill = rating - fullStars

  return (
    <div
      className={`lpReviewStars ${className}`.trim()}
      role="img"
      aria-label={`${rating} out of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => {
        if (i < fullStars) {
          return (
            <span key={i} className="lpReviewStar lpReviewStar--on" aria-hidden="true">
              ★
            </span>
          )
        }
        if (i === fullStars && partialFill > 0) {
          return (
            <span
              key={i}
              className="lpReviewStar lpReviewStar--partial"
              style={{ '--lp-star-fill': `${Math.round(partialFill * 100)}%` }}
              aria-hidden="true"
            >
              ★
            </span>
          )
        }
        return (
          <span key={i} className="lpReviewStar" aria-hidden="true">
            ★
          </span>
        )
      })}
    </div>
  )
}

function VerifiedBadge() {
  return (
    <svg
      className="lpReviewVerifiedBadge"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Verified member"
    >
      <path
        fill="currentColor"
        d="M12 2.25c-1.5 0-2.86.64-3.82 1.66C7.22 3.5 5.9 3.25 4.6 3.86 3.3 4.47 2.5 5.78 2.5 7.2c0 1.17.52 2.22 1.34 2.94-.15.56-.23 1.15-.23 1.76 0 2.9 2.1 5.3 4.86 5.78.47.93 1.43 1.57 2.53 1.57 1.1 0 2.06-.64 2.53-1.57 2.76-.48 4.86-2.88 4.86-5.78 0-.61-.08-1.2-.23-1.76.82-.72 1.34-1.77 1.34-2.94 0-1.42-.8-2.73-2.1-3.34-1.3-.61-2.62-.36-3.58.01C14.86 2.89 13.5 2.25 12 2.25Zm-1.1 12.04 5.47-5.47-1.06-1.06-4.41 4.41-1.77-1.77-1.06 1.06 3.83 3.83Z"
      />
    </svg>
  )
}

function ReviewCard({ review }) {
  return (
    <article className="lpReviewCard">
      <StarRating rating={review.rating ?? 5} />
      <blockquote className="lpReviewQuote">
        <p>{review.quote}</p>
      </blockquote>
      <footer className="lpReviewMeta">
        <div className="lpReviewIdentity">
          <div className="lpReviewNameRow">
            <cite className="lpReviewName">{review.name}</cite>
            {review.verified ? <VerifiedBadge /> : null}
          </div>
          {review.role ? <p className="lpReviewRole">{review.role}</p> : null}
        </div>
      </footer>
    </article>
  )
}

export function IntroReviewsSection() {
  const reviews = INTRO_REVIEWS.items

  return (
    <section className="lpSection lpReviews" aria-labelledby="lp-reviews-title">
      <div className="lpSectionHead">
        <p className="lpEyebrow">{INTRO_REVIEWS.kicker}</p>
        <h2 id="lp-reviews-title" className="lpSectionTitle">
          {INTRO_REVIEWS.title}
        </h2>
        {INTRO_REVIEWS.lead ? <p className="lpSectionLead">{INTRO_REVIEWS.lead}</p> : null}
        {INTRO_REVIEWS.aggregateRating ? (
          <div className="lpReviewAggregate">
            <StarRating rating={INTRO_REVIEWS.aggregateRating} />
            <span className="lpReviewAggregateLabel">
              {INTRO_REVIEWS.aggregateRating.toFixed(1)} average
            </span>
          </div>
        ) : null}
      </div>

      <div className="lpReviewCarousel">
        <div className="lpReviewViewport" role="list">
          {reviews.map((review) => (
            <div key={review.id} className="lpReviewSlide" role="listitem">
              <ReviewCard review={review} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
