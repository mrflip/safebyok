import type { BoxRecord } from './box'
import type { Capacity, DamagedBox, WayinSummary } from './types'

/**
 * Every way a vault call can refuse, as a caller branches on them -- and every refusalkind any
 * safebyok package refuses with: the storage adapters' kinds are these same strings. Each belongs
 * to one of three families, told apart by who handles it:
 *
 * - **Misuse**: a programming error, the host developer's to fix, and loud. `bad_label`,
 *   `bad_whisper`, `bad_option`, `bad_record`, `invalid_box`, `vault_closed`, `unknown_key_deriver`,
 *   `insecure_context`, `unexpected_error`. Let it reach an error boundary or the dev overlay; do not show it to the
 *   user, and do not retry.
 * - **Condition**: something the app handles at run time, which may reach the user: ask again,
 *   show a message, retry, or tell them to free room. `vault_locked`, `wrong_passphrase`,
 *   `created_elsewhere`, `weak_passphrase`, `wrong_passkey`, `passkey_unavailable`, `absent_box`,
 *   `absent_vault`, `absent_wayin`, `whisper_too_large`, `box_too_large`, `vault_full`,
 *   `corrupt_record`, `stale_write`, `vault_mismatch`, `not_permitted`,
 *   `storage_unavailable`, `storage_blocked`.
 * - **Bad news**: something the app is told about whether or not the call was refused, and
 *   may show the user. `damaged_vault`, `damaged_wayin`, `damaged_box`, `newer_format`,
 *   `rolled_back`, `identity_revoked`.
 *
 * `vault_full` means a new box in a vault already holding its `maxBoxes` (a limit the
 * client keeps), and also that storage has no room for the write (a limit of the backend's own,
 * such as the Convex component's or the Postgres server's). Either way the user deletes a box,
 * or the host raises `maxBoxes` where the backend allows. `whisper_too_large` is the user's value, with its
 * box's sidecar, over `maxWhisperBytes`, so a condition, and `box_too_large` the
 * user's whisper and sidecar together over what storage holds in one record. `bad_label` is a label the app passed that fails the
 * vault's check, a misuse -- a label the user types is checked first, with `Label` or with the
 * host's own `validators.boxlabel`.
 *
 * `identity_revoked` is storage saying that the user this vault was opened for is no longer the
 * one signed in -- signed out, or another user signed in -- and the vault locks itself as it
 * throws it: the user signs in again, and the host opens the
 * vault for whoever that is. `not_permitted` is the signed-in user, still the vault's own, refused
 * one call: signing in again will not help.
 *
 * `corrupt_record` is storage's word, for a record that failed its checks as it read back; the
 * vault says what that means for the user, as one of the `damaged_` kinds. Those are only what the
 * vault can know: a passphrase or passkey whose answer fails to open its way in is
 * `wrong_passphrase` or `wrong_passkey` even when the stored vault was altered, because the
 * decryption fails alike either way. Their messages say so.
 *
 * `created_elsewhere` is a first unlock that found the vault made on another device in the moment
 * between this device's look at storage and its own write, under a passphrase other than the one
 * given. Nothing was created here; the vault now stands as the other device made it, and shows
 * `locked`. The user's next move is to enter the passphrase chosen there, so it is told apart
 * from `wrong_passphrase`, which says "check for typos". A passphrase that does open that vault
 * unlocks it as any unlock does, with no refusal at all.
 *
 * `weak_passphrase` is a new passphrase -- the one a vault is created with, or one `putWayin()`
 * sets -- that the vault's `strengthChecker` finds too easy to guess, or a blank one (a blank one
 * offered as proof, to unlock a vault that stands or to prove a change, is `wrong_passphrase`); its
 * message is the checker's own reason, which a field can show beside the passphrase. Never raised
 * by `unlock()` of a vault that stands: a passphrase already in use is the user's to replace, not
 * to be refused.
 *
 * `insecure_context` is a page served over plain http (anywhere but localhost), where the browser
 * withholds WebCrypto: the host serves it over https.
 *
 * `newer_format` is a stored vault in a form this version does not know, which a newer version of
 * safebyok may have written: the user's next move is to update the app, never to start over, so
 * it is told apart from `damaged_vault`, and nothing deletes it.
 *
 * `rolled_back` is storage handing back an older copy of a vault's props than this device has
 * already seen -- a backup restored over it, or storage tampered with -- which the vault refuses to
 * use, and locks, as for `identity_revoked`: nothing is unlocked from it and nothing written over it. Only a device that saw the newer
 * copy can tell, and only while its own storage keeps the mark of it.
 *
 * `storage_unavailable` and `storage_blocked` are both storage that failed, told apart by whether
 * trying again may help. `storage_unavailable` is a failure a retry may mend: a backend that could
 * not be reached, or an error from storage that names no lasting cause -- a device store's
 * transaction aborted, its connection closed under it, a failure the browser gives no reason
 * for. `storage_blocked` is this device's own store -- its device store, or a vault kept on the
 * device, as `safebyok-indexeddb`'s -- refusing for a reason that holds until
 * something outside the app changes, so that trying again cannot help until then: the browser
 * withholding storage from the page (site data blocked, a sandboxed frame, cookies turned off:
 * a `SecurityError`), storage it has no room in (a quota of zero, as some private windows give,
 * or a full disk: a `QuotaExceededError`), or no IndexedDB at all (`NotSupportedError`). A
 * private window that offers IndexedDB with room in it is no block, and a refusal the browser
 * names otherwise -- an `InvalidStateError`, an `UnknownError` -- is `storage_unavailable`, as
 * it may pass. A host meeting `storage_blocked` stops offering a retry: it tells the user why, and
 * may open the vault again with a device store that keeps nothing (`memoryDeviceDB`), which
 * remembers no unlock on this device.
 *
 * `vault_mismatch` and `invalid_box` are storage's words, from a `VaultDB`'s `putBox` called
 * directly. `vault_mismatch` is a box write sealed for vault props that no longer stand -- the
 * vault deleted, made anew under another `vault_id`, or its vaultKey since replaced -- so that
 * writing it would leave a box no one can open: nothing was written, and the device that sealed it
 * is out of date. `invalid_box` is a box this package would not build, or one sealed under another
 * vaultKey than its expectation names, refused before storage saw it: misuse, which a vault says
 * as `bad_record`, since it built the box from its caller's inputs.
 *
 * The package README's *Errors* section lists what each kind means and what to do about it.
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

/**
 * The three families a refusalkind belongs to, told apart by who handles it. `misuse` is a
 * programming error, the host developer's to fix: let it reach an error boundary or the dev
 * overlay, never show it to the user, never retry. `condition` is something the app handles at
 * run time, which may reach the user: ask again, show a message, retry. `bad_news` is something
 * the app is told whether or not the call was refused -- damage found, storage that went back in
 * time, a user signed out -- which it may show the user.
 */
