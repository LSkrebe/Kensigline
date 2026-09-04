import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './pageBackgrounds.css'
import './marketingEnter.css'
import { preloadPageBackgrounds } from './pageBackgrounds.js'
import AppRouter from './AppRouter.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { installWhopPixel } from './whopPixel.js'

installWhopPixel()

void preloadPageBackgrounds()

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
    const msg = String(this.state.err?.message ?? this.state.err ?? '')
    const chunkErr = /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(
      msg,
    )
    return (
      <div className="appShellScreen appShellErrorScreen" role="alert">
        <div className="appShellContent">
          <img
            className="appShellBrandLogo"
            src="/mercerline_mark.png"
            alt=""
            width={44}
            height={32}
            decoding="async"
          />
          <p className="appShellBrandName">MERCERLINE</p>
          <p className="appShellMessage">Something went wrong.</p>
          <p className="appShellHint">
            {chunkErr
              ? 'The app was updated. Try again or reload to fetch the latest version.'
              : 'Reload the page to continue.'}
          </p>
          <button
            type="button"
            className="appShellBtn"
            onClick={() => this.setState({ hasError: false, err: null })}
          >
            Try again
          </button>
          <button type="button" className="appShellBtn appShellBtn--secondary" onClick={() => location.reload()}>
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

/* drain-bust 1786300500-waitlist */
