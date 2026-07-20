import { useEffect } from 'react'
import { AuthSignIn } from './AuthSignIn.jsx'
import { SIGN_IN, SIGN_IN_PAGE_META } from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './SignInPage.css'

export function SignInPage() {
  useEffect(() => {
    applyPageMeta(SIGN_IN_PAGE_META)
    markAppReady()
  }, [])

  return (
    <div className="lp authPage">
      <header className="lpNav">
        <div className="lpNavInner">
          <a
            className="lpBrand"
            href="/"
            aria-label="Mercerline home"
            onClick={(e) => {
              e.preventDefault()
              navigateMarketing('/')
            }}
          >
            <span className="lpBrandLogoClip">
              <img className="lpBrandLogo" src="/mercerline_mark.png" alt="" width={44} height={32} decoding="async" />
            </span>
            <span className="lpBrandName">MERCERLINE</span>
          </a>
          <a
            className="lpNavCta"
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigateMarketing('/')
            }}
          >
            Back to home
          </a>
        </div>
      </header>

      <main className="authMain">
        <section className="authCard" aria-labelledby="sign-in-title">
          <p className="lpEyebrow">{SIGN_IN.eyebrow}</p>
          <h1 id="sign-in-title" className="authTitle">
            {SIGN_IN.headline}
          </h1>
          <p className="authLead">{SIGN_IN.lead}</p>
          <AuthSignIn variant="intro" />
        </section>
      </main>
    </div>
  )
}
