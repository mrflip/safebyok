import { correctablekindVals, isVaultError, type AnyGating } from 'safebyok'
import { forBoundary } from '../provider/boundary'
import type { BoundarySource, Gripe } from '../shapes'

const CorrectableKinds: ReadonlySet<string> = new Set(correctablekindVals)

/** What a dialog says of a refused attempt: the user's to correct, or null where the gating answers for itself; anything else on an open gating throws, for the nearest boundary. */
export const gripeOfRefusal = (gating: AnyGating, err: unknown, source: BoundarySource): Gripe | null => {
  if (isVaultError(err) && CorrectableKinds.has(err.refusalkind)) { return { text: err.message, refusalkind: err.refusalkind } }
  if ((! gating.isOpen) || isVaultError(err, 'attempt_in_flight')) { return null }
  throw forBoundary(err, source)
}
