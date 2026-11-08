import { correctablekindVals, isVaultError } from 'safebyok'
import type { AttemptRefusalFlavor } from '../shapes'

const InPlaceKinds: ReadonlySet<string> = new Set(correctablekindVals)

export const attemptRefusalFlavor = (err: unknown): AttemptRefusalFlavor => {
  if (! isVaultError(err) || err.family === 'misuse') { return 'trouble' }
  if (err.refusalkind === 'attempt_in_flight') { return 'in_flight' }
  return InPlaceKinds.has(err.refusalkind) ? 'in_place' : 'close'
}
