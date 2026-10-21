import { VaultError, type RefusalKind } from './errors'

/** What of a foreign error rides along on the refusal thrown in its place: an error safebyok did not make, which may quote a key it was handed.
 * Import it whole: `import { Sanitizer } from 'safebyok'`, then `Sanitizer.refusalFor(...)`.
 */

/** The VaultError of `kind`, saying `message`, to throw in place of `foreign`, carrying nothing of it: no `cause`, text or property.
 * @param _foreign - What code that is not safebyok's threw, such as a host's schema or a storage client.
 * @param message - What went wrong and what to do, calmly, quoting nothing.
 *
 * @example
 *   try { return await client.mutation(fnRef, args) } catch (err) {
 *     throw Sanitizer.refusalFor(err, 'storage_unavailable', "The vault's storage failed: try again shortly.")
 *   }
 */
export const refusalFor = (_foreign: unknown, kind: RefusalKind, message: string): VaultError => new VaultError(kind, message)
