import { Component, useState, type ReactNode } from 'react'
import { HostErrorSanitizer, VaultError, isVaultError } from 'safebyok'

/** What a {@link Boundary} is handed: what to show once something broke, and whom to tell. */
export type BoundaryProps = {
  /** Shown in the children's place once one of them has thrown while rendering. */
  fallback:  ReactNode
  /** Told once, when the boundary first catches: to say so to the user, say. */
  onCaught?: (() => void) | undefined
  children:  ReactNode
}

/**
 * The error boundary a safebyok-react component keeps at its own edge, so that nothing going
 * wrong inside it reaches the host's page: once a child throws while rendering, `fallback` shows
 * in the children's place for as long as the boundary stays mounted, and `onCaught` is told.
 * React reports what was caught as it reports any error a boundary catches, through the root's
 * `onCaughtError` (by default the console, with the component stack), so the developer sees it
 * and an error tracker hooked there receives it.
 *
 * An error from an event handler or a promise reaches it only when it is rethrown while
 * rendering, held in state and thrown on the next render, as `PassphraseModal` does -- through
 * {@link forBoundary}, so that what React reports carries nothing the user typed.
 *
 * @example
 *   <Boundary fallback={<p>Something went wrong.</p>}>
 *     <UnlockForm gating={gating} onDone={onDone} />
 *   </Boundary>
 * @example <Boundary fallback={null} onCaught={() => { onGripe(trouble) }}><PasskeyPress {...props} /></Boundary>
 */
export class Boundary extends Component<BoundaryProps, { caught: boolean }> {
  override state = { caught: false }

  static getDerivedStateFromError() { return { caught: true } }

  override componentDidCatch() { this.props.onCaught?.() }

  override render() { return this.state.caught ? this.props.fallback : this.props.children }
}

/**
 * A number that changes whenever `thing` does: the key for a component that serves one gating,
 * so that handed another it starts afresh -- its boundary caught nothing, its form holds nothing
 * typed for the last.
 *
 * @example <Boundary key={useRoundFor(gating)} fallback={null}><PasskeyPress gating={gating} /></Boundary>
 */
export const useRoundFor = (thing: object): number => {
  const [served, setServed] = useState({ thing, round: 0 })
  if (served.thing === thing) { return served.round }
  // React's "adjusting state while rendering": it renders again at once, before committing this.
  const round = served.round + 1
  setServed({ thing, round })
  return round
}

/** The safebyok-react component a {@link forBoundary} report comes from, which its message names. */
export type BoundarySource = 'PassphraseModal' | 'GatingModal' | 'PasskeyUnlockButton'

/** Where to look, by the component, for an error that was not the vault's own. */
const LookFor: Record<BoundarySource, string> = {
  PassphraseModal:     "It is left out of this report, as it may quote what the user typed: check the functions the app handed the dialog, such as passphraseAdvice.",
  GatingModal:         "It is left out of this report, as it may quote what the user typed: check the functions the app handed the dialog, such as passphraseAdvice, and, for a passkey, the browser's passkey prompt (call createPasskey yourself to see it).",
  PasskeyUnlockButton: "It is left out of this report, as every error a safebyok-react component reports is: the passkey prompt is the likeliest source, so call askPasskey yourself to see it.",
}

/**
 * What a component throws in render for its {@link Boundary}, in place of `err`, so that what
 * React reports through `onCaughtError` -- the console, an error tracker -- carries nothing the
 * user typed. A VaultError keeps its kind, message and meta, but never its `cause`: that may be a
 * host key deriver's throw, which was handed the passphrase. Its message says
 * that the cause was left out, should it point at one. One with no cause is thrown as itself.
 * Anything else becomes a fixed `unexpected_error` quoting nothing of it, naming `source`, the
 * component it came from, and where to look.
 *
 * @param err - What the component's call failed with.
 * @param source - The component reporting it.
 *
 * @example if (failure !== null) { throw forBoundary(failure.err, 'PassphraseModal') }
 */
export const forBoundary = (err: unknown, source: BoundarySource): VaultError => {
  if (! isVaultError(err)) {
    return HostErrorSanitizer.refusalFor(err, 'unexpected_error', `Something inside safebyok-react's ${source} failed with an error that was not the vault's own. ${LookFor[source]}`)
  }
  if (err.cause === undefined) { return err }
  const message = `${err.message} (safebyok-react's ${source} left this error's cause out of its report to React: it may quote what the user typed.)`
  return new VaultError(err.refusalkind, message, err.meta === undefined ? undefined : { meta: err.meta })
}
