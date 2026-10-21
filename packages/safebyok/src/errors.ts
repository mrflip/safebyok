import type { BoxRecord } from './box'
import type { Capacity, DamagedBox, WayinSummary } from './types'

/** Every refusalkind a safebyok call refuses with, in any safebyok package: storage adapters refuse with these same strings.
 * Each kind belongs to one family ({@link RefusalFamilyForKind}), told apart by who handles it:
 *
 * - **Misuse**: a programming error, the host developer's to fix. `bad_label`, `bad_whisper`,
 *   `bad_option`, `bad_record`, `invalid_box`, `vault_closed`, `unknown_key_deriver`,
 *   `insecure_context`, `unexpected_error`. Let it reach an error boundary or the dev overlay.
 *   Never show it to the user, and never retry it.
 * - **Condition**: something the app handles at run time, which may reach the user: ask again,
 *   show a message, retry, or have the user free room. `vault_locked`, `wrong_passphrase`,
 *   `created_elsewhere`, `weak_passphrase`, `wrong_passkey`, `passkey_unavailable`, `absent_box`,
 *   `absent_vault`, `absent_wayin`, `whisper_too_large`, `box_too_large`, `vault_full`,
 *   `corrupt_record`, `stale_write`, `vault_mismatch`, `not_permitted`, `storage_unavailable`,
 *   `storage_blocked`.
 * - **Bad news**: something the app is told whether or not the call was refused, and may show
 *   the user. `damaged_vault`, `damaged_wayin`, `damaged_box`, `newer_format`, `rolled_back`,
 *   `identity_revoked`.
 *
 * Each kind's one-line meaning sits beside it below. These need more:
 *
 * - `vault_full` means a new box in a vault already holding its `maxBoxes`, or a box past the
 *   room the vault reckons storage holds of one vault. Storage refuses it too, at its own limit.
 *   Either way the user deletes a box, or the host raises `maxBoxes` where the backend allows.
 * - `whisper_too_large`: the whisper with its sidecar over `maxWhisperBytes`. `box_too_large`: the
 *   whisper and sidecar together over what storage holds in one record.
 * - `bad_label`: a label the app passed that fails the vault's check. Check a label the user types
 *   first, with `Label` or the host's own `validators.boxlabel`.
 * - `identity_revoked`: storage no longer serves the user this vault was opened for (signed out,
 *   or another user signed in). The vault locks as it refuses. The user signs in again, and the
 *   host opens the vault for whoever that is.
 * - `not_permitted`: the signed-in user, still the vault's own, is refused one call. Signing in
 *   again will not help.
 * - `corrupt_record`: storage's word for a record that failed its checks as it read back. The
 *   vault reports what that means as one of the `damaged_` kinds.
 * - `wrong_passphrase`, `wrong_passkey`: the proof did not open its wayin. That is all the vault
 *   can tell even when the stored vault was altered, since decryption fails alike; the message
 *   says so. A blank passphrase offered as proof is `wrong_passphrase` too.
 * - `created_elsewhere`: a first unlock found the vault just made on another device, under another
 *   passphrase. Nothing was created here, and the vault shows `locked` as the other device made it.
 *   The user enters the passphrase chosen there. A passphrase that opens it unlocks with no refusal.
 * - `weak_passphrase`: a new passphrase (the one a vault is created with, or one `putWayin()`
 *   sets) that the `strengthChecker` finds too easy to guess, or a blank one. Its message is the
 *   checker's reason, fit to show beside the field. `unlock()` of a standing vault never raises it.
 * - `insecure_context`: a page served over plain http (anywhere but localhost), where the browser
 *   withholds WebCrypto. The host serves it over https.
 * - `newer_format`: a stored vault in a form this version does not know, perhaps written by a newer
 *   safebyok. The user updates the app, never starts over, and nothing deletes it.
 * - `rolled_back`: storage handed back older vault props than this device has seen (a backup
 *   restored over it, or tampering). The vault takes nothing from them, writes nothing over them,
 *   and locks. Only a device whose own storage still holds the mark of the newer props can tell.
 * - `storage_unavailable`: a storage failure a retry may mend. A backend out of reach, an aborted
 *   transaction, a closed connection, or a browser error naming no lasting cause
 *   (`InvalidStateError`, `UnknownError`).
 * - `storage_blocked`: this device's own store (its deviceDB, or a vault kept on the device)
 *   refuses until something outside the app changes. That is site data blocked, a sandboxed frame
 *   or cookies off (`SecurityError`); no room (`QuotaExceededError`, as from a private window's
 *   zero quota or a full disk); or no IndexedDB (`NotSupportedError`). A private window with room
 *   is no block. Stop offering a retry: tell the user why. The host may reopen the vault with
 *   `memoryDeviceDB`, which remembers no unlock on this device.
 * - `vault_mismatch`: from a `VaultDB.putBox` called directly, a box sealed for vault props
 *   that no longer stand (the vault deleted, remade under another `vault_id`, or its vaultKey
 *   replaced). Nothing was written, and the device that sealed it is out of date.
 * - `invalid_box`: from a `VaultDB.putBox` called directly, a box this package would not
 *   build, or sealed under another vaultKey than its expectation names. It is refused before
 *   storage sees it. A vault reports the same as `bad_record`, since it built the box.
 *
 * The package README's *Errors* section says what each kind means and what to do about it.
 */
