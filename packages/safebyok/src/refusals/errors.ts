import type { Capacity } from '../shapes/shapes-storage'

// == [Kinds and families]: refusalKindVals, RefusalKind, refusalFamilyVals, RefusalFamily, RefusalFamilyForKind

/** Every refusalkind a safebyok call refuses with, in any safebyok package: storage adapters refuse with these same strings.
 * Each kind's meaning sits beside it, and its family in {@link RefusalFamilyForKind}. The families
 * are told apart by who handles them:
 *
 * * **Misuse**: a programming error, the host developer's to fix. Let it reach an error boundary
 *   or the dev overlay. Never show it to the user, and never retry it. `bad_scope`,
 *   `bad_option`, `bad_record`, `insecure_context`, `unexpected_error`, `gate_issue`, `disabled`.
 * * **Condition**: something the app handles at run time, which may reach the user: ask again,
 *   show a message, retry, or have the user free room. `vault_locked`, `wrong_passphrase`,
 *   `weak_passphrase`, `wrong_passkey`,
 *   `absent_box`, `absent_vault`, `absent_wayin`, `box_too_large`, `vault_full`,
 *   `stale_write`, `record_conflict`, `storage_unavailable`,
 *   `vault_gone`, `vault_remade`, `gating_landed`, `attempt_in_flight`, `already_asking`, `locked_while_asking`, `declined`,
 *   `same_passphrase`, `camped`, `vault_empty`.
 * * **Bad news**: something the app is told whether or not the call was refused, and may show
 *   the user. `damaged_box`, `damaged_lease`, `newer_format`,
 *   `identity_revoked`, `damaged_row`.
 *
 * A record that fails its checks is named for its direction, by a VaultDB and a vault alike. One
 * read from storage that fails them is `damaged_row`, on the way out, and a box that will not open
 * under the lease in hand is `damaged_box`, Zod's own error its `cause` where a check failed. One
 * handed in is `bad_option`, on the way in; `bad_record` where one check serves both ways. A
 * storage adapter's answer that cannot be, one revision under two toks say, is `record_conflict`.
 *
 * `wrong_passphrase` and `wrong_passkey` are all a vault can tell even when the stored vault was
 * altered, since decryption fails alike; the message says so.
 */
export const refusalKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'weak_passphrase',     // a new passphrase the vault's strengthChecker finds too easy to guess
  'wrong_passkey',       // the passkey's answer did not unlock the vault, or was for another salt
  'absent_box',          // no box under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'absent_wayin',        // the vault has no passkey, and one was asked for: to unlock with, or to remove
  'bad_scope',           // a name in a scope -- a label, or the user_id -- that fails its check
  'box_too_large',       // a box -- whisper, names and sidecar together -- over what storage holds in one record
  'vault_full',          // a new box in a vault already holding its maxBoxes, or a write storage has no room for
  'bad_option',          // an option, argument or record handed in that fails its check: Bank.make's, argon2idDeriver's, a vaultDB verb's, a putBox()'s sidecar
  'bad_record',          // a record that fails a check serving both ways, a record handed in and one read back
  'damaged_box',         // a box read from storage failed its checks, or would not open under the vault's own vaultKey, or names no revision to store over
  'newer_format',        // a stored vault in a form this version does not know, or naming a key deriver this handle was not built with: update safebyok
  'insecure_context',    // the page is not a secure context (plain http), where the browser withholds WebCrypto
  'unexpected_error',    // something threw that is no refusal: a bug, in safebyok or in a function the app handed it
  'stale_write',         // storage changed since this device read it, so the write was refused
  'record_conflict',     // storage answered what cannot be: one revision under two toks, a record of another scope or another vault_tok, a put that answered nothing; a fetch again is worth one try, and if it persists the system is fundamentally not working
  'identity_revoked',    // the storage backend no longer serves the user this vault was opened for: signed out, or another user signed in
  'storage_unavailable', // the storage backend could not be reached, or failed: a retry may mend it; its own error is the cause
  'vault_gone',          // the vault a call was working on is no longer stored: deleted, here or elsewhere
  'vault_remade',        // the vault a call was working on was deleted and made anew, under another vault_tok: a live vault stands where it stood
  'gating_landed',       // a proof under way was for a prompt that ended meanwhile -- a lock landed, or it was answered -- so it unlocked nothing
  'damaged_lease',       // this device's lease would not open under its leaseKey: it was erased, and the vault locked
  'attempt_in_flight',   // a gating's attempt was made while another of its attempts was under way, so it was not tried
  'already_asking',      // a gating is open on this bank, so a second one was not launched: one dialog at a time, and no join
  'locked_while_asking', // a lock landed before the user's attempt, so the gating settled and nothing was proved
  'declined',            // the dialog was declined, or closed with no attempt under way, so nothing was done
  'same_passphrase',     // a new passphrase that is the one the vault already has
  'camped',              // a vaultDB put told not to replace a live row found one there
  'vault_empty',         // a vaultDB call named a vault_tok no row holds, and no live row stands there: nothing of this life
  'damaged_row',         // a row read from storage failed its checks, on the way out, and is set aside
  'gate_issue',          // a vaultDB gate verb whose params fail the integrity checks against the stored row
  'disabled',            // a call on an object let go by a sweep, a vacate or a delete: it answers nothing more, and the bank has a fresh one
] as const
export type RefusalKind = typeof refusalKindVals[number]

