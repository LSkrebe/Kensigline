import { useEffect, useMemo } from 'react'
import { AuthSignIn } from './AuthSignIn.jsx'
import { useAuth } from './AuthContext.jsx'
import { SIGN_IN, SIGN_IN_GATE_MESSAGES, SIGN_IN_PAGE_META } from './marketingContent.js'
import { navigateMarketing, returnToIntroAfterSignOut } from './marketingRoute.js'
import { pageBackgroundStyle } from './pageBackgrounds.js'
import { applyPageMeta } from './pageMeta.js'
import { markAppReady } from './marketingShell.js'
import './IntroPage.css'
import './IntroPage.marketing.css'
import './SignInPage.css'

function readGateReason() {
  if (typeof window === 'undefined') return null
  const reason = new URLSearchParams(window.location.search).get('reason')
  return reason && SIGN_IN_GATE_MESSAGES[reason] ? reason : null
}

export function SignInPage({ gateReason: gateReasonProp = null }) {
  const { user, signOut } = useAuth()
  const gateReason = gateReasonProp || readGateReason()
  const gateMessage = gateReason ? SIGN_IN_GATE_MESSAGES[gateReason] : null
  const signedInEmail = useMemo(() => String(user?.email ?? '').trim(), [user?.email])

  useEffect(() => {
    applyPageMeta(SIGN_IN_PAGE_META)
    markAppReady()
  }, [])

  const onSignOut = async () => {
    const { error } = await signOut()
    if (error) return
    returnToIntroAfterSignOut()
  }

  return (
    <div className="lp authPage" style={pageBackgroundStyle('signIn')}>
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
          {gateMessage ? (
            <div className="authNotice" role="status">
              <p className="authNoticeTitle">{gateMessage.title}</p>
              <p className="authNoticeBody">
                {signedInEmail && typeof gateMessage.signedInBody === 'function'
                  ? gateMessage.signedInBody(signedInEmail)
                  : gateMessage.body}
              </p>
              {signedInEmail ? (
                <div className="authNoticeActions">
                  <button type="button" className="authSignInBtn authSignInBtn--ghost" onClick={() => void onSignOut()}>
                    Sign out
                  </button>
                  <a
                    className="authSignInBtn authSignInBtn--primary"
                    href="/#pricing"
                    onClick={(e) => {
                      e.preventDefault()
                      navigateMarketing('/#pricing')
                    }}
                  >
                    View plans
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="lpEyebrow">{SIGN_IN.eyebrow}</p>
          <h1 id="sign-in-title" className="authTitle">
            {SIGN_IN.headline}
          </h1>
          <p className="authLead">{SIGN_IN.lead}</p>
          <AuthSignIn variant="intro" />
          <p className="authFootnote">
            New here?{' '}
            <a
              href="/#pricing"
              onClick={(e) => {
                e.preventDefault()
                navigateMarketing('/#pricing')
              }}
            >
              See plans and pricing
            </a>
          </p>
        </section>
      </main>
    </div>
  )
}
