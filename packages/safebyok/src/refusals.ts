import { VaultError } from './errors'

/**
 * The refusals a storage adapter throws, made the one way: the core's own messages, and a
 * `cause` that is never null. An adapter throws these rather than copying the core's words, and a
 * caller branches on each one's `kind`. Import it whole: `import { Refusals } from 'safebyok'`,
 * then `throw Refusals.vaultFull(limit)`.
 *
 * A `cause` given as null or undefined -- a backend that failed without an error, as an aborted
 * IndexedDB transaction can -- becomes an Error saying so, so nothing downstream meets a null
 * cause. A cause left out leaves no `cause` at all.
 */

/** What `storage_unavailable` says unless an adapter says more exactly what failed. */
export const StorageTroubleMessage = "The vault's storage could not be reached, or failed partway: try again shortly. The storage adapter's own error is this error's cause."

/**
 * A `storage_unavailable` refusal: the backend could not be reached, or failed. `cause` is the
 * backend's own error, kept for debugging; it holds only what the backend holds, ciphertext and
 * unencrypted fields.
 *
 * @param cause - What the backend threw, as it came.
 * @param message - What failed and what to do, when there is more to say than that storage failed:
 *   which read or write it was, say. Never quotes a record or a name.
 * @returns The refusal, to throw.
 *
 * @example
 *   try { return await client.query(text, params) } catch (err) { throw Refusals.storageUnavailable(err) }
 * @example throw Refusals.storageUnavailable(err, "This device's own storage failed reading its mark of this vault: try again.")
 */
export const storageUnavailable = (cause: unknown, message: string = StorageTroubleMessage): VaultError => (
  new VaultError('storage_unavailable', message, { cause: causeOf(cause) })
)

/** What a write met that it did not expect, as {@link staleWrite} says it. */
export const StaleWriteVals = ['vaultProps', 'box', 'del'] as const
export type StaleWrite = typeof StaleWriteVals[number]

/** What each stale write says: what changed under the writer, and to read again. */
const StaleWriteSaid: Readonly<Record<StaleWrite, string>> = {
  vaultProps: 'The vault changed in storage since this device read it -- its ways in were changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying.',
  box:    'That box changed in storage since this device read it -- another device or tab wrote or removed it, or the vault was made anew -- so this write was refused and nothing was written. Read it again before retrying.',
  del:     'The vault changed in storage since this device read it -- it was deleted, or deleted and made anew, elsewhere -- so this removal was refused and nothing was removed. Read the vault again before retrying.',
}

/**
 * A `stale_write` refusal: what a write expected no longer stands, so nothing was written. The
 * base class throws it for an adapter's `false`; an adapter that hands each call on to another
 * VaultDB meets it as it is.
 *
 * @param what - The write refused: an update of the vault props, a box write, or a retirement.
 * @returns The refusal, to throw.
 *
 * @example throw Refusals.staleWrite('box')
 */
export const staleWrite = (what: StaleWrite): VaultError => new VaultError('stale_write', StaleWriteSaid[what])

/**
 * A `not_permitted` refusal: the signed-in user, still the vault's own, refused this one call by a
 * rule of the backend's. It locks nothing, and signing in again will not help.
 *
 * @param message - What was refused and why, when the backend can say more. Never quotes a record.
 * @param opts - `cause`: the backend's own refusal, when there is one.
 * @returns The refusal, to throw.
 *
 * @example throw Refusals.notPermitted()
 * @example throw Refusals.notPermitted('This app keeps vaults read-only for guests: sign in with a full account to store.', { cause: err })
 */
export const notPermitted = (message = "The vault's storage does not let the signed-in user make this call. Signing in again will not help: the app's own rules decide who may.", opts?: ErrorOptions): VaultError => (
  new VaultError('not_permitted', message, optsOf(opts))
)

/**
 * A `vault_full` refusal: a box write past a limit the backend keeps on a vault, which wrote
 * nothing. The user retires a box, or the host raises the limit where the backend allows.
 *
 * @param limit - The most boxes the backend keeps in one vault, when that is the limit met.
 * @param opts - `cause`: the backend's own refusal, when there is one.
 * @returns The refusal, to throw.
 *
 * @example throw Refusals.vaultFull(this.maxBoxes)
 * @example throw Refusals.vaultFull()  // a limit on bytes, say
 */
export const vaultFull = (limit?: number, opts?: ErrorOptions): VaultError => {
  const message = limit === undefined
    ? 'This vault is full: remove a box to make room, then try again.'
    : `This vault already holds the ${String(limit)} boxes its storage keeps in one vault: remove one before storing another.`
  return new VaultError('vault_full', message, optsOf(opts))
}

/** What `storage_blocked` says unless an adapter says more exactly what was withheld. */
export const StorageBlockedMessage = "This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so the vault's storage failed. Trying again will not help until that changes."

/**
 * A `storage_blocked` refusal: storage on this device that the browser withholds, for a reason
 * that holds until something outside the app changes, so a retry cannot mend it -- a host says
 * why rather than offering one. An adapter over the browser's own storage throws it for a failure
 * {@link isStorageBlocked} names, or for no such storage at all.
 *
 * @param message - What was withheld, and what the user may do, when there is more to say. Never
 *   quotes a record.
 * @param opts - `cause`: the browser's own error, when there is one.
 * @returns The refusal, to throw.
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

/**
 * The names a browser gives a storage refusal whose reason holds until something outside the app
 * changes: storage withheld from the page (`SecurityError`: site data blocked, a sandboxed frame),
 * no room in it (`QuotaExceededError`: a quota of zero, a full disk), or no storage of the kind at
 * all (`NotSupportedError`). Every other name may pass.
 */
const BlockedStorageNames: ReadonlySet<string> = new Set(['SecurityError', 'QuotaExceededError', 'NotSupportedError'])

/**
 * True for a failure of the browser's own storage that a retry cannot mend until something
 * outside the app changes: one named `SecurityError`, `QuotaExceededError` or
 * `NotSupportedError`. Told by name, not by class, so a DOMException from another frame, or a
 * plain Error of that name where there is no DOMException, is told alike.
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
