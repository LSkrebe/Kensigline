import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
    // eslint-disable-next-line no-console
    console.error('[kensigline] render error', err)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ padding: 18, color: 'rgba(160,255,200,0.9)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
        <div style={{ marginBottom: 8, letterSpacing: 0.5 }}>KENSIGLINE</div>
        <div style={{ opacity: 0.8, marginBottom: 14 }}>UI crashed. Reload to recover.</div>
        <button
          onClick={() => location.reload()}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: '1px solid rgba(80,255,190,0.32)',
            background: 'transparent',
            color: 'rgba(160,255,200,0.9)',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