/** The three families a refusalkind belongs to, told apart by who handles it, as {@link refusalKindVals} describes them. */
export const refusalFamilyVals = ['misuse', 'condition', 'bad_news'] as const
export type RefusalFamily = typeof refusalFamilyVals[number]

/** The family of each refusalkind in {@link refusalKindVals}, which a VaultError's `family` is read from.
 *
 * @example RefusalFamilyForKind.bad_option           // 'misuse'
 * @example RefusalFamilyForKind.bad_record           // 'misuse'
 * @example RefusalFamilyForKind.storage_unavailable  // 'condition'
 * @example RefusalFamilyForKind.damaged_box          // 'bad_news'
 */
export const RefusalFamilyForKind = {
  vault_locked:        'condition',
  wrong_passphrase:    'condition',
  weak_passphrase:     'condition',
  wrong_passkey:       'condition',
  absent_box:          'condition',
  absent_vault:        'condition',
  absent_wayin:        'condition',
  bad_scope:           'misuse',
  box_too_large:       'condition',
  vault_full:          'condition',
  bad_option:          'misuse',
  bad_record:          'misuse',
  damaged_box:         'bad_news',
  newer_format:        'bad_news',
  insecure_context:    'misuse',
  unexpected_error:    'misuse',
  stale_write:         'condition',
  record_conflict:     'condition',
  identity_revoked:    'bad_news',
  storage_unavailable: 'condition',
  vault_gone:          'condition',
  vault_remade:        'condition',
  gating_landed:       'condition',
  damaged_lease:       'bad_news',
  attempt_in_flight:   'condition',
  already_asking:      'condition',
  locked_while_asking: 'condition',
  declined:            'condition',
  same_passphrase:     'condition',
  camped:              'condition',
  vault_empty:         'condition',
  damaged_row:         'bad_news',
  gate_issue:          'misuse',
  disabled:            'misuse',
} as const satisfies Readonly<Record<RefusalKind, RefusalFamily>>
// --

// == [The error]: RefusalMeta, VaultErrorOpts, VaultError

/** The facts a refusal learned, each under its own name, filled only by the refusals that name it.
 * Records are as storage holds them, ciphertext and visible fields, never secret material.
 */
export type RefusalMeta = {
  /** `vault_full` from storage: how full the vault is, read in the step that refused the write.
   * Always there on storage's own `vault_full`. Never on the vault's, which refuses from
   * `vault.snapshot.capacity` before storage is asked.
   */
  capacity?:     Capacity
  /** A refusal by a validator: the path of each failing field it names, so a form can mark each one. A step that may be the caller's data is not repeated. */
  fieldnames?:   readonly string[]
  /** A vaultDB's refusal: the verb that refused. */
  call?:         string
  /** A vaultDB's refusal: what happened, when it is not said by the refusalkind alone. */
  act?:          string
  /** A vaultDB's refusal: the vault row as read in the step that refused. */
  world?:        unknown
  /** A vaultDB's refusal: the row stored where the write was aimed, or null for none. */
  dbhas?:        unknown
  /** A vaultDB's refusal: the request's scope, vault_tok and other safe metadata. */
  req_params?:   Readonly<Record<string, unknown>>
}

/** The options of a VaultError beside its refusalkind and message: the `cause` behind it, and its `meta`. */
export type VaultErrorOpts = ErrorOptions & { meta?: RefusalMeta }

