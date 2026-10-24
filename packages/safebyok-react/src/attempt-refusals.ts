import { CorrectableKindVals, isVaultError } from 'safebyok'

/** What a dialog does with a refusal a gating's attempt met.
 * * `in_place`: show its message beside the field and ask again. These are the core's
 *   correctable kinds (`CorrectableKindVals`), each of which leaves the gating open: a wrong
 *   passphrase or passkey, a weak new passphrase or the same one again, and a way in that cannot
 *   answer (absent or damaged, or a passkey the browser cannot ask), which leaves the other to try.
 * * `gate_made_elsewhere`: the vault's first passphrase was just set on another device. The gating
 *   it answered is over: close the dialog, answering `declined`, and the next call asks for the
 *   passphrase chosen there.
 * * `close`: close the dialog, answering `declined` (a lock that won, storage out of reach, a vault
 *   gone, and any other refusal): the gating is over.
 * * `trouble`: misuse or a failure that is no VaultError at all, which goes to the dialog's error
 *   boundary, to be reported, and whose Close answers `declined` too.
 * * `in_flight`: a second attempt while one runs ('attempt_in_flight'), which was not tried. Do
 *   nothing: the attempt under way answers for the dialog.
 */
export type AttemptRefusalFlavor = 'in_place' | 'gate_made_elsewhere' | 'close' | 'trouble' | 'in_flight'

/** The refusals a dialog shows in place, asking again: those the core leaves the gating open for. */
const InPlaceKinds: ReadonlySet<string> = new Set(CorrectableKindVals)

/** What a dialog does with `err`, a refusal a gating's attempt met: see {@link AttemptRefusalFlavor}. */
export const attemptRefusalFlavor = (err: unknown): AttemptRefusalFlavor => {
  if (! isVaultError(err) || err.family === 'misuse') { return 'trouble' }
  if (err.refusalkind === 'gate_made_elsewhere') { return 'gate_made_elsewhere' }
  if (err.refusalkind === 'attempt_in_flight') { return 'in_flight' }
  return InPlaceKinds.has(err.refusalkind) ? 'in_place' : 'close'
}
