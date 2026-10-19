/**
 * Every way a vault call can refuse, as a caller branches on them -- and every kind any safebyok
 * package throws: the storage adapters' kinds are these same strings. Each belongs to one of two
 * families, told apart by who must act:
 *
 * - **Misuse**: a programming error, the host developer's to fix, and loud. `bad_label`,
 *   `bad_whisper`, `bad_option`, `bad_record`, `vault_closed`, `unknown_key_deriver`, `insecure_context`. Let it reach an error
 *   boundary or the dev overlay; do not show it to the user, and do not retry.
 * - **Condition**: something the app handles at run time, which may reach the user: ask again,
 *   show a message, retry, or tell them to free room. `vault_locked`, `wrong_passphrase`,
 *   `created_elsewhere`, `weak_passphrase`, `wrong_passkey`, `passkey_unavailable`, `absent_box`, `absent_vault`, `absent_wayin`,
 *   `whisper_too_large`, `box_too_large`, `vault_full`, `too_many_wayins`, `last_wayin`,
 *   `corrupt_record`, `damaged_vault`, `damaged_wayin`, `damaged_box`, `newer_format`, `stale_write`,
 *   `rolled_back`, `not_permitted`, `identity_revoked`, `storage_unavailable`, `storage_blocked`.
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
 * `weak_passphrase` is a new passphrase -- the one a vault is created with, one added, or one
 * changed to -- that the vault's `passphraseStrengthTest` finds too easy to guess; its message is
 * the test's own reason, which a field can show beside the passphrase. Never raised by `unlock()`
 * of a vault that stands: a passphrase already in use is the user's to replace, not to be refused.
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
 * for -- or, as the nearest kind, `zxcvbnPassphraseTest`'s word list that could not be fetched. `storage_blocked` is this device's own store -- its device store, or a vault kept on the
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
 * The package README's *Errors* section lists what each kind means and what to do about it.
 */
export const VaultErrorKindVals = [
  'vault_locked',        // a whisper was asked for before the vault was unlocked
  'wrong_passphrase',    // the passphrase given did not unlock the vault
  'created_elsewhere',   // a first unlock found the vault just made on another device, under another passphrase
  'weak_passphrase',     // a new passphrase the vault's passphraseStrengthTest finds too easy to guess
  'wrong_passkey',       // the passkey's answer did not unlock the vault, or was for another salt
  'passkey_unavailable', // this browser or authenticator cannot answer for a passkey unlock (no WebAuthn, or no PRF)
  'absent_box',          // no box under that label
  'absent_vault',        // the vault has never been created, and this call will not create it
  'absent_wayin',        // no wayin of that wayin_id, or none of the wayinkind asked for
  'bad_label',           // a label, or the userId, that fails the vault's check for it
  'bad_whisper',         // a whisper JSON cannot carry (undefined, a function, a class), or a non-string
  'whisper_too_large',   // a whisper, with its box's sidecar, over the vault's maxWhisperBytes
  'box_too_large',       // a box -- whisper, names and sidecar together -- over what storage holds in one record
  'vault_full',          // a new box in a vault already holding its maxBoxes, or a write storage has no room for
  'too_many_wayins',     // a new wayin in a vault already holding MaxUnlocks
  'last_wayin',          // removing the vault's last passphrase, which would leave no sure way in
  'bad_option',          // an option or argument out of its range: Vault.make's, mask's, argon2idDeriver's, a putBox()'s sidecar
  'bad_record',          // a record or expectation handed to a VaultDB verb that is not one this package builds
  'vault_closed',        // the vault handle was closed and cannot be used again
  'corrupt_record',      // a stored record failed validation as storage read it back
  'damaged_vault',       // the vault's stored props failed their checks, so no way in can be tried
  'damaged_wayin',       // a way in is stored in a form this package never writes, so it cannot be tried
  'damaged_box',         // a box failed its checks, or would not open under the vault's own vaultKey, or names no revision to store over
  'newer_format',        // a stored vault in a form this version does not know, which a newer one may have written
  'unknown_key_deriver', // the vault names a key deriver this handle was not built with
  'insecure_context',    // the page is not a secure context (plain http), where the browser withholds WebCrypto
  'stale_write',         // storage changed since this device read it, so the write was refused
  'rolled_back',         // storage handed back an older copy of the vault than this device has seen, which it refuses to use
  'not_permitted',       // the storage backend refused the signed-in user this call: not theirs to make
  'identity_revoked',    // the storage backend no longer serves the user this vault was opened for: signed out, or another user signed in
  'storage_unavailable', // the storage backend could not be reached, or failed: a retry may mend it
  'storage_blocked',     // this device's own store refuses until something outside the app changes: storage blocked, or no room
] as const
export type VaultErrorKind = typeof VaultErrorKindVals[number]

