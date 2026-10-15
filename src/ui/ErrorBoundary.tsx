import { Component, type ReactNode } from 'react'

interface Props {
  /** Rendered instead of the children after an error; `retry` renders the children again. */
  fallback: (error: Error, retry: () => void) => ReactNode
  /** The children are rendered again when any of these change (e.g. the user edits an input). */
  resetKeys: unknown[]
  children: ReactNode
}

interface State {
  error: Error | null
  keys: unknown[]
}

/** Catches render errors below it so the rest of the page stays usable. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, keys: this.props.resetKeys }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const changed = props.resetKeys.some((k, i) => !Object.is(k, state.keys[i]))
    return changed ? { error: null, keys: props.resetKeys } : null
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  retry = () => this.setState({ error: null })

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : this.props.children
  }
}
