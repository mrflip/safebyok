/** The rules for a refusal, its thrower and its phrase are at the top of refusals/throwers.ts.
 * A new refusalkind goes in `refusalkindVals` and in `RefusalFamilyForKind`; if the core throws it inside the Convex
 * component, in safebyok-convex's `safebyokErrorKindVals` too. GraphQL's schema takes its enum from `refusalkindVals`.
 */

import { IsVaultError, brandOf } from '../helpers/consts'
import type { Capacity } from '../shapes/shapes-storage'

// == [Kinds and families]: refusalkindVals, Refusalkind, refusalFamilyVals, RefusalFamily, RefusalFamilyForKind

/** Every refusalkind a safebyok call refuses with, in any safebyok package: storage adapters refuse with these same strings.
 * Each kind's meaning sits beside it, and its family in {@link RefusalFamilyForKind}. The families
 * are told apart by who handles them:
 *
 * * **Misuse**: a programming error, the host developer's to fix. Let it reach an error boundary
 *   or the dev overlay. Never show it to the user, and never retry it. `bad_scope`,
 *   `bad_option`, `bad_record`, `insecure_context`, `unexpected_error`, `gate_issue`, `disabled`.
 * * **Condition**: something the app handles at run time, which may reach the user: ask again,
 *   show a message, retry, or have the user free room. `vault_locked`, `wrong_passphrase`,
 *   `weak_passphrase`, `wrong_passkey`, `passkey_unavailable`,
 *   `absent_box`, `absent_vault`, `absent_wayin`, `box_too_large`, `vault_full`,
 *   `stale_write`, `record_conflict`, `storage_unavailable`, `storage_blocked`, `gate_made_elsewhere`,
 *   `vault_gone`, `vault_reborn`, `gating_concluded`, `attempt_in_flight`, `already_asking`, `dismissed`,
 *   `same_passphrase`, `camped`, `vault_empty`.
 * * **Bad news**: something the app is told whether or not the call was refused, and may show
 *   the user. `damaged_whisper`, `damaged_lease`, `newer_format`,
 *   `identity_revoked`, `damaged_row`, `damaged_vault`, `storage_issue`.
 *
 * A record that fails its checks is named for its direction. One read from storage that fails them
 * is `damaged_row`, on the way out. A damaged row never indicates format drift: it is thrown by the
 * vaultDB tied to the datastore. One handed in is `bad_option`, on the way in; `bad_record` where one
 * check serves both ways. A whisper that will not decipher under the lease in hand, or deciphers to no
 * whisper, is `damaged_whisper`, Zod's own error its `cause` where a check failed. A storage
 * adapter's answer that cannot be, one revision under two toks or a world row failing its checks
 * say, is `record_conflict`.
 *
 * `wrong_passphrase` and `wrong_passkey` are all a vault can tell even when the stored vault was
 * altered, since decryption fails alike; the message says so.
 */
