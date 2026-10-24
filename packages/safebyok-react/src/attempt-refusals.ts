import { isVaultError } from 'safebyok'

/** What a dialog does with a refusal a gating's attempt met.
 * * `in_place`: show its message beside the field and ask again (a wrong passphrase or passkey, a
 *   weak new passphrase, and the ways in that cannot answer: a way in absent or damaged, a passkey
 *   the browser cannot ask).
 * * `gate_made_elsewhere`: the vault's first passphrase was just set on another device. Show it as
 *   advice, empty the field, have the vault say hello so it shows `locked`, and ask for the
 *   passphrase chosen there.
 * * `close`: close the dialog, answering `declined` (a lock that won, storage out of reach, a vault
 *   gone, and any other refusal).
 * * `trouble`: misuse or a failure that is no VaultError at all, which goes to the dialog's error
 *   boundary, to be reported, and whose Close answers `declined` too.
 * * `in_flight`: a second attempt while one runs ('attempt_in_flight'), which was not tried. Do
 *   nothing: the attempt under way answers for the dialog.
 */
export type AttemptRefusalFlavor = 'in_place' | 'gate_made_elsewhere' | 'close' | 'trouble' | 'in_flight'

/** The refusals a dialog shows in place, asking again. */
const InPlaceKinds: ReadonlySet<string> = new Set(['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'absent_wayin', 'damaged_wayin', 'passkey_unavailable'])

/** What a dialog does with `err`, a refusal a gating's attempt met: see {@link AttemptRefusalFlavor}. */
export const attemptRefusalFlavor = (err: unknown): AttemptRefusalFlavor => {
  if (! isVaultError(err) || err.family === 'misuse') { return 'trouble' }
  if (err.refusalkind === 'gate_made_elsewhere') { return 'gate_made_elsewhere' }
  if (err.refusalkind === 'attempt_in_flight') { return 'in_flight' }
  return InPlaceKinds.has(err.refusalkind) ? 'in_place' : 'close'
}
