import { Component } from 'react'
import { HostErrorSanitizer, VaultError, isVaultError } from 'safebyok'
import type { BoundaryProps, BoundarySource } from '../shapes'

/** The error boundary a safebyok-react component keeps at its own edge. */
export class Boundary extends Component<BoundaryProps, { caught: boolean }> {
  override state = { caught: false }

  static getDerivedStateFromError() { return { caught: true } }

  override componentDidCatch() { this.props.onCaught?.() }

  override render() { return this.state.caught ? this.props.fallback : this.props.children }
}

const LeftOut = "It is left out of this report, as it may quote what the user typed"

/** Where to look, by the component, for an error that was not the vault's own. */
const LookFor: Record<BoundarySource, string> = {
  PassphraseModal:        `${LeftOut}: check the functions the app handed the dialog, such as passphraseAdvice.`,
  ReplacePassphraseModal: `${LeftOut}: check the functions the app handed the dialog, such as passphraseAdvice.`,
  DelVaultModal:          `${LeftOut}.`,
  AddPasskeyModal:        `${LeftOut}.`,
  RevokePasskeyModal:     `${LeftOut}.`,
  PasskeyUnlockButton:    `${LeftOut}.`,
}

/** What a component throws in render for its {@link Boundary} in place of `err`. */
export const forBoundary = (err: unknown, source: BoundarySource): VaultError => {
  if (! isVaultError(err)) {
    return HostErrorSanitizer.refusalFor(err, 'unexpected_error', `Something inside safebyok-react's ${source} failed with an error that was not the vault's own. ${LookFor[source]}`)
  }
  if (err.cause === undefined) { return err }
  const message = `${err.message} (safebyok-react's ${source} left this error's cause out of its report to React: it may quote what the user typed.)`
  return new VaultError(err.refusalkind, message, err.meta === undefined ? undefined : { meta: err.meta })
}
