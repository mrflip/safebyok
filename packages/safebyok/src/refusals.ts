import { VaultError, type RefusalMeta } from './errors'
import type { Capacity } from './types/types'

/** The refusals a storage adapter throws, with the core's own messages: throw these rather than copying its words.
 * Import it whole: `import { Refusals } from 'safebyok'`, then `throw Refusals.vaultMismatch()`.
 * Each maker returns the refusal for the adapter to throw. {@link unexpectedError} is the one an
 * adapter never throws: what `outcomeOf` makes of a throw that is no refusal.
 *
 * A `cause` given as null or undefined, as an aborted IndexedDB transaction can give, becomes an
 * Error saying the backend gave none. A `cause` left out leaves the refusal with none.
 */

/** What `storage_unavailable` says unless an adapter says more exactly what failed. */
export const StorageTroubleMessage = "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause."

/** A `storage_unavailable` refusal: the backend could not be reached, or failed.
 * @param cause - What the backend threw, as it came, kept for debugging. It holds only what the
 *   backend holds: ciphertext and unencrypted fields.
 * @param message - What failed, when there is more to say than that storage failed: which read or
 *   write it was, say. Never quotes a record or a name.
 *
 * @example
 *   try { return await client.query(text, params) } catch (err) { throw Refusals.storageUnavailable(err) }
 * @example throw Refusals.storageUnavailable(err, "This device's own storage failed reading its mark of this vault: try again.")
 */
export const storageUnavailable = (cause: unknown, message: string = StorageTroubleMessage): VaultError => (
  new VaultError('storage_unavailable', message, { cause: causeOf(cause) })
)

/** An `unexpected_error` refusal, `thrown` its cause: a bug, in safebyok or in a function the app handed it.
 *
 * @example unexpectedError(new TypeError("Cannot read properties of undefined (reading 'passkey')"))
 */
export const unexpectedError = (thrown: unknown): VaultError => (
  new VaultError('unexpected_error', "Something went wrong that safebyok did not expect: a bug, in safebyok or in a function the app handed it (a storage adapter, say). Nothing was retried, and a retry is unlikely to help; what was thrown is this error's cause.", { cause: thrown ?? new Error('Nothing was thrown with it.') })
)

/** Which write {@link staleWrite} refuses. A box write's is {@link staleBox}, and an update of the vault record's {@link staleVaultRecord}. */
export const StaleWriteVals = ['del'] as const
export type StaleWrite = typeof StaleWriteVals[number]

/** What each stale write says: what changed under the writer, and to read again. */
const StaleWriteSaid: Readonly<Record<StaleWrite, string>> = {
  del: 'The vault changed in storage since this device read it -- it was deleted, or deleted and made anew, elsewhere -- so this removal was refused and nothing was removed. Read the vault again before retrying.',
}

/** A `stale_write` refusal of a deletion: what it expected is no longer stored, so nothing was removed.
 * The `VaultDB` base class throws it when an adapter's deletion answers `false`, or `null` for a
 * box. An adapter that hands each call on to another VaultDB passes it on as it came.
 *
 * @example throw Refusals.staleWrite('del')
 */
export const staleWrite = (what: StaleWrite): VaultError => new VaultError('stale_write', StaleWriteSaid[what])

/** A `stale_write` refusal of a box write, carrying what is stored under its boxlabel as `meta.box_stored`. Throw it from `doPutBox`.
 * The `VaultDB` base class checks `boxStored` as `getBox` checks a record, so a caller meets a
 * box, a `BoxDamaged` or null. A `stale_write` from `doPutBox` carrying no `box_stored` is
 * refused as `corrupt_record`.
 *
 * @param boxStored - The record under the boxlabel, exactly as stored and damaged or not, read in
 *   the same atomic step that refused the write; null for none.
 *
 * @example throw Refusals.staleBox(storedRow ?? null)
 */
export const staleBox = (boxStored: unknown): VaultError => (
  // Unchecked here, as the adapter read it: the base class replaces it with the record checked.
  new VaultError('stale_write', StaleBoxMessage, { meta: { box_stored: boxStored as Exclude<RefusalMeta['box_stored'], undefined> } })
)

/** What a box write's `stale_write` says. */
export const StaleBoxMessage = "That box changed in storage since this call read it -- another call, here or on another device, wrote or removed it -- so this write was refused and nothing was written. What is stored now is this error's meta.box_stored: write again over it, or leave it."

/** A `stale_write` refusal of an update of the vault record, carrying the stored vault record as `meta.vault_stored`. Throw it from `doPutVaultRecord`.
 * The `VaultDB` base class checks `vaultStored` as `getVault` checks a vault record, so a
 * caller meets a sound vault record or null; a damaged one refuses as a read of it would. A
 * `stale_write` from `doPutVaultRecord` carrying no `vault_stored` is refused as
 * `corrupt_record`.
 *
 * @param vaultStored - The vault record exactly as stored, read in the same atomic step
 *   that refused the write; null for none.
 *
 * @example throw Refusals.staleVaultRecord(storedRow ?? null)
 */
export const staleVaultRecord = (vaultStored: unknown): VaultError => (
  // Unchecked here, as the adapter read it: the base class replaces it with the record checked.
  new VaultError('stale_write', StaleVaultRecordMessage, { meta: { vault_stored: vaultStored as Exclude<RefusalMeta['vault_stored'], undefined> } })
)

