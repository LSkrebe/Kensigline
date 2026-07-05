import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppRouter from './AppRouter.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { captureReferralFromUrl } from './referral.js'

captureReferralFromUrl()

// Small runtime error boundary so the app doesn't go fully black in prod/dev.
// Keeps mocks and lets users continue navigating even if one panel crashes.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, err: null }
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err }
  }
  componentDidCatch(err) {
    console.error('[kensigline] render error', err)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    const errMsg = this.state.err?.message ? String(this.state.err.message) : null
    return (
      <div className="appShellScreen">
        <div className="appShellCard" role="alert">
          <div className="appShellBrand" aria-label="Mercerline">
            <img
              className="appShellBrandLogo"
              src="/mercerline_logo_transparent.png"
              alt=""
              width={28}
              height={28}
              decoding="async"
            />
            <span className="appShellBrandName">MERCERLINE</span>
          </div>
          <p className="appShellMessage">UI crashed. Reload to recover.</p>
          {errMsg ? <pre className="appShellError">{errMsg}</pre> : null}
          <button type="button" className="appShellBtn" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
