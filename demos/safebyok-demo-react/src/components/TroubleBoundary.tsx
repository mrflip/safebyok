import { Component, type ReactNode } from 'react'

/**
 * The demo's error boundary, around the provider and the page, as safebyok-react's README has a
 * host place one: misuse -- a bad label or option, a bug in the demo's own code -- is thrown to
 * it while rendering, and it shows a calm word with a way to start again in place of the page.
 * React reports what it caught through the root's `onCaughtError`, the console by default. Keyed
 * on the signed-in user, so another user, or a sign-out and back in, gets a fresh attempt.
 *
 * @example
 *   <TroubleBoundary key={userId ?? 'signed-out'}>
 *     <BankProvider ...><Page /></BankProvider>
 *   </TroubleBoundary>
 */
export class TroubleBoundary extends Component<{ children: ReactNode, onReload?: () => void }, { caught: boolean }> {
  override state = { caught: false }

  static getDerivedStateFromError() { return { caught: true } }

  override render() {
    if (! this.state.caught) { return this.props.children }
    const reload = this.props.onReload ?? (() => { globalThis.location.reload() })
    return (
      <main>
        <h1>safebyok playground</h1>
        <p className="gripe" role="alert">
          The playground ran into a bug of its own, not one you caused. Your vault is safe: reload the page to try again.
        </p>
        <button onClick={reload}>Reload</button>
      </main>
    )
  }
}
