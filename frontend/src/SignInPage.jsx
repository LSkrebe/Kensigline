import { useEffect } from 'react'
import { AuthSignIn } from './AuthSignIn.jsx'
import { INTRO_FOOTER, SIGN_IN, SIGN_IN_PAGE_META } from './marketingContent.js'
import { navigateMarketing } from './marketingRoute.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.css'
import './SignInPage.css'

export function SignInPage() {
  useEffect(() => {
    applyPageMeta(SIGN_IN_PAGE_META)
    markAppReady()
  }, [])

  return (
    <div className="introPage signInPage introPage--marketingChrome">
      <header className="introNav signInNav">
        <div className="introNavInner">
          <a
            className="introBrand"
            href="/"
            aria-label="Mercerline home"
            onClick={(e) => {
              e.preventDefault()
              navigateMarketing('/')
            }}
          >
            <img className="introBrandLogo" src="/mercerline_logo_transparent.png" alt="" width={28} height={28} />
            <span className="introBrandName">MERCERLINE</span>
          </a>
          <a
            className="introNavAction introNavAction--end mono"
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

      <main className="signInLayout">
        <section className="signInPanel" aria-labelledby="sign-in-title">
          <div className="signInPanelBody">
            <p className="introEyebrow mono">{SIGN_IN.eyebrow}</p>
            <h1 id="sign-in-title" className="signInTitle">
              {SIGN_IN.headline}
            </h1>
            <p className="signInLead mono dim">{SIGN_IN.lead}</p>
            <AuthSignIn variant="intro" />
          </div>
          <footer className="signInFoot signInFoot--desktop" role="contentinfo">
            <span className="introFootNfa mono dim">{INTRO_FOOTER.nfa}</span>
          </footer>
        </section>
        <div className="signInAside" aria-hidden="true" />
      </main>

      <footer className="introFoot introFoot--bar signInFoot--mobile" role="contentinfo">
        <div className="introFootInner introFootInner--marketing">
          <div className="introFootMeta">
            <span className="introFootNfa mono dim">{INTRO_FOOTER.nfa}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
