import { correctablekindVals, isVaultError } from 'safebyok'
import type { AttemptRefusalFlavor } from '../shapes'

/** The refusal kinds a dialog shows in place: those the core leaves the gating open after. */
const InPlaceKinds: ReadonlySet<string> = new Set(correctablekindVals)

/** What a dialog does with `err`, a refusal a gating's attempt met. */
export const attemptRefusalFlavor = (err: unknown): AttemptRefusalFlavor => {
  if (! isVaultError(err) || err.family === 'misuse') { return 'trouble' }
  if (err.refusalkind === 'attempt_in_flight') { return 'in_flight' }
  return InPlaceKinds.has(err.refusalkind) ? 'in_place' : 'close'
}