export const refusalkindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'weak_passphrase',     // a new passphrase the vault's strengthChecker finds too easy to guess
  'wrong_passkey',       // the passkey's answer did not unlock the vault, or was for another salt
  'passkey_unavailable', // no passkey answer is to be had here: the browser offers no WebAuthn, the authenticator no PRF, or the browser failed to ask
  'absent_box',          // no box under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'absent_wayin',        // the vault has no passkey, and one was asked for: to unlock with, or to remove
  'bad_scope',           // a name in a scope -- a label, or the user_id -- that fails its check
  'box_too_large',       // a box -- whisper, names and sidecar together -- over what storage allows in one record
  'vault_full',          // a new box in a vault already at its maxBoxes (a best-effort cap), or a write storage has no room for
  'bad_option',          // an option, argument or record handed in that fails its check: Bank.make's, makeArgon2idDeriver's, a vaultDB verb's, a putBox()'s sidecar
  'bad_record',          // a record that fails a check serving both ways, a record handed in and one read back
  'damaged_whisper',     // a box's whisper would not decipher under the vault's lease, or deciphered to no whisper this package knows
  'newer_format',        // a stored wayin naming a key deriver this handle was not built with: update safebyok
  'insecure_context',    // the page is not a secure context (plain http), where the browser withholds WebCrypto
  'unexpected_error',    // something threw that is no refusal: a bug, in safebyok or in a function the app handed it
  'stale_write',         // storage changed since this device read it, so the write was refused
  'record_conflict',     // storage answered what cannot be: one revision under two toks, a record of another vault_tok than this device has, a world row failing its checks, a put that answered nothing; a fetch again is worth one try, and if it remains the system is fundamentally not working
  'identity_revoked',    // the storage backend no longer serves the user this vault was opened for: signed out, or another user signed in
  'storage_unavailable', // the storage backend could not be reached, or failed: a retry may mend it; its own error is the cause
  'storage_blocked',     // the browser withholds its storage from this page -- site data blocked, a private window, IndexedDB switched off: a retry will not mend it
  'storage_issue',       // the storage backend answered with a row no working store could: no object at all, or naming another address than the one asked: the database is so broken we just can't, and a retry is unlikely to help
  'vault_gone',          // the vault a call was working on is no longer stored: deleted, here or elsewhere
  'vault_reborn',        // a live vault stands where the call's vault stood, under another vault_tok than the call has: expected, and the vault is read again by its scope
  'gating_concluded',    // an attempt under way was for a prompt that ended meanwhile -- it was answered or dismissed -- so it unlocked nothing
  'damaged_lease',       // this device's lease would not unwrap under its leaseKey: it was forgotten, and the vault locked
  'attempt_in_flight',   // a gating's attempt was made while another of its attempts was under way, so it was not tried
  'already_asking',      // a gating is open on this bank, so a second one was not launched: one dialog at a time, and no join
  'dismissed',           // the dialog was dismissed with no attempt under way, so nothing was done
  'gate_made_elsewhere', // another device or tab made this vault first, so the passphrase just typed was not set and nothing was changed
  'same_passphrase',     // a new passphrase that is the one the vault already has
  'camped',              // a vaultDB put told not to replace a live row found one there
  'vault_empty',         // a vaultDB call named a vault_tok no row has, and no live row stands there: nothing of this life
  'damaged_row',         // a row read from storage failed its checks, on the way out, and is set aside
  'damaged_vault',       // the vault row stored above a box asked for failed its checks, as the classifier of notes/answer-contract.md found it
  'gate_issue',          // a vaultDB gate verb whose params disagree with the stored row: its registered_at
  'disabled',            // a call on a bank, a listing or a thing of theirs no longer enabled, since a sweep, a vacate or a delete: it answers nothing more
] as const
export type Refusalkind = typeof refusalkindVals[number]

/** The three families a refusalkind belongs to, told apart by who handles it, as {@link refusalkindVals} describes them. */
export const refusalFamilyVals = ['misuse', 'condition', 'bad_news'] as const
export type RefusalFamily = typeof refusalFamilyVals[number]

/** The family of each refusalkind in {@link refusalkindVals}, which a VaultError's `family` is read from. */
export const RefusalFamilyForKind = {
  vault_locked:        'condition',
  wrong_passphrase:    'condition',
  weak_passphrase:     'condition',
  wrong_passkey:       'condition',
  passkey_unavailable: 'condition',
  absent_box:          'condition',
  absent_vault:        'condition',
  absent_wayin:        'condition',
  bad_scope:           'misuse',
  box_too_large:       'condition',
  vault_full:          'condition',
  bad_option:          'misuse',
  bad_record:          'misuse',
  damaged_whisper:     'bad_news',
  newer_format:        'bad_news',
  insecure_context:    'misuse',
  unexpected_error:    'misuse',
  stale_write:         'condition',
  record_conflict:     'condition',
  identity_revoked:    'bad_news',
  storage_unavailable: 'condition',
  storage_blocked:     'condition',
  storage_issue:       'bad_news',
  vault_gone:          'condition',
  vault_reborn:        'condition',
  gating_concluded:    'condition',
  damaged_lease:       'bad_news',
  attempt_in_flight:   'condition',
  already_asking:      'condition',
  dismissed:           'condition',
  gate_made_elsewhere: 'condition',
  same_passphrase:     'condition',
  camped:              'condition',
  vault_empty:         'condition',
  damaged_row:         'bad_news',
  damaged_vault:       'bad_news',
  gate_issue:          'misuse',
  disabled:            'misuse',
} as const satisfies Readonly<Record<Refusalkind, RefusalFamily>>
// --

// == [The error]: RefusalMeta, VaultErrorOpts, VaultError

/** The facts a refusal learned, each under its own name, filled only by the refusals that name it.
 * Records are as stored, ciphertext and visible fields, never secret material.
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
  /** A vaultDB's refusal: what it carries of its ask, a `LoggableAsk`: its address, policies and revisions, never a record's payload. */
  ask?:          Readonly<Record<string, unknown>>
}

/** The rows `err` hands a vaultDB's answer, empty where it has none. */
export function rowsOfRefusal(err: VaultError): RefusalRows { return (err as unknown as Record<symbol, RefusalRows | undefined>)[RowsOfRefusal] ?? {} }

