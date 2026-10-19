import { VaultError, type RefusalKind } from './errors'

/**
 * Where safebyok decides what of a foreign error rides along on the refusal it throws in that
 * error's place. A foreign error is one safebyok did not make -- a host's validator that throws, a
 * storage client's failure -- and it may quote what it was handed: a name, a sidecar, a stored
 * record, any text a user typed or pasted, a key among it. Import it whole:
 * `import { Sanitizer } from 'safebyok'`, then `Sanitizer.refusalFor(...)`.
 */

/**
 * The VaultError of `kind`, saying `message`, to throw in place of `foreign`: an error safebyok
 * did not make, which may quote what it was handed. The refusal carries nothing of `foreign` --
 * no `cause`, no text of its message, no property of it -- so nothing it quoted travels on.
 *
 * @param foreign - What was thrown, by code that is not safebyok's: a host's schema, a storage client.
 * @param kind - What went wrong, for a caller to branch on.
 * @param message - What went wrong and what to do, calmly, quoting nothing.
 * @returns The refusal, to throw.
 *
 * @example
 *   try { return await client.mutation(fnRef, args) } catch (err) {
 *     throw Sanitizer.refusalFor(err, 'storage_unavailable', "The vault's storage failed: try again shortly.")
 *   }
 */
export const refusalFor = (_foreign: unknown, kind: RefusalKind, message: string): VaultError => new VaultError(kind, message)
