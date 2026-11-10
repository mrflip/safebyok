import { correctablekindVals, isVaultError, type AnyGating } from 'safebyok'
import { forBoundary } from '../provider/boundary'
import type { BoundarySource, Gripe } from '../shapes'

const CorrectableKinds: ReadonlySet<string> = new Set(correctablekindVals)

/** Return the message a dialog shows for a refused attempt that the user can correct.
 * Returns null when the gating has closed or another attempt is already running. Any other error is thrown, for the nearest error boundary.
 */
export const gripeOfRefusal = (gating: AnyGating, err: unknown, source: BoundarySource): Gripe | null => {
  if (isVaultError(err) && CorrectableKinds.has(err.refusalkind)) { return { text: err.message, refusalkind: err.refusalkind } }
  if ((! gating.isOpen) || isVaultError(err, 'attempt_in_flight')) { return null }
  throw forBoundary(err, source)
}