/** The options of a VaultError beside its refusalkind and message: the `cause` behind it, and its `meta`. */
export type VaultErrorOpts = ErrorOptions & { meta?: RefusalMeta, rows?: RefusalRows }

/** The rows a vaultDB's refusal hands its answer: the vault row as read in the step that refused, and the row stored where the write was aimed, or null for none. */
export type RefusalRows = { world?: unknown, dbhas?: unknown }

// A Symbol.for and not enumerable, so the rows reach the answer from whichever copy of safebyok, and never a log: they hold wrapped keys.
const RowsOfRefusal = Symbol.for('safebyok.refusal.rows')

/** Every refusal a safebyok call makes: a calm message, a `refusalkind` to branch on, and its `family`.
 * It never carries a whisper, a passphrase or any other secret material: not in the message, the
 * `cause`, the `meta`, or any other property.
 *
 * @example
 *   const { ok, val, err } = await vaultDB.tryGetVault(scope)
 *   if (! ok && err.family === 'misuse') { throw err }
 */
export class VaultError extends Error {
  /** The kind of refusal, from {@link refusalkindVals}: what went wrong. */
  readonly refusalkind:  Refusalkind
  /** Who handles it, read from {@link RefusalFamilyForKind}. */
  readonly family:       RefusalFamily
  /** The facts the refusal learned, when it learned any. */
  declare readonly meta?: RefusalMeta

  /** A refusal of `refusalkind`, its family read from {@link RefusalFamilyForKind}.
   * @param message - What went wrong and what to do, calmly, for a non-expert. Never quotes secret material.
   * @param opts - `cause`, the lower-level failure kept for debugging, and `meta`. Neither may contain secret material.
   */
  constructor(refusalkind: Refusalkind, message: string, opts?: VaultErrorOpts) {
    const { meta, rows, ...errorOpts } = opts ?? {}
    super(message, errorOpts)
    this.name = 'VaultError'
    this.refusalkind = refusalkind
    this.family = RefusalFamilyForKind[refusalkind]
    if (meta !== undefined) { this.meta = meta }
    if (rows !== undefined) { Object.defineProperty(this, RowsOfRefusal, { value: rows }) }
  }

  /** Answers true, which marks a VaultError to {@link isVaultError}, from whichever copy of safebyok made it. */
  get [IsVaultError](): true { return true }
}
// --

// == [What a refusal keeps of a thrown]: Thrown, listedKindOf, thrownNameOf

/** What a `catch` binds: anything at all, since JavaScript lets any value be thrown. */
export type Thrown = unknown

/** The refusalkind of `thrown` when it is a VaultError whose kind is one of {@link refusalkindVals}, or null: all a log may say of what a host function that heard the passphrase threw.
 * A kind off the list is the thrower's own text, and may quote what it heard.
 *
 * @example listedKindOf(new Error('no luck with hunter2'))  // null
 */
export function listedKindOf(thrown: unknown): Refusalkind | null {
  return isVaultError(thrown) && (refusalkindVals as readonly string[]).includes(thrown.refusalkind) ? thrown.refusalkind : null
}

/** The string `name` of `thrown` when it is an object carrying one, else null: all a refusal keeps of an error it replaces.
 * An Error's or a DOMException's is its class name; a host's own error carries whatever name the
 * host gave it, kept as it is.
 *
 * @example thrownNameOf(new DOMException('No room.', 'QuotaExceededError'))  // 'QuotaExceededError'
 */
export function thrownNameOf(thrown: unknown): string | null {
  return typeof thrown === 'object' && thrown !== null && 'name' in thrown && typeof thrown.name === 'string' ? thrown.name : null
}
// --

// == [Guards]: isVaultError, isCondition

/** True when `err` is a VaultError, of `refusalkind` when one is given: the one test for a refusal.
 * A VaultError from a second copy of safebyok loaded beside this one (an ESM and a CJS build side
 * by side) is one. An error that only calls itself `VaultError` (one rebuilt from a server's JSON,
 * say) is not.
 *
 * @example
 *   try { await box.extractWhisper() } catch (err) {
 *     if (isVaultError(err, 'vault_locked')) { promptForPassphrase() }
 *   }
 */
export const isVaultError = (err: unknown, refusalkind?: Refusalkind): err is VaultError => (
  brandOf(err, IsVaultError) === true && (refusalkind === undefined || (err as VaultError).refusalkind === refusalkind)
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
export function isCondition(err: unknown): err is VaultError {
  return isVaultError(err) && err.family !== 'misuse'
}
// --