/** Every refusal a safebyok call makes: a calm message, a `refusalkind` to branch on, and its `family`.
 * It never carries a whisper, a passphrase or any other secret material: not in the message, the
 * `cause`, the `meta`, or any other property.
 *
 * @example
 *   try { await vault.getWhisper('ANTHROPIC_API_KEY') } catch (err) {
 *     if (isVaultError(err, 'vault_locked')) { promptForPassphrase() }
 *   }
 * @example
 *   const { ok, val, err } = await vaultDB.tryGetVault(scope)
 *   if (! ok && err.family === 'misuse') { throw err }
 */
export class VaultError extends Error {
  /** The kind of refusal, from {@link refusalKindVals}: what went wrong. */
  readonly refusalkind:  RefusalKind
  /** Who handles it, read from {@link RefusalFamilyForKind}. */
  readonly family:       RefusalFamily
  /** The facts the refusal learned, when it learned any. */
  declare readonly meta?: RefusalMeta

  /** A refusal of `refusalkind`, its family read from {@link RefusalFamilyForKind}.
   * @param message - What went wrong and what to do, calmly, for a non-expert. Never quotes secret material.
   * @param opts - `cause`, the lower-level failure kept for debugging, and `meta`. Neither may hold secret material.
   */
  constructor(refusalkind: RefusalKind, message: string, opts?: VaultErrorOpts) {
    const { meta, ...errorOpts } = opts ?? {}
    super(message, errorOpts)
    this.name = 'VaultError'
    this.refusalkind = refusalkind
    this.family = RefusalFamilyForKind[refusalkind]
    if (meta !== undefined) { this.meta = meta }
  }
}
// --

// == [What a refusal keeps of a thrown]: listedKindOf, thrownNameOf

/** The refusalkind of `thrown` when it is a VaultError whose kind is one of {@link refusalKindVals}, or null: all a log may say of what a host function that heard the passphrase threw.
 * A kind off the list is the thrower's own text, and may quote what it heard.
 *
 * @example listedKindOf(new VaultError('storage_unavailable', 'The word list would not load.'))  // 'storage_unavailable'
 * @example listedKindOf(new Error('no luck with hunter2'))  // null
 */
export const listedKindOf = (thrown: unknown): RefusalKind | null => (
  isVaultError(thrown) && (refusalKindVals as readonly string[]).includes(thrown.refusalkind) ? thrown.refusalkind : null
)

/** The string `name` of `thrown` when it is an object carrying one, else null: all a refusal keeps of an error it replaces.
 * An Error's or a DOMException's is its class name; a host's own error carries whatever name the
 * host gave it, kept as it is until a redact lands.
 *
 * @example thrownNameOf(new DOMException('No room.', 'QuotaExceededError'))  // 'QuotaExceededError'
 * @example thrownNameOf('a bare string')  // null
 */
export const thrownNameOf = (thrown: unknown): string | null => (
  typeof thrown === 'object' && thrown !== null && 'name' in thrown && typeof thrown.name === 'string' ? thrown.name : null
)
// --

// == [Guards]: isVaultError, isCondition

/** True when `err` is a VaultError, of `refusalkind` when one is given: the one test for a refusal.
 * It is an `instanceof` test. An error that only calls itself `VaultError` (one rebuilt from a
 * server's JSON, say) is not one. Nor is a VaultError from a second copy of safebyok loaded beside
 * this one, as an ESM and a CJS build side by side.
 *
 * @example
 *   try { await vault.getWhisper('ANTHROPIC_API_KEY') } catch (err) {
 *     if (isVaultError(err, 'vault_locked')) { promptForPassphrase() }
 *   }
 */
export const isVaultError = (err: unknown, refusalkind?: RefusalKind): err is VaultError => (
  err instanceof VaultError && (refusalkind === undefined || err.refusalkind === refusalkind)
)

/** True when `err` is a VaultError the app may show the user, or retry: a `condition` or `bad_news`.
 * Misuse, and anything that is not a VaultError, is false, and belongs with an error boundary.
 *
 * @example
 *   try { await vault.putBox(boxlabel, whisper) } catch (err) {
 *     if (! isCondition(err)) { throw err }
 *     showGripe(err.message)
 *   }
 */
export const isCondition = (err: unknown): err is VaultError => (
  isVaultError(err) && err.family !== 'misuse'
)
// --
