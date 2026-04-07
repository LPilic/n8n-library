import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center h-full p-8">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-danger mb-2">Something went wrong</h2>
              <p className="text-sm text-text-muted mb-4">{this.state.error?.message}</p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="text-sm px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
              >
                Try again
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