/** What an update of the vault record's `stale_write` says. */
export const StaleVaultRecordMessage = "The vault changed in storage since this device read it -- a vault unlocker was changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. What is stored now is this error's meta.vault_stored: read the vault again before retrying."

/** A `vault_mismatch` refusal of a box read or write, for a vault record that is not the one it expects. Throw it from `doGetBox` or `doPutBox`.
 * None is stored, or it has another `vault_tok`. It carries nothing of the stored record, as it
 * holds every wayin.
 *
 * @example throw Refusals.vaultMismatch()
 */
export const vaultMismatch = (): VaultError => new VaultError('vault_mismatch', VaultMismatchMessage)

/** What `vault_mismatch` says. */
const VaultMismatchMessage = "This vault was deleted, made anew, or had its key replaced on another device since this one read it, so the box was neither read nor written. Open the vault again to see what is stored now."

/** A `not_permitted` refusal: a rule of the backend's refuses the signed-in user, still the vault's own, this one call.
 * It locks nothing.
 *
 * @param message - What was refused and why, when the backend can say more. Never quotes a record.
 * @param opts - `cause`: the backend's own refusal.
 *
 * @example throw Refusals.notPermitted()
 * @example throw Refusals.notPermitted('This app keeps vaults read-only for guests: sign in with a full account to store.', { cause: err })
 */
export const notPermitted = (message = "The vault's storage does not let the signed-in user make this call. Signing in again will not help: the app's own rules decide who may.", opts?: ErrorOptions): VaultError => (
  new VaultError('not_permitted', message, optsOf(opts))
)

/** A `vault_full` refusal of a box write past a limit the backend keeps on a vault, carrying `meta.capacity`. Throw it from `doPutBox`.
 * Its message names the boxes limit when `boxes.used` has reached `boxes.max`, else the bytes
 * limit. The `VaultDB` base class refuses a `vault_full` without a sound capacity as
 * `corrupt_record`.
 *
 * @param capacity - How full the vault is, read in the same atomic step that refused the write. A
 *   `max` of `Infinity` is a limit the backend does not keep.
 * @param opts - `cause`: the backend's own refusal.
 *
 * @example throw Refusals.vaultFull({ boxes: { used: 250, max: this.maxBoxes }, bytes: { used: bytesUsed, max: Infinity } })
 * @example throw Refusals.vaultFull(capacity, { cause: backendRefusal })
 */
export const vaultFull = (capacity: Capacity, opts?: ErrorOptions): VaultError => {
  const { boxes, bytes } = capacity
  const message = boxes.used >= boxes.max
    ? `This vault holds ${String(boxes.used)} boxes, and its storage keeps at most ${String(boxes.max)} in one vault, so nothing was written: remove a box before storing another.`
    : `This vault's boxes take ${String(bytes.used)} of the ${String(bytes.max)} bytes its storage holds of one vault, leaving no room for this one, so nothing was written: remove a box, or store a smaller one.`
  return new VaultError('vault_full', message, { ...optsOf(opts), meta: { capacity } })
}

/** What `storage_blocked` says unless an adapter says more exactly what was withheld. */
export const StorageBlockedMessage = "This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so the vault's storage failed. Trying again will not help until that changes."

/** A `storage_blocked` refusal: the browser withholds storage on this device until something outside the app changes.
 * An adapter over the browser's own storage throws it for a failure {@link isStorageBlocked}
 * names, or when there is no such storage at all.
 *
 * @param message - What was withheld, and what the user may do, when there is more to say. Never
 *   quotes a record.
 * @param opts - `cause`: the browser's own error.
 *
 * @example
 *   try { return await shelf(txMode, work) } catch (err) {
 *     throw Refusals.isStorageBlocked(err) ? Refusals.storageBlocked(undefined, { cause: err }) : err
 *   }
 * @example throw Refusals.storageBlocked('This context offers no IndexedDB, so the vault has nowhere to keep its records.')
 */
export const storageBlocked = (message: string = StorageBlockedMessage, opts?: ErrorOptions): VaultError => (
  new VaultError('storage_blocked', message, optsOf(opts))
)

/** The error names a browser gives a storage refusal that lasts: withheld, no room, or no such storage. */
const BlockedStorageNames: ReadonlySet<string> = new Set(['SecurityError', 'QuotaExceededError', 'NotSupportedError'])

/** True for a browser storage failure a retry cannot mend: one named `SecurityError`, `QuotaExceededError` or `NotSupportedError`.
 * It tests the name, not the class, so a DOMException from another frame, or a plain Error of that
 * name, counts alike.
 *
 * @example Refusals.isStorageBlocked(new DOMException('The operation is insecure.', 'SecurityError'))  // true
 * @example Refusals.isStorageBlocked(new DOMException('The connection is closing.', 'InvalidStateError'))  // false
 */
export const isStorageBlocked = (err: unknown): boolean => (
  typeof err === 'object' && err !== null && 'name' in err && typeof err.name === 'string' && BlockedStorageNames.has(err.name)
)

/** What a backend that failed without an error is said to have failed with. */
const NoErrorGiven = 'The storage backend failed without giving an error.'

/** A cause as a refusal keeps it: never null or undefined. */
const causeOf = (cause: unknown): unknown => cause ?? new Error(NoErrorGiven)

/** Options as a refusal keeps them: a cause given is never null, and one left out stays out. */
const optsOf = (opts: ErrorOptions | undefined): ErrorOptions | undefined => (
  opts !== undefined && 'cause' in opts ? { cause: causeOf(opts.cause) } : undefined
)
