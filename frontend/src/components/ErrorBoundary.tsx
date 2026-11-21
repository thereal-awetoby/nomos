import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

/** Catches descendant React render errors and shows a recovery screen. */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Nomos] Uncaught render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-nomos-bg px-6 text-center">
        <h1 className="mb-2 text-xl font-semibold text-nomos-text">
          Something went wrong
        </h1>
        <p role="alert" className="mb-6 max-w-sm text-sm text-nomos-muted">
          The page hit an error. Your funds are not affected. Check your wallet before trying again.
        </p>
        {this.state.error && (
          <details className="mb-6 max-w-sm text-left">
            <summary className="cursor-pointer text-sm text-nomos-muted">
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-nomos-surface p-4 font-mono text-xs text-nomos-muted-bright">
              {this.state.error.message}
            </pre>
          </details>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-ghost"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