/**
 * Error thrown by every vault operation that refuses: a calm message saying what went wrong and
 * what to do, and a `refusalkind` to branch on. It never carries a whisper, a passphrase, or any other
 * secret material -- not in the message, not as a property.
 *
 * @example
 *   try { await vault.getBox('ANTHROPIC_API_KEY') } catch (err) {
 *     if (err instanceof VaultError && err.refusalkind === 'vault_locked') { promptForPassphrase() }
 *   }
 */
export class VaultError extends Error {
  readonly refusalkind: VaultErrorKind

  /**
   * @param refusalkind - What went wrong, from {@link VaultErrorKindVals}: what a caller branches on.
   * @param message - What went wrong and what to do, calmly. Never quotes secret material.
   * @param opts - `cause`: the lower-level failure behind this one, such as a storage adapter's
   *   own error, kept for debugging. Never a value that holds secret material.
   */
  constructor(refusalkind: VaultErrorKind, message: string, opts?: ErrorOptions) {
    super(message, opts)
    this.name = 'VaultError'
    this.refusalkind = refusalkind
  }
}

/** True when `err` is a VaultError, and of the given `refusalkind` when one is given. */
export const isVaultError = (err: unknown, refusalkind?: VaultErrorKind): err is VaultError => (
  err instanceof VaultError && (refusalkind === undefined || err.refusalkind === refusalkind)
)

/**
 * The two families a VaultError kind belongs to, told apart by who must act. `misuse` is a
 * programming error, the host developer's to fix: let it reach an error boundary or the dev
 * overlay, never show it to the user, never retry. `condition` is something the app handles at
 * run time, which may reach the user: ask again, show a message, retry.
 */
export const VaultErrorFamilyVals = ['misuse', 'condition'] as const
export type VaultErrorFamily = typeof VaultErrorFamilyVals[number]

/**
 * Which family each kind belongs to: every kind in {@link VaultErrorKindVals}, exactly once.
 *
 * @example VaultErrorFamilyForKind.bad_option           // 'misuse'
 * @example VaultErrorFamilyForKind.bad_record           // 'misuse'
 * @example VaultErrorFamilyForKind.storage_unavailable  // 'condition'
 */
export const VaultErrorFamilyForKind = {
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
  too_many_wayins:     'condition',
  last_wayin:          'condition',
  bad_option:          'misuse',
  bad_record:          'misuse',
  vault_closed:        'misuse',
  corrupt_record:      'condition',
  damaged_vault:       'condition',
  damaged_wayin:       'condition',
  damaged_box:         'condition',
  newer_format:        'condition',
  unknown_key_deriver: 'misuse',
  insecure_context:    'misuse',
  stale_write:         'condition',
  rolled_back:         'condition',
  not_permitted:       'condition',
  identity_revoked:    'condition',
  storage_unavailable: 'condition',
  storage_blocked:     'condition',
} as const satisfies Readonly<Record<VaultErrorKind, VaultErrorFamily>>

/**
 * True when `err` is a VaultError of the `condition` family: one the app may show the user, or
 * retry. Anything else -- misuse, an error that is not a VaultError, a thrown non-error -- is
 * false, and belongs with an error boundary.
 *
 * @example
 *   try { await vault.putBox(boxlabel, whisper) } catch (err) {
 *     if (! isVaultCondition(err)) { throw err }
 *     showGripe(err.message)
 *   }
 */
export const isVaultCondition = (err: unknown): err is VaultError => (
  isVaultError(err) && VaultErrorFamilyForKind[err.refusalkind] === 'condition'
)
