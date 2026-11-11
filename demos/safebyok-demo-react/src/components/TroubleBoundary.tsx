import { Component, type ReactNode } from 'react'

/** The demo's error boundary, wrapped around the provider and the page as safebyok-react's README advises.
 * Misuse (a bad label or option, or a bug in the demo's own code) throws while rendering. The boundary then shows
 * a calm message and a Reload button in place of the page. Key it on the signed-in user, so a new sign-in starts fresh.
 *
 * @example
 *   <TroubleBoundary key={user_id ?? 'signed-out'}>
 *     <BankProvider ...><Page /></BankProvider>
 *   </TroubleBoundary>
 */
export class TroubleBoundary extends Component<{ children: ReactNode, onReload?: () => void }, { caught: boolean }> {
  override state = { caught: false }

  /** Mark the boundary as caught when a child throws. */
  static getDerivedStateFromError() { return { caught: true } }

  /** Render the children, or the message and Reload button once one of them has thrown. */
  override render() {
    if (! this.state.caught) { return this.props.children }
    const reload = this.props.onReload ?? (() => { globalThis.location.reload() })
    return (
      <main>
        <h1>Knock-Knock Machine</h1>
        <p className="gripe" role="alert">
          The app ran into a bug of its own, not one you caused. Your vault is safe: reload the page to try again.
        </p>
        <button onClick={reload}>Reload</button>
      </main>
    )
  }
}