export const RefusalFamilyVals = ['misuse', 'condition', 'bad_news'] as const
export type RefusalFamily = typeof RefusalFamilyVals[number]

/**
 * Which family each refusalkind belongs to: every kind in {@link RefusalKindVals}, exactly once.
 * A VaultError's `family` is read from it.
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

/**
 * What a refusal learned, each fact under its own name. Each is filled only by the refusals that
 * name it, and holds records as storage holds them -- ciphertext and visible fields -- never
 * secret material.
 */
export type RefusalMeta = {
  /** `stale_write` from a box write: what stands under the boxlabel, as a read would hand it back.
   * The same atomic step that refused the write reported it. It is the box that won, its record
   * whole, its wrapped boxKey and ciphered whisper among it, so the caller can open it or write
   * over it with no second read; a {@link DamagedBox} when what stands does not read back as a
   * box, naming the revision it holds, if any; or null when nothing stands there.
   */
  box_stored?:   BoxRecord | DamagedBox | null
  /** `box_too_large`, `vault_full`: how much room there is. */
  capacity?:     Capacity
  /** `damaged_box` told of a listing: the box as the listing shows it, its boxlabel and the revision it names. */
  box_listed?:   DamagedBox
  /** `damaged_wayin` told of a read of the vault props: the way in as the snapshot shows it. */
  wayin_listed?: WayinSummary
}

/** What a VaultError is made with beside its refusalkind and message: the `cause` behind it, and its `meta`. */
export type VaultErrorOpts = ErrorOptions & { meta?: RefusalMeta }

/**
 * Every refusal any safebyok call makes: a calm message saying what went wrong and what to do, a
 * `refusalkind` to branch on, and the `family` that says who handles it. It never carries a
 * whisper, a passphrase, or any other secret material -- not in the message, its `cause` or its
 * `meta`, not as a property.
 *
 * @example
 *   try { await vault.getBox('ANTHROPIC_API_KEY') } catch (err) {
 *     if (isVaultError(err, 'vault_locked')) { promptForPassphrase() }
 *   }
 * @example
 *   const { ok, val, err } = await vaultDB.getVaultProps(scope)
 *   if (! ok && err.family === 'misuse') { throw err }
 */
export class VaultError extends Error {
  /** What went wrong, from {@link RefusalKindVals}: what a caller branches on. */
  readonly refusalkind:  RefusalKind
  /** Who handles it, read from {@link RefusalFamilyForKind}: `misuse`, `condition` or `bad_news`. */
  readonly family:       RefusalFamily
  /** What the refusal learned, each fact under its own name, when it learned any. */
  declare readonly meta?: RefusalMeta

  /**
   * @param refusalkind - What went wrong, from {@link RefusalKindVals}: what a caller branches on.
   * @param message - What went wrong and what to do, calmly. Never quotes secret material.
   * @param opts - `cause`: the lower-level failure behind this one, such as a storage adapter's
   *   own error, kept for debugging. `meta`: what the refusal learned, as {@link RefusalMeta}
   *   names it. Never a value that holds secret material.
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

/**
 * True when `err` is a VaultError, and of the given `refusalkind` when one is given: the one test
 * for a refusal, which safebyok asks everywhere it branches on one, and a host should too. An
 * error that only names itself `VaultError` and carries a `refusalkind` -- one rebuilt from a
 * server's JSON, say -- is not one, nor is a VaultError of a second copy of safebyok loaded beside
 * this one (an ESM and a CJS build side by side): that is a foreign throw, met as any other.
 *
 * @example
 *   try { await vault.getBox('ANTHROPIC_API_KEY') } catch (err) {
 *     if (isVaultError(err, 'vault_locked')) { promptForPassphrase() }
 *   }
 */
export const isVaultError = (err: unknown, refusalkind?: RefusalKind): err is VaultError => (
  err instanceof VaultError && (refusalkind === undefined || err.refusalkind === refusalkind)
)

/**
 * True when `err` is a VaultError the app may show the user, or retry: one of the `condition`
 * family, or of `bad_news`. Anything else -- misuse, an error that is not a VaultError, a thrown
 * non-error -- is false, and belongs with an error boundary.
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
