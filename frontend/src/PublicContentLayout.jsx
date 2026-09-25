import { navigateMarketing } from './marketingRoute.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './PublicContent.css'

export function PublicContentLayout({
  backgroundKey: _backgroundKey = 'signIn',
  children,
  trail = null,
  navExtra = null,
}) {
  const goHome = (e) => {
    e?.preventDefault()
    navigateMarketing('/')
  }

  return (
    <div className="lp pubContent">
      <header className="lpNav pubContentNav">
        <div className="lpNavInner">
          <a className="lpBrand" href="/" aria-label="Mercerline home" onClick={goHome}>
            <span className="lpBrandLogoClip">
              <img className="lpBrandLogo" src="/mercerline_mark.png" alt="" width={44} height={32} decoding="async" />
            </span>
            <span className="lpBrandName">MERCERLINE</span>
          </a>
          <nav className="pubContentNavLinks" aria-label="Public sections">
            <a className="pubContentNavLinkDesktop" href="/learn" onClick={(e) => { e.preventDefault(); navigateMarketing('/learn') }}>
              Learn
            </a>
            <a className="pubContentNavLinkDesktop" href="/research" onClick={(e) => { e.preventDefault(); navigateMarketing('/research') }}>
              Research
            </a>
            <a className="pubContentNavSignIn" href="/sign-in" onClick={(e) => { e.preventDefault(); navigateMarketing('/sign-in') }}>
              Sign in
            </a>
          </nav>
          {navExtra}
        </div>
      </header>
      {trail ? <div className="pubContentTrail">{trail}</div> : null}
      <main className="pubContentMain">{children}</main>
    </div>
  )
}

export function PublicContentCta({
  title = 'See the full disclosure rail',
  body,
  primaryLabel = 'Get started',
  primaryHref = '/#pricing',
  secondaryLabel = 'Learn more',
  secondaryHref = '/learn',
  onPrimary,
  onSecondary,
}) {
  return (
    <aside className="pubContentCta" aria-label="Mercerline membership">
      <h2 className="pubContentCtaTitle">{title}</h2>
      {body ? <p className="pubContentCtaBody">{body}</p> : null}
      <div className="pubContentCtaActions">
        <a
          className="lpBtn lpBtn--accent"
          href={primaryHref}
          onClick={(e) => {
            e.preventDefault()
            onPrimary?.(e) ?? navigateMarketing(primaryHref)
          }}
        >
          {primaryLabel}
        </a>
        <a
          className="lpBtn lpBtn--ghost pubContentCtaSecondary"
          href={secondaryHref}
          onClick={(e) => {
            e.preventDefault()
            onSecondary?.(e) ?? navigateMarketing(secondaryHref)
          }}
        >
          {secondaryLabel}
        </a>
      </div>
    </aside>
  )
}
