import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './marketingEnter.css'
import AppRouter from './AppRouter.jsx'
import { AuthProvider } from './AuthContext.jsx'

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
          <p className="appShellHint">Reload the page to continue.</p>
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

/* drain-bust 1786295092 */
