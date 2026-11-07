import { correctablekindVals, isVaultError } from 'safebyok'

/** What a dialog does with a refusal a gating's attempt met: show it in place, close, show its trouble notice, or ignore a second submit. */
export type AttemptRefusalFlavor = 'in_place' | 'close' | 'trouble' | 'in_flight'

/** The refusals a dialog shows in place, asking again: those the core leaves the gating open for. */
const InPlaceKinds: ReadonlySet<string> = new Set(correctablekindVals)

/** What a dialog does with `err`, a refusal a gating's attempt met. */
export const attemptRefusalFlavor = (err: unknown): AttemptRefusalFlavor => {
  if (! isVaultError(err) || err.family === 'misuse') { return 'trouble' }
  if (err.refusalkind === 'attempt_in_flight') { return 'in_flight' }
  return InPlaceKinds.has(err.refusalkind) ? 'in_place' : 'close'
}
