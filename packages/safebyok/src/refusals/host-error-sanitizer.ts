/** The refusal to throw in place of a foreign throw: one safebyok did not make, which may quote a secret it was handed.
 * Import it whole: `import { HostErrorSanitizer } from 'safebyok'`, then `HostErrorSanitizer.refusalFor(...)`.
 * Call it from a catch that holds what a host's function threw after hearing the passphrase (a
 * `keyDeriver`, `strengthChecker`, `requestCleartext` or a dialog's `passphraseAdvice`), or what
 * a storage client threw, which may quote the call it was handed.
 */

import { VaultError, type RefusalKind } from './errors'

/** The VaultError of `kind`, saying `message`, to throw in place of `foreign`, carrying nothing of it: no `cause`, text, meta or property.
 * Nothing of `foreign` is read, so a throw whose getters throw as they are read, or whose
 * message quotes the passphrase, is as safe to hand in as any other. What may be said of it is
 * decided before the call, from safebyok's own closed lists alone: a log line saying that a host's
 * function threw, with the kind `listedKindOf` tells of it, say.
 *
 * @param _foreign - What code that is not safebyok's threw: a host function that heard the passphrase, or a storage client whose error may quote the call.
 * @param message - What went wrong and what to do, calmly, quoting nothing.
 *
 * @example
 *   try { handed = await keyDeriver.deriveKeyBytes(passphrase, saltBytes) } catch (err) {
 *     throw HostErrorSanitizer.refusalFor(err, 'unexpected_error', 'The keyDeriver handed to Bank.make threw rather than deriving a key. What it threw is left out of this report, as the deriver hears the passphrase.')
 *   }
 * @example
 *   try { return await client.mutation(fnRef, args) } catch (err) {
 *     throw HostErrorSanitizer.refusalFor(err, 'storage_unavailable', "The vault's storage failed: try again shortly.")
 *   }
 */
export const refusalFor = (_foreign: unknown, kind: RefusalKind, message: string): VaultError => new VaultError(kind, message)
