import { Component } from 'react'
import { HostErrorSanitizer, VaultError, isVaultError } from 'safebyok'
import type { BoundaryProps, BoundarySource } from '../shapes'

/** An error boundary: render `fallback` once a child has thrown, and call `onCaught`. */
export class Boundary extends Component<BoundaryProps, { caught: boolean }> {
  override state = { caught: false }

  /** Mark the boundary as caught when a child throws. */
  static getDerivedStateFromError() { return { caught: true } }

  /** Call `onCaught` once a child has thrown. */
  override componentDidCatch() { this.props.onCaught?.() }

  /** Render `fallback` once caught, and the children until then. */
  override render() { return this.state.caught ? this.props.fallback : this.props.children }
}

const LeftOut = "It is left out of this report, as it may quote what the user typed"

/** Convert an error a boundary caught into a VaultError that is safe to report.
 * The error's cause is left out, because it may quote what the user typed.
 */
export const forBoundary = (err: unknown, source: BoundarySource): VaultError => {
  if (! isVaultError(err)) {
    return HostErrorSanitizer.refusalFor(err, 'unexpected_error', `Something inside safebyok-react's ${source} failed with an error that was not the vault's own. ${LeftOut}.`)
  }
  if (err.cause === undefined) { return err }
  const message = `${err.message} (safebyok-react's ${source} left this error's cause out of its report to React: it may quote what the user typed.)`
  return new VaultError(err.refusalkind, message, err.meta === undefined ? undefined : { meta: err.meta })
}
