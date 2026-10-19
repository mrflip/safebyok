import { isVaultError } from 'safebyok'

/**
 * What a dialog does with a refusal an ask's `attempt` met, as the Contract's *getProof* groups
 * them: `in_place`, show its message beside the field and ask again (a wrong passphrase or
 * passkey, a weak new passphrase, and the ways in that cannot answer: a way in absent or damaged,
 * a passkey the browser cannot ask); `created_elsewhere`, show it as advice, empty the field and
 * ask for the passphrase chosen on the other device; `close`, close the dialog, answering
 * `declined` (a lock that won, storage out of reach, and any other refusal); and `trouble`, misuse
 * or a failure that is no VaultError at all, which goes to the dialog's error boundary, to be
 * reported, and whose Close answers `declined` too.
 */
export type AttemptRefusalFlavor = 'in_place' | 'created_elsewhere' | 'close' | 'trouble'

/** The refusals a dialog shows in place, asking again. */
const InPlaceKinds: ReadonlySet<string> = new Set(['wrong_passphrase', 'wrong_passkey', 'weak_passphrase', 'absent_wayin', 'damaged_wayin', 'passkey_unavailable'])

/** What a dialog does with `err`, a refusal an ask's `attempt` met: see {@link AttemptRefusalFlavor}. */
export const attemptRefusalFlavor = (err: unknown): AttemptRefusalFlavor => {
  if (! isVaultError(err) || err.family === 'misuse') { return 'trouble' }
  if (err.refusalkind === 'created_elsewhere') { return 'created_elsewhere' }
  return InPlaceKinds.has(err.refusalkind) ? 'in_place' : 'close'
}