export const RefusalKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'created_elsewhere',   // a first unlock found the vault just made on another device, under another passphrase
  'weak_passphrase',     // a new passphrase the vault's strengthChecker finds too easy to guess
  'wrong_passkey',       // the passkey's answer did not unlock the vault, or was for another salt
  'passkey_unavailable', // this browser or authenticator cannot answer for a passkey unlock (no WebAuthn, or no PRF)
  'absent_box',          // no box under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'absent_wayin',        // the vault has no passkey, and one was asked for: to unlock with, or to remove
  'bad_label',           // a label, or the userId, that fails the vault's check for it
  'bad_whisper',         // a whisper JSON cannot carry (undefined, a function, a class), or a non-string
  'whisper_too_large',   // a whisper, with its box's sidecar, over the vault's maxWhisperBytes
  'box_too_large',       // a box -- whisper, names and sidecar together -- over what storage holds in one record
  'vault_full',          // a new box in a vault already holding its maxBoxes, or a write storage has no room for
  'bad_option',          // an option or argument out of its range: Vault.make's, mask's, argon2idDeriver's, a putBox()'s sidecar
  'bad_record',          // a record or expectation handed to a VaultDB verb that is not one this package builds
  'invalid_box',         // a box handed to a VaultDB's putBox that is not one this package builds, or not for its expectation
  'vault_closed',        // the vault handle was closed and cannot be used again
  'corrupt_record',      // a stored record failed validation as storage read it back
  'damaged_vault',       // the vault's stored props failed their checks, so no way in can be tried
  'damaged_wayin',       // a way in is stored in a form this package never writes, so it cannot be tried
  'damaged_box',         // a box failed its checks, or would not open under the vault's own vaultKey, or names no revision to store over
  'newer_format',        // a stored vault in a form this version does not know, which a newer one may have written
  'unknown_key_deriver', // the vault names a key deriver this handle was not built with
  'insecure_context',    // the page is not a secure context (plain http), where the browser withholds WebCrypto
  'unexpected_error',    // something threw that is no refusal: a bug, in safebyok or in a function the app handed it
  'stale_write',         // storage changed since this device read it, so the write was refused
  'vault_mismatch',      // a box write's vault props are not the ones standing -- another vault_id, vaultKey epoch, or none -- so it was refused
  'rolled_back',         // storage handed back an older copy of the vault than this device has seen, which it refuses to use
  'not_permitted',       // the storage backend refused the signed-in user this call: not theirs to make
  'identity_revoked',    // the storage backend no longer serves the user this vault was opened for: signed out, or another user signed in
  'storage_unavailable', // the storage backend could not be reached, or failed: a retry may mend it
  'storage_blocked',     // this device's own store refuses until something outside the app changes: storage blocked, or no room
] as const
export type RefusalKind = typeof RefusalKindVals[number]

/** The three families a refusalkind belongs to, told apart by who handles it, as {@link RefusalKindVals} describes them. */
export const RefusalFamilyVals = ['misuse', 'condition', 'bad_news'] as const
export type RefusalFamily = typeof RefusalFamilyVals[number]

/** The family of each refusalkind in {@link RefusalKindVals}, which a VaultError's `family` is read from.
 *
 * @example RefusalFamilyForKind.bad_option           // 'misuse'
 * @example RefusalFamilyForKind.bad_record           // 'misuse'
 * @example RefusalFamilyForKind.storage_unavailable  // 'condition'
 * @example RefusalFamilyForKind.damaged_box          // 'bad_news'
 */
export const RefusalFamilyForKind = {
  vault_locked:        'condition',
  wrong_passphrase:    'condition',
  created_elsewhere:   'condition',
  weak_passphrase:     'condition',
  wrong_passkey:       'condition',
  passkey_unavailable: 'condition',
  absent_box:          'condition',
  absent_vault:        'condition',
  absent_wayin:        'condition',
  bad_label:           'misuse',
  bad_whisper:         'misuse',
  whisper_too_large:   'condition',
  box_too_large:       'condition',
  vault_full:          'condition',
  bad_option:          'misuse',
  bad_record:          'misuse',
  invalid_box:         'misuse',
  vault_closed:        'misuse',
  corrupt_record:      'condition',
  damaged_vault:       'bad_news',
  damaged_wayin:       'bad_news',
  damaged_box:         'bad_news',
  newer_format:        'bad_news',
  unknown_key_deriver: 'misuse',
  insecure_context:    'misuse',
  unexpected_error:    'misuse',
  stale_write:         'condition',
  vault_mismatch:      'condition',
  rolled_back:         'bad_news',
  not_permitted:       'condition',
  identity_revoked:    'bad_news',
  storage_unavailable: 'condition',
  storage_blocked:     'condition',
} as const satisfies Readonly<Record<RefusalKind, RefusalFamily>>

/** What a refusal learned, each fact under its own name, filled only by the refusals that name it.
 * Records are as storage holds them, ciphertext and visible fields, never secret material.
 */
export type RefusalMeta = {
  /** `stale_write` from a box write: what stands under the boxlabel, read in the step that refused.
   * It is the winning box's whole record, so the caller can open it or write over it with no second
   * read. It is a {@link DamagedBox} when what stands does not read back as a box, and null when
   * nothing stands there.
   */
  box_stored?:   BoxRecord | DamagedBox | null
  /** `vault_full` from storage: how full the vault is, read in the step that refused the write.
   * Always there on storage's own `vault_full`. Never on the vault's, which refuses from
   * `vault.capacity` before storage is asked.
   */
  capacity?:     Capacity
  /** `damaged_box` told of a listing: the box as the listing shows it, its boxlabel and the revision it names. */
  box_listed?:   DamagedBox
  /** `damaged_wayin` told of a read of the vault props: the way in as the snapshot shows it. */
  wayin_listed?: WayinSummary
}

/** What a VaultError is made with beside its refusalkind and message: the `cause` behind it, and its `meta`. */
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
 *   const { ok, val, err } = await vaultDB.getVaultProps(scope)
 *   if (! ok && err.family === 'misuse') { throw err }
 */
export class VaultError extends Error {
  /** What went wrong, from {@link RefusalKindVals}. */
  readonly refusalkind:  RefusalKind
  /** Who handles it, read from {@link RefusalFamilyForKind}. */
  readonly family:       RefusalFamily
  /** What the refusal learned, when it learned anything. */
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
