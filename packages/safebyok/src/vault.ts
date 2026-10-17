import * as Z from 'zod/mini'
import { DeviceMark, DeviceUnlock, LockboxSummary, PublicBag, type SeenVault, type DamagedLockbox, type Lockbox, ForcePassphraseReentryHours, FarFuture, FarPast, ForeverMillis, MaxLockboxes, MaxReentryHours, MaxUnlocks, MaxWhisperBytes, MinuteMillis, PasskeySaltBytes, VaultBundle, type VaultScope, Whisper, wallClock, type Clock, type PasskeyProof, type PassphraseEnvelope, type UnlockEnvelope, type UnlockSummary } from './types'
import * as Names from './names'
import type { VaultValidators } from './validators'
import { VaultError, isVaultError, type VaultErrorKind } from './errors'
import type { KeyDeriver } from './key-deriver'
import { MaxSaltBytes, TestDeriverNotice, TestLabelPrefix, ensureSuppliedSpecKept, parseKeyDeriverSpec, type KeyDeriverSpec } from './key-deriver-spec'
import {
  cipherBinding, cipherBytes, decipherBytes,
  makeLocalUnlockKey, makeLockboxKey, makeVaultKey, randomBytes, randomId, wrapKeyUnder, unwrapKeyUnder,
} from './crypto'
import * as Envelope from './envelope'
import type { EnvelopeStamp, UnlockProof, VaultKeyPair } from './envelope'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import type { DeviceDB } from './device-db'
import { VaultDB, jsonBytes, type LockboxExpectation } from './vault-db'
import { asError, parseLogger, type VaultLogger } from './logger'
import * as RefusalPolicy from './refusal-policy'
import { ensureStrongEnough, parseStrengthTest, type PassphraseStrengthTest } from './passphrase-strength'

/**
 * Where the vault stands, as the UI branches on it:
 *  * `opening`  -- still reading the bundle and device cache; show nothing yet
 *  * `absent`   -- never created; the first unlock() will choose its passphrase
 *  * `locked`   -- exists, summaries readable, whispers not; unlock() opens it
 *  * `unlocked` -- whispers readable until askPassphraseAt, lock() or lockSoon()
 */
export type VaultState = 'opening' | 'absent' | 'locked' | 'unlocked'

/**
 * Immutable picture of the vault for rendering, shaped for `useSyncExternalStore`: the object
 * keeps its identity until something changes. Lockbox summaries (labels and public metadata, no
 * whispers) are present even while locked -- that is the point of keeping metadata public.
 */
export type VaultSnapshot = {
  state:     VaultState
  scope:     VaultScope
  /**
   * Every lockbox in the vault, sorted by boxlabel: a {@link LockboxSummary} for each, or a
   * {@link DamagedLockbox} (`damaged: true`, its boxlabel and revision and nothing else) for one
   * whose stored record does not read back, or is sealed under a vaultKey the vault does not hold
   * -- which `erase()` removes and `store()` overwrites. The listing reads each record's shape and
   * never opens its ciphertext: ciphertext altered in storage shows only when it is read.
   */
  boxes:     readonly (LockboxSummary | DamagedLockbox)[]
  /**
   * Epoch ms from which the vault asks for the passphrase again, while unlocked; null otherwise.
   * The time the passphrase was last typed and proven plus `forcePassphraseReentryHours`
   * (see `Vault.unlock`), never later than {@link FarFuture} (in 2255): with `Infinity` hours, a
   * vault that asks again only after `lock()` reads as that instant. Compare with
   * `>= FarFuture - MinuteMillis`, never for equality.
   */
  askPassphraseAt: number | null
  /**
   * The vault's ways in, public face only, in the order the vault tries them: one
   * {@link UnlockSummary} per passphrase or passkey, readable while locked, so a host can list
   * them, ask which one the user means, name one to `unlock()`, `changePassphrase()` or
   * `removeUnlock()`, and ask a passkey's authenticator for its answer. Empty until the vault exists.
   */
  unlocks:   readonly UnlockSummary[]
  /**
   * False when the vault's last read of storage failed -- a change pushed from storage it could
   * not read, or a catch-up after a write storage refused -- so what it shows may be behind
   * storage until a read succeeds; true otherwise. A UI may say "not syncing" while it is false.
   * The vault keeps working either way: every write still lands only where storage stands as
   * this device last read it.
   */
  syncing:   boolean
}

export type OpenVaultOpts = {
  /** The host application's namespace: one backend can serve several apps without collision. */
  applabel:   string
  /**
   * Stable identifier of the signed-in user, from the host's auth: by default 1 to 100 ASCII
   * letters, digits and `-_.:@+|`, as the exported `UserId` checks, or what `validators.userId`
   * admits. The provider's stable, opaque id: never an email or a handle, which can change and
   * would orphan the vault.
   */
  userId:     string
  /** The vault's own label; an app that keeps one vault per user calls it `main`. */
  vaultlabel: string
  vaultDB:    VaultDB
  deviceDB:   DeviceDB
  /**
   * What turns a passphrase into passphraseKey bytes: in a browser, the pinned Argon2id deriver
   * that `browserOpts()` from `safebyok/browser` supplies. See {@link KeyDeriver} for the narrow
   * reasons to substitute. Asked for outright, so an app that passes another never ships this one.
   */
  keyDeriver: KeyDeriver
  /**
   * How many hours an entered passphrase lasts on this device, remembered across reloads, before
   * the vault asks for it again. Default: {@link ForcePassphraseReentryHours}, 168 (seven days).
   * Any number above zero up to {@link MaxReentryHours}, 588 (24.5 days), fractions too: 0.25 is
   * fifteen minutes. `Infinity` means never on this device: the vault stays unlocked until
   * `lock()` (or the vault changes under it), and `askPassphraseAt` reads as {@link FarFuture}.
   * A finite number past 588 is refused with kind 'bad_option': the vault drops its key with a
   * timer a minute after the window ends, and no timer reaches further.
   *
   * Lowering it takes hold on each device at its next open: an unlock remembered under the
   * longer setting, whose deadline lies past this many hours from then, is forgotten, and the
   * vault opens locked. Raising it lengthens no unlock already remembered. A device keeps one
   * remembered unlock per vault, so two tabs opening a vault with different settings are one
   * device with two settings, which is not supported (`notes/wontfix.md`): the lower one wins.
   */
  forcePassphraseReentryHours?: number | undefined
  /**
   * Time source for expiry and for the times stored with each record; tests inject one. Default:
   * the wall clock. Its `now()` returns epoch milliseconds, as `Date.now()` does, from 1981 to 2255
   * ({@link FarPast} to {@link FarFuture}), fractions allowed (each reading is rounded down to
   * whole milliseconds). openVault reads it once and refuses a clock outside those bounds, or one
   * that throws, with kind 'bad_option'; so does any later call that reads it so, dropping the
   * vaultKey first, so the vault is locked.
   */
  clock?: Clock | undefined
  /**
   * The largest whisper `store()` accepts, in bytes of its JSON and its lockbox's public bag's
   * together. Default: {@link MaxWhisperBytes}, 40444. Checked on write only, so lowering it never
   * strands a whisper already stored. At most half the vaultDB's `maxRecordBytes`: openVault
   * refuses more with kind 'bad_option'.
   */
  maxWhisperBytes?: number | undefined
  /**
   * The most lockboxes the vault holds. Default: {@link MaxLockboxes}, 100, or the vaultDB's own
   * `maxLockboxes` when that is smaller. `store()` refuses a new lockbox past it with kind
   * 'vault_full'; replacing one already there is always allowed, and lowering it strands nothing
   * already stored. Raise this or `maxWhisperBytes` freely while this stays within the vaultDB's
   * `maxLockboxes` and the two fit its `maxVaultBytes`: openVault refuses otherwise, with kind
   * 'bad_option'.
   */
  maxLockboxes?: number | undefined
  /**
   * Where the vault says what it has nobody to throw to -- a lock that skipped its grace, a
   * background refresh that failed, a remembered unlock it could not read -- as a
   * {@link VaultLogger}: `log`, `warn` and `error` functions. Default: the console. The vault hands
   * it no secret material or option's value (a host's own error goes as the host made it); whatever
   * it throws is ignored. Pass functions that do nothing for quiet. Kind 'bad_option' for anything
   * else.
   */
  logger?: VaultLogger | undefined
  /**
   * The checks for the vault's names where they enter it, as a {@link VaultValidators} bag: each
   * field given replaces ours (`Label` for each label, an unlock's `unlocklabel` among them,
   * `UserId` for the user, from `safebyok/validators`), and each left out keeps ours. Each is a Zod
   * schema that checks synchronously, and only checks: what passes is kept exactly as given.
   * Beneath every one, the floor (`NameFloor`) holds whatever the bag says. Kind 'bad_option' for
   * a bag holding anything else, or a field it does not know (a `note` among them: a lockbox's
   * public bag is the host's to check).
   */
  validators?: VaultValidators | undefined
  /**
   * The check every new passphrase must pass, as a {@link PassphraseStrengthTest}: the one the
   * first `unlock()` creates the vault with, and each `addPassphrase()` or `changePassphrase()`
   * sets, before any key derivation. A passphrase it finds weak is refused with kind
   * 'weak_passphrase', the test's reason the message. It never runs on `unlock()` of a vault that
   * stands. Default: `passphraseLengthTest`, at least `MinPassphraseChars` (12) characters
   * and no composition rules; `zxcvbnPassphraseTest`, from `safebyok/browser`, also turns away
   * common passwords and patterns. Kind 'bad_option' for anything but a function, and for a test
   * that answers anything but a verdict; whatever it throws, the call throws.
   */
  passphraseStrengthTest?: PassphraseStrengthTest | undefined
}

/**
 * A user's vault of lockboxes. All reading and writing of whispers goes through here; the UI
 * renders from `getSnapshot()` and re-renders on `subscribe()`.
 *
 * Operations that touch a whisper -- store, read, use, erase -- require the vault unlocked, and
 * throw a VaultError of kind 'vault_locked' otherwise: the host catches that, asks the user for
 * their passphrase, calls unlock(), and retries. Nothing prompts on open.
 *
 * This device keeps a mark of the newest copy of the vault's bundle it has seen (a device mark, in
 * the deviceDB, which `lock()` leaves and `destroy()` empties). A call that reads the bundle afresh
 * -- `openVault`, `unlock()`, a change to the ways in, a store that catches up with storage, a
 * background refresh -- refuses an older copy of that same vault, one at a lower unlock epoch or
 * vaultKey epoch than this device has seen, with kind 'rolled_back', taking nothing from it and
 * writing nothing: storage handing back an older bundle could otherwise bring back a way in that
 * was removed. Storage so little to be trusted locks the vault, as `lock()` does, as a storage
 * refusal of kind 'identity_revoked' does. A host that knows its storage was restored from an
 * older copy on purpose accepts it on this device by erasing the device's mark of the vault
 * (`deviceDB.eraseMark(scope)`) and opening the vault again.
 *
 * Storage alone settles a race. When it refuses a write as stale, or a lockbox will not open, the
 * vault catches up with storage once before it names the refusal: a vault destroyed and made
 * anew, or its ways in changed, elsewhere relocks this device. A catch-up that fails leaves the
 * snapshot saying `syncing: false` until a read succeeds; a write whose catch-up fails throws
 * 'stale_write', the catch-up's failure its cause -- unless that failure is 'identity_revoked',
 * 'rolled_back' or 'newer_format', which the write throws as it came.
 */
export type Vault = {
  /**
   * How long an entered passphrase lasts on this device, in whole milliseconds: the
   * `forcePassphraseReentryHours` the vault was opened with, its default (168 hours) when none
   * was given. A vault that stays unlocked until `lock()` (`Infinity` hours) reads
   * {@link ForeverMillis}. Fixed for the handle's life, so a UI can say how long an unlock lasts
   * without being told the option again.
   *
   * @example vault.reentryWindowMillis >= ForeverMillis - MinuteMillis ? 'until you lock it' : `for ${String(Math.round(vault.reentryWindowMillis / MinuteMillis))} minutes`
   */
  readonly reentryWindowMillis: number
  /** Current snapshot; same object until something changes (useSyncExternalStore-ready). */
  getSnapshot: () => VaultSnapshot
  /**
   * Calls `listener` after every snapshot change; returns the unsubscribe. Kind 'bad_option' for
   * a listener that is not a function.
   */
  subscribe: (listener: () => void) => () => void

  /**
   * Open the vault with its passphrase, remembering the unlock on this device for
   * `forcePassphraseReentryHours`. On an `absent` vault this first unlock creates it, with this
   * passphrase as its one way in, labelled `passphrase` -- once the vault's
   * `passphraseStrengthTest` passes it: kind 'weak_passphrase' otherwise, the test's reason its
   * message, and nothing is created. A vault that stands is never refused its passphrase for
   * weakness. A wrong passphrase throws kind
   * 'wrong_passphrase' and changes nothing -- learned from the vaultKey envelope refusing to
   * decrypt, never from a comparison. A passphrase that is not text is misuse: kind 'bad_option'.
   *
   * A vault with several passphrases tries this one against each in turn, one key derivation
   * apiece (with the browser's deriver, about half a second each), so a wrong passphrase takes
   * longest. `opts.unlockId`, from the snapshot's `unlocks`, aims it at that passphrase alone:
   * one derivation, and kind 'absent_unlock' when the vault has no such passphrase. An aimed
   * unlock never creates the vault: on an `absent` one, it too refuses as 'absent_unlock'.
   *
   * A way in stored in a form this package never writes is damaged, and passed over: the others
   * are tried as ever. Kind 'damaged_unlock' when the unlock is aimed at a damaged one, or every
   * passphrase is. A passphrase envelope altered in storage refuses its passphrase just as a typo
   * does, so 'wrong_passphrase' is all the vault can say of it; its message names both.
   *
   * The unlock lasts until `askPassphraseAt`, `forcePassphraseReentryHours` from now: from then
   * no new work starts, work in hand has a minute more to finish, and then the vaultKey is
   * dropped, by a timer and at the next look alike. Every later call in which the user types a
   * passphrase and it proves -- `changePassphrase()`, or a way in added or removed with a
   * passphrase as proof -- starts the window again from then; nothing else moves it.
   *
   * A `lock()` or `destroy()` called while the unlock is still under way wins, in this tab or in
   * another on this device: the vault stays locked, this device remembers nothing, and the call
   * throws kind 'vault_locked'. A `lockSoon()` does not: it lets work in hand finish, this unlock
   * among it. A vault the unlock was creating stays created,
   * locked, under this passphrase. So does a vault destroyed, made anew, or with its unlocks
   * changed on another device meanwhile: the passphrase was proven against a vault that no longer
   * stands as it was. A wrong passphrase is still told as 'wrong_passphrase', lock or no lock.
   * The window running out while the unlock is under way is no lock: the unlock stands, with a
   * window of its own.
   *
   * `proof` may instead be a passkey's answer, a {@link PasskeyProof} (`safebyok-react`'s
   * `askPasskey` gets one): it opens the passkey envelope of the credential that answered, with
   * no key derivation to wait for, and is remembered on this device for
   * `forcePassphraseReentryHours` as a passphrase is. It refuses with kind 'absent_unlock' when no
   * way in is that passkey's, 'wrong_passkey' when its answer does not open the vault (its
   * message saying that the way in may be damaged), 'damaged_unlock' when its envelope is stored
   * damaged, and 'absent_vault' on an `absent` vault: a vault is created with a passphrase.
   *
   * @example await vault.unlock(passphrase)
   * @example await vault.unlock(passphrase, { unlockId: chosen.unlock_id })  // chosen from getSnapshot().unlocks
   * @example await vault.unlock(passkey)  // from askPasskey(vault.getSnapshot().unlocks)
   */
  unlock(proof: string | PasskeyProof, opts?: { unlockId?: string | undefined }): Promise<void>
  /**
   * Forget the unlock, in memory and on this device: back to `locked`, at once -- the hard lock.
   * Wins over an `unlock()` or `changePassphrase()` still under way, which then leaves the vault
   * locked -- in this tab, or in another on this device, whose unlock then remembers nothing
   * either -- and over a `read()` or `use()` under way, which refuses with kind 'vault_locked',
   * handing back nothing. A write already sent to storage lands. Kind 'storage_unavailable' when
   * this device's store fails to forget its record ('storage_blocked' when the browser withholds
   * that store); the vault is locked all the same.
   *
   * The other hard locks: `destroy()`, a lock for storage the vault cannot trust (a user signed
   * out, an older copy of the vault), and a refresh that finds the vault's ways in changed or the
   * vault gone, which drops the key; `close()` likewise stops a read under way. Not hard locks:
   * `lockSoon()`, whose grace lets work in hand finish even once its shut time has come and the
   * key is dropped, and a clock that cannot be read, which drops the key at once without a grace.
   */
  lock(): Promise<void>
  /**
   * Lock gently, for a hidden tab or a sign-out -- the soft lock: no new secrets from this instant,
   * work in hand finishes, and the vaultKey is dropped `graceSeconds` from now -- or sooner, when
   * the unlock's own window would drop it sooner: a key past `askPassphraseAt` keeps only the
   * minute it had left, and one past that is dropped at once. At once, the snapshot reads
   * `locked`, every read, use, store or erase called from now on throws kind 'vault_locked', and
   * this device forgets its remembered unlock. What the grace spares is work already past its
   * start: a `read()`, a `store()` retrying after another device's write, or an `erase()`, still
   * lands; and an `unlock()` or `changePassphrase()` still under way, in this tab or another on
   * this device, finishes, leaving the vault unlocked again. An `unlock()` or `changePassphrase()`
   * begun within the grace ends it too: the vault is unlocked again, and nothing is dropped.
   *
   * `graceSeconds` is from 0 to 60, fractions too; kind 'bad_option' otherwise. 0 is `lock()`.
   * `close()` cuts the grace short. A clock reading out of bounds cannot time a grace: the vault
   * then locks at once, as with `lock()`, and says so through the logger's `warn`.
   *
   * @param graceSeconds - How long work in hand has to finish. Default 5.
   *
   * @example document.addEventListener('visibilitychange', () => { if (document.hidden) { void vault.lockSoon() } })
   * @example await vault.lockSoon(0)  // the same as await vault.lock()
   */
  lockSoon(graceSeconds?: number): Promise<void>

  /**
   * Re-wrap the vaultKey under a new passphrase, in place of the old one: the passphrase's way
   * in keeps its `unlock_id` and `unlocklabel`, and takes a fresh passphraseSalt. The vault's
   * other ways in are untouched, and still open it. Lockboxes are untouched too -- their
   * lockboxKeys stay wrapped under the unchanged vaultKey -- so this is cheap no matter how many
   * there are. Every other device's unlock (remembered or in hand) lapses: the bundle's
   * unlockEpoch moves, and they fall back to `locked` on their next look.
   *
   * A `newPassphrase` the vault's `passphraseStrengthTest` finds weak is refused first, before any
   * key derivation, with kind 'weak_passphrase', the test's reason its message.
   *
   * `proof` is any way in the vault has: the passphrase being replaced, another passphrase, or
   * a passkey's answer ({@link PasskeyProof}) -- any way in proves any change, so a user who
   * forgot their passphrase sets a new one with their fingerprint. Given a passphrase, the way
   * in it opens is the one replaced (`opts.unlockId` aims it at one way in, as `unlock()` is
   * aimed). Given a passkey's answer, which passphrase to replace is `opts.unlockId`'s to say,
   * unless the vault has only one.
   *
   * Works locked or unlocked, since the proof is proof enough. A wrong passphrase throws kind
   * 'wrong_passphrase', and a passkey's answer that does not open the vault 'wrong_passkey' or
   * 'absent_unlock', changing nothing. A passkey's answer with several passphrases to choose
   * from and no `opts.unlockId` throws kind 'bad_option', and an `opts.unlockId` that names no
   * passphrase of the vault 'absent_unlock'. If another device changes the vault's ways in (or
   * destroys the vault) between this device's look and its write, nothing is written and the
   * call throws kind 'stale_write', after catching up with storage.
   *
   * Leaves the vault unlocked under the new passphrase, the unlock window starting again from
   * now when a passphrase proved the change, since the user just typed who they are; a passkey's
   * answer keeps the window standing on an unlocked vault, and sets one on a locked vault, as
   * `unlock()` by passkey would -- unless `lock()` or `destroy()` is called
   * while the change is under way, which wins: the passphrase still changes, and the vault stays
   * locked. A `lockSoon()` lets it finish, unlocked. So does the window running out while the
   * change is under way: the vault ends unlocked, with its new window. Once the change has landed
   * in storage, the call resolves: should this device then fail to keep its own records of it,
   * the logger says so, and the vault asks for the passphrase at its next open.
   *
   * @example await vault.changePassphrase(oldPassphrase, newPassphrase)
   * @example await vault.changePassphrase(passkey, newPassphrase)  // forgot the old one: a passkey's answer proves it
   * @example await vault.changePassphrase(passkey, newPassphrase, { unlockId: homePhraseId })  // a vault of several passphrases
   */
  changePassphrase(proof: string | PasskeyProof, newPassphrase: string, opts?: { unlockId?: string | undefined }): Promise<void>

  /**
   * Give the vault another way in: a second passphrase (a third, ...), which opens it as the
   * first does, on any device. `proof`, a passphrase the vault already opens with or a passkey's
   * answer ({@link PasskeyProof}), proves the user may -- asked for even while unlocked, since the
   * vault keeps no copy of its vaultKey it could wrap anew. A passkey as proof is how a user who
   * forgot their passphrase sets a new one. `opts.unlocklabel` is what the user calls the new one
   * (`home_phrase`), a label no other way into this vault already has.
   *
   * Refuses with kind 'wrong_passphrase' when `proof` opens nothing (or `newPassphrase` is
   * empty), 'wrong_passkey' or 'absent_unlock' for a passkey's answer that does not open the
   * vault, 'bad_label' for an unlocklabel that fails the vault's unlocklabel check (by default
   * `Label`; a host's own in openVault's `validators`), is empty or is already taken,
   * 'weak_passphrase' for a `newPassphrase` the vault's `passphraseStrengthTest` finds weak (the
   * test's reason the message, before any key derivation), and
   * 'too_many_unlocks' when the vault already holds {@link MaxUnlocks}: remove one first. Like
   * `changePassphrase()`, it moves the unlockEpoch, so every other device locks; it leaves
   * this one unlocked, and throws kind 'stale_write' when another device changed the vault's ways
   * in meanwhile. A passphrase as proof starts the unlock window again from now; a passkey's
   * keeps the deadline that stands, or, on a vault locked, sets one as `unlock()` by passkey
   * would. So does every change to the ways in.
   *
   * @returns The new way in's `unlock_id`.
   *
   * @example const unlockId = await vault.addPassphrase(passphrase, spare, { unlocklabel: 'written_down' })
   * @example const unlockId = await vault.addPassphrase(passkey, remembered, { unlocklabel: 'new_phrase' })  // forgot the old one
   */
  addPassphrase(proof: string | PasskeyProof, newPassphrase: string, opts: { unlocklabel: string }): Promise<string>

  /**
   * Give the vault a passkey as a way in: a fingerprint, a face, or a security key, whose
   * authenticator answers for the vault through the WebAuthn PRF extension. `proof`, a passphrase
   * the vault opens with or another passkey's answer, proves the user may, as for
   * `addPassphrase()`. Only once it has, the vault calls `makePasskey`, which asks the
   * authenticator for the new passkey and resolves with its answer over a fresh salt
   * ({@link PasskeyProof}), or null when the user dismissed the prompt: `safebyok-react`'s
   * `createPasskey` is one, and the core never calls WebAuthn itself. So a proof refused, a label
   * taken, or a vault already full leaves no passkey behind on the authenticator, opening nothing.
   * `opts.unlocklabel` is what the user calls it (`laptop_fingerprint`).
   *
   * The passkey then unlocks the vault on any device where its authenticator can answer: the one
   * it was made on, or, for a passkey synced by the platform (iCloud Keychain, Google Password
   * Manager), any device signed in to that account; a security key, wherever it is plugged in.
   *
   * Refuses as `addPassphrase()` does for the proof, the label, and a vault already holding
   * {@link MaxUnlocks}, all before `makePasskey` is called; and with kind 'bad_option' for a
   * `makePasskey` that is not a function, or whose answer is not one over a
   * fresh salt of {@link PasskeySaltBytes} bytes, or whose credential is already a way into
   * this vault. Moves the unlockEpoch, so every other device locks; leaves this one unlocked.
   *
   * Whatever `makePasskey` throws, `addPasskey` throws (`createPasskey`'s 'passkey_unavailable',
   * say), adding nothing. Should another device change the vault's ways in while the user answers
   * the authenticator, it throws kind 'stale_write', and the passkey just made stays on the
   * authenticator, a way into nothing: try again. A `lock()` while the user answers it locks this
   * device at once, but the passkey is still added, as every change to the ways in lands once
   * begun.
   *
   * @returns The new way in's `unlock_id`, or null when `makePasskey` resolved null: nothing was added.
   *
   * @example
   *   const makePasskey = () => createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } })
   *   const unlockId = await vault.addPasskey(passphrase, makePasskey, { unlocklabel: 'laptop_fingerprint' })
   */
  addPasskey(proof: string | PasskeyProof, makePasskey: () => Promise<PasskeyProof | null>, opts: { unlocklabel: string }): Promise<string | null>

  /**
   * Take away one way in, a passphrase or a passkey, named by its `unlock_id` from the snapshot's
   * `unlocks`. `proof`, a passphrase the vault opens with or a passkey's answer -- the one going,
   * or another -- proves the user may. Refuses with kind 'absent_unlock' when there is no such way
   * in, and 'last_unlock' when it is the vault's last passphrase: a vault always keeps one, since
   * a passkey can be lost with its device. Like `changePassphrase()`, it moves the
   * unlockEpoch, so every other device locks and must unlock again with a way in still
   * standing; it leaves this one unlocked.
   *
   * Removal is not revocation: whoever knew the removed passphrase, or holds the removed passkey,
   * and kept a copy of the vault as it was can still open that copy, and the vaultKey inside it is
   * the one the vault still uses. Removing a way in stops it opening the vault from here on; it
   * cannot take back what it opened before.
   *
   * @example await vault.removeUnlock(passphrase, leaked.unlock_id)
   */
  removeUnlock(proof: string | PasskeyProof, unlockId: string): Promise<void>

  /**
   * Write a whisper into the lockbox `boxlabel`, creating or replacing it. Requires unlocked;
   * kind 'whisper_too_large' when its JSON and the lockbox's public bag's together are over the
   * vault's `maxWhisperBytes`, and kind 'vault_full' when `boxlabel` is new and the vault already
   * holds its `maxLockboxes` -- erase one first. A bag left out, and so kept from the lockbox,
   * counts toward `maxWhisperBytes` as one given does. Replacing a lockbox is never refused as
   * 'vault_full' by the vault's own limits, though a backend holding a limit of its own may refuse
   * a heavier replacement in a full vault as kind 'vault_full'.
   *
   * The write lands only if storage still holds what this device last read: the same vault, and
   * the same revision of this lockbox (or still none). When another device got in first, the
   * store catches up with storage and tries again, over what that device wrote -- the last
   * writer wins -- for three attempts in all, and throws kind 'stale_write' only when the third is
   * refused too, the snapshot showing the box as it now stands. Each retry waits first, a random
   * 1 to 2 seconds before the first and 2 to 4 before the second, so that two devices which
   * collided do not collide again in step: a store that keeps losing can take up to about six
   * seconds longer to give up. A box that stood when an attempt read it and is gone on the retry
   * was erased elsewhere, and an erase wins: nothing is written, and the call throws kind
   * 'stale_write' at once, without waiting. A retry that finds the vault destroyed or made anew
   * elsewhere, or its unlocks changed -- or this device locked, as it may be during the wait --
   * finds this device locked instead, and throws kind 'vault_locked' without writing: a stale
   * session never writes into a vault reborn under new keys.
   *
   * The lockbox keeps the time it was first stored as `registered_at`, and stamps `written_at`
   * with the time of this write: every store moves it, the same whisper stored again included, so
   * it says when the lockbox was last written, never whether its whisper changed.
   *
   * Should the catch-up after a refusal fail itself, the call throws kind 'stale_write' at once,
   * the catch-up's failure its cause, and the snapshot says `syncing: false` -- or, for a catch-up
   * refused as 'identity_revoked', 'rolled_back' or 'newer_format', that refusal as it came.
   *
   * A lockbox whose stored record cannot be read as one -- every lockbox the snapshot lists as
   * damaged, and also one that lists as sound but whose ciphered fields are missing or malformed
   * -- is overwritten as though it were new, with nothing carried from it, neither its public bag
   * nor its `registered_at`: in one write over the revision the listing names, which another
   * device's write meanwhile refuses, as for any lockbox. A record that names no revision is
   * erased first, then written; should that write fail, the old record is gone and the call
   * throws: storing again writes the lockbox afresh. A record that reads but will not decipher --
   * its ciphertext, its bag or a time altered in storage -- is written over its revision, but
   * carries nothing forward either: nothing vouches for its public fields, so its bag becomes `{}`
   * unless one is given, and its `registered_at` is now. A boxlabel the vault's check refuses is
   * kind 'bad_label', writing nothing, even where a lockbox stored under other checks stands under
   * it: that one reads and erases by its name, but is never written anew under it.
   *
   * `opts.public` is the lockbox's public bag ({@link PublicBag}): any JSON value, shown in the
   * snapshot while locked, never interpreted by the vault -- kind 'bad_option' for anything JSON
   * cannot carry. Check its shape yourself before storing it. Left out, the lockbox keeps the bag
   * it has (when its record opens: see above), and a new lockbox gets `{}`; `{}` empties it. The bag is stored in the clear and
   * bound into the lockbox's encryption, so a bag altered in storage makes the lockbox refuse to
   * open. Never put secret material in it. A lockbox heavier, whisper and names and bag together,
   * than storage holds in one record is refused with kind 'lockbox_too_large'; one that would take
   * the vault past what its storage holds of one vault, with kind 'vault_full'.
   *
   * @example await vault.store('anthropic_api_key', 'sk-ant-...', { public: { note: 'work account' } })
   * @example await vault.store('anthropic_api_key', 'sk-ant-...')                 // keeps the bag it has
   * @example await vault.store('anthropic_api_key', 'sk-ant-...', { public: {} })  // and empties it
   */
  store(boxlabel: string, whisper: Whisper, opts?: { public?: PublicBag | undefined }): Promise<void>
  /**
   * The whisper in `boxlabel`. Requires unlocked; kind 'absent_box' when there is none, and
   * 'damaged_lockbox' when its stored record fails its checks, or will not open under the vault's
   * key: `erase()` it, or `store()` over it. A lockbox that will not open is named so only after
   * one catch-up with storage: one a vault destroyed and made anew elsewhere wrote relocks this
   * device, and the call throws kind 'vault_locked'; a catch-up that fails throws its own
   * refusal. A hard lock landing while it reads wins, and nothing is handed back: kind
   * 'vault_locked' for a `lock()`, a `destroy()`, or a refresh that finds the vault's ways in
   * changed or the vault gone; 'vault_closed' for a `close()`.
   * A lockbox stored under a boxlabel the vault's check refuses -- by another client, or under
   * other checks -- reads as any other, by the name it was stored under. With nothing under it, a
   * name the check refuses is kind 'bad_label', and one below the floor every name is held to is
   * 'bad_label' always.
   */
  read(boxlabel: string): Promise<Whisper>
  /**
   * Hand the whisper to `callback` and return its result: the shape that discourages parking a
   * secret in state. Requires unlocked; kind 'bad_option', before anything is read, for a
   * `callback` that is not a function. Refuses `boxlabel` as `read()` does: 'absent_box',
   * 'damaged_lockbox', and 'bad_label' for a name the vault's check refuses with nothing under it.
   *
   * @example await vault.use('anthropic_api_key', (whisper) => callAnthropic(whisper))
   */
  use<ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT>
  /**
   * Remove the lockbox `boxlabel` entirely, whatever revision of it stands -- even one whose
   * stored record fails verification, which the snapshot lists as damaged and reading refuses as
   * 'damaged_lockbox': erasing it needs nothing from it, and is the remedy for it. A lockbox
   * stored under a boxlabel the vault's check refuses is reached by that name too. Requires
   * unlocked; kind 'absent_box' when absent, and 'bad_label' for a refused name with nothing
   * under it. The erase lands only in the vault this device last read: if it was destroyed, or
   * destroyed and made anew, elsewhere, nothing is erased and the call throws kind
   * 'stale_write', after catching up with storage -- which relocks this device -- its message
   * saying the lockbox could not be erased because the vault it was in is gone, and the
   * adapter's refusal its cause. Unlike `store()`, an erase is never retried: that is its only
   * expectation, and trying again could not meet it.
   */
  erase(boxlabel: string): Promise<void>

  /**
   * Delete the vault's every stored record, remote and device-local: the vault half of deleting
   * an account. Deliberately does NOT require unlock -- an authenticated owner can always delete
   * their own rows server-side, and requiring unlock here would only look like protection.
   *
   * Deletes the vault this handle last read, and only that one: if it was destroyed, or
   * destroyed and made anew, elsewhere since, storage keeps what stands there now and the call
   * throws kind 'stale_write', after catching up -- so a second destroy(), the user asking again,
   * deletes the vault that then stands, the one the snapshot shows. A handle that has seen no
   * vault reads storage first, and deletes whatever vault stands there: "delete my vault" never
   * reports success over one standing. Locks as `lock()` does, and wins as it does over work under
   * way; this device's mark of the vault forgets it, keeping its lock generation.
   */
  destroy(): Promise<void>
  /**
   * Release subscriptions and refuse further calls, dropping the vaultKey from memory. It is not
   * a lock of the vault, and forgets nothing stored: this device's remembered unlock stays, and
   * the next open picks it up. An `unlock()` still under way takes nothing up and throws kind
   * 'vault_closed'; whatever it remembered on the device before the close stays too. A `read()` or
   * `use()` still under way hands back nothing and throws kind 'vault_closed', as after a hard
   * lock. A second `close()` does nothing.
   */
  close(): void
}

/**
 * What `bundle` holds before the backend's first answer arrives: distinct from null, which is the
 * backend's own answer ("no bundle: this vault was never created"). Symbol.for, not Symbol, so
 * the sentinel stays one value even when the ESM and CJS builds load side by side.
 */
const UnreadBundle = Symbol.for('safebyok.unread_bundle')

/**
 * Open a handle on one user's vault. Reads the bundle and the device's remembered unlock, then
 * settles into `absent`, `locked`, or (when a remembered unlock is still fresh) `unlocked` --
 * never prompting: asking for a passphrase is the host's job, and only when a whisper is
 * actually wanted.
 *
 * An open that fails -- storage refusing a user not yet signed in, say -- rejects with the
 * storage's own error and leaves nothing running behind it, so the host simply opens again later.
 * A stored bundle that fails its checks is kind 'damaged_bundle', which no retry mends; one a
 * newer safebyok may have written, kind 'newer_format': update the app; one older than this device
 * has already seen the vault at, kind 'rolled_back', which also forgets this device's remembered
 * unlock (see the `Vault`'s own doc). Kind 'bad_option' for a `vaultDB` that is not an instance
 * of the `VaultDB` class.
 * Misuse is refused before storage is touched: kind 'bad_label' for a label or a `userId` that
 * fails its check (`validators`), and 'bad_option' for any other option, a `vaultDB` or
 * `deviceDB` short of a verb among them. Kind 'insecure_context', first of all, in a page the
 * browser says is not a secure context (`isSecureContext` false: plain http, anywhere but
 * localhost), where it withholds WebCrypto: serve the app over https.
 *
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 *   vault.getSnapshot().state  // 'absent' | 'locked' | 'unlocked'
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, deviceDB, keyDeriver })
 */
export const openVault = async (opts: OpenVaultOpts): Promise<Vault> => {
  ensureSecureContext()
  if (! isBag(opts)) { throw new VaultError('bad_option', 'openVault takes one bag of options: applabel, userId, vaultlabel, vaultDB, deviceDB and keyDeriver at least.') }
  const rules = Names.rulesOf(opts.validators)
  const scope = Names.checkScope(rules, { applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
  const { applabel, vaultlabel } = scope
  const givenVaultDB = parseVaultDB(opts.vaultDB)
  // Every failure of the device's own storage reaches the vault's callers as a condition, with a kind.
  const deviceDB = deviceTroubleAsConditions(parseDeviceDB(opts.deviceDB))
  const reentryMillis = parseForcePassphraseReentryHours(opts.forcePassphraseReentryHours)
  const logger = parseLogger(opts.logger)
  // The vault's logger is its storage's too, unless the host made the storage with its own.
  if (opts.logger !== undefined) { givenVaultDB.adoptLogger(logger) }
  const clock = parseClock(opts.clock)
  // Every reading of the host's clock is checked, this first one so that a clock counting in the
  // wrong unit fails the open rather than some later call.
  readClock(clock)
  /** A checked reading of the host's clock. One that fails drops the vaultKey first: no deadline can be trusted now. */
  const clockNow = () => {
    try {
      return readClock(clock)
    } catch (err) {
      dropKey()
      bump()
      throw err
    }
  }
  const keyDeriver = parseKeyDeriver(opts.keyDeriver, logger)
  const strengthTest = parseStrengthTest(opts.passphraseStrengthTest)
  const whisperByteLimit = parseMaxWhisperBytes(opts.maxWhisperBytes)
  const lockboxLimit = parseMaxLockboxes(opts.maxLockboxes, parseDeclared(givenVaultDB, 'maxLockboxes'))
  const vaultByteLimit = ensureLimitsFit(givenVaultDB, whisperByteLimit, lockboxLimit)
  // Every storage refusal, whichever call met it, passes by the refusal policy on its way out.
  const vaultDB = RefusalPolicy.heed(givenVaultDB, async (refusal) => { await heedRefusal(refusal) })

  let bundle: VaultBundle | null | typeof UnreadBundle = UnreadBundle
  // This device's mark for the bundle in hand, set with it, so the two always name one vault.
  let deviceMark: SeenMark | null = null
  // The vault this handle last drafted, and the device_id its first way in carries: whichever of
  // this handle's reads starts the vault's mark -- the unlock making it, or a refresh its write
  // set off -- starts it under that id.
  let drafted: { vault_id: string, device_id: string } | null = null
  let boxes: readonly (LockboxSummary | DamagedLockbox)[] = []
  let askPassphraseAt: number | null = null
  let vaultKey: CryptoKey | null = null
  let closed = false
  // How many times this handle has locked. An unlock under way notes the number when it starts,
  // and takes nothing up if a lock has moved it meanwhile: the lock wins. Its twin across the
  // handles on this device is the device mark's lock_generation.
  let shutsSoFar = 0
  // How many hard locks this handle has met: every shut, a close(), and a key outlived by a
  // refresh. A read under way notes the number when it starts, and hands back nothing if it has
  // moved meanwhile. A soft lock's timer, or a clock that fails, drops the key without counting.
  let hardLocksSoFar = 0
  // The timer that drops the vaultKey, and when it falls due: a minute past askPassphraseAt (see
  // ExpiryGraceMillis), or sooner for lockSoon(). Null when no key is held, or the one held lasts
  // until lock().
  let pendingShut: { timer: ReturnType<typeof setTimeout>, dueAt: number } | null = null

  const listeners = new Set<() => void>()
  const vaultState = (): VaultState => {
    if (bundle === UnreadBundle) { return 'opening' }
    if (bundle === null) { return 'absent' }
    if (vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > clockNow()) { return 'unlocked' }
    return 'locked'
  }
  /** The public face of each way into the vault, once there is one. */
  const unlockSummaries = (): readonly UnlockSummary[] => (
    bundle === UnreadBundle || bundle === null ? [] : bundle.unlocks.map((envelope) => Envelope.summarize(envelope))
  )
  // Whether the last read of storage succeeded, as the snapshot says; and whether the storage
  // watch has warned of a failing streak it has not yet seen end.
  let syncing = true
  let watchWarned = false
  let snapshot: VaultSnapshot = { state: vaultState(), scope, boxes, askPassphraseAt, unlocks: [], syncing }
  // The snapshot keeps its identity until something really changed: useSyncExternalStore's
  // contract, and what spares React a render when a background refresh found nothing new.
  const bump = () => {
    const state = vaultState()
    const next: VaultSnapshot = { state, scope, boxes, askPassphraseAt: state === 'unlocked' ? askPassphraseAt : null, unlocks: unlockSummaries(), syncing }
    if (stableJsonify(next) === stableJsonify(snapshot)) { return }
    snapshot = next
    listeners.forEach((listener) => { listener() })
  }

  // The context each encryption is bound to; see VOCABULARY.md on cipherAdditionalData. An
  // unlock envelope's binding is Envelope's. The remembered device unlock's binds every field of
  // its record but the key and the wrap, the scope, vault and epoch as this vault expects them.
  const localBinding = (vaultId: string, epoch: number, deadline: number) => (
    cipherBinding('safebyok-unlock-v1', applabel, scope.user_id, vaultlabel, vaultId, epoch, deadline, 'vault_key_local_wrapped')
  )
  // A lockbox's binds its format, the vault it lies in, and its record's whole public header:
  // every field but the format, which leads, and the two encrypted ones, so a bag, a time, its
  // codec or its vaultKey's epoch altered in storage refuses to open.
  const boxBinding = (vaultId: string, header: LockboxHeader, purpose: 'lockbox_key_wrapped' | 'whisper_ciphered') => (
    cipherBinding(LockboxFormat, applabel, scope.user_id, vaultlabel, vaultId, purpose, header)
  )

  /**
   * Bring the snapshot up to what storage holds now, one read at a time: a refresh asked for while
   * one runs is served by one more run once that ends, shared by every request made meanwhile, so
   * each caller sees storage as it stood after it asked, and no two reads interleave.
   */
  const refresh = oneAtATime(() => readStorage())

  /** One read of storage into the snapshot. One that fails leaves the snapshot as it stood, but for its `syncing`. */
  const readStorage = async () => {
    try {
      await takeStorage()
    } catch (err) {
      syncing = false
      bump()
      throw err
    }
    if (! watchWarned) { return }
    watchWarned = false
    logger.log('Storage reads again after the failures the vault warned of: what it shows has caught up with storage.', { call: 'refresh' })
  }

  const takeStorage = async () => {
    // The mark the bundle is held to is read before it (see heedMark), and an older copy of a vault
    // this device has seen newer is refused before anything is taken from it.
    const seenBefore = checkedMark(await deviceDB.readMark(scope))
    const fresh = await damagedAs(vaultDB.readBundle(scope), damagedBundle)
    const mark = fresh === null ? null : await heedMark(fresh, { seenBefore, call: 'refresh' })
    // A change to the unlocks elsewhere (new epoch) or a deletion ends this device's unlock: the
    // vaultKey in hand still works on old rows, but passing as current invites confusion.
    const outlived = vaultKey !== null && bundle !== UnreadBundle && bundle !== null
      && (fresh?.unlock_epoch !== bundle.unlock_epoch || fresh.vault_id !== bundle.vault_id)
    if (outlived) {
      hardLocksSoFar += 1
      dropKey()
      await deviceDB.eraseUnlock(scope)
    }
    bundle = fresh
    deviceMark = mark
    const listed = fresh === null ? [] : await vaultDB.listBoxes(scope)
    // A lockbox under a vaultKey the vault does not hold lists as damaged from its epoch alone.
    boxes = fresh === null ? [] : listed.map((box) => (isUnderHeldKey(box, fresh) ? box : asDamaged(box)))
    syncing = true
    bump()
  }

  /** `kept`, a mark the deviceDB handed back, when it passes its check and is of this scope; null otherwise. */
  const checkedMark = (kept: unknown): DeviceMark | null => {
    const checked = DeviceMark.safeParse(kept)
    return checked.success && Names.sameScope(checked.data, scope) ? checked.data : null
  }

  /**
   * This device's mark for the vault, as kept: one that does not pass its check, or names some
   * other scope, reads as none, as on a device that never saw the vault -- and is said so once,
   * since the rollback check starts again from what storage holds now.
   */
  const keptMark = async (call: VaultCall): Promise<DeviceMark | null> => {
    const kept = await deviceDB.readMark(scope)
    if (kept === null) { return null }
    const checked = checkedMark(kept)
    if (checked !== null) { return checked }
    logger.warn("This device's mark of the newest copy of the vault it had seen could not be read, so it starts again from the copy storage holds now.", { call })
    return null
  }

  /**
   * This device's mark for `fresh`, a bundle storage handed back, kept up to date: a bundle of the
   * vault the mark names, at an `unlock_epoch` or a `vault_key_epoch` below the one this device has
   * seen, is refused as 'rolled_back', and nothing is written or taken from it. The vaultKey's
   * epoch is bound into every envelope and held to the bundle's, so storage cannot raise it on an
   * older bundle and still have a way in open; the unlock epoch is bound into nothing, so an older
   * bundle at the same vaultKey under a raised unlock epoch passes.
   *
   * `seenBefore` is the mark as it was read before `fresh` was, which the bundle is then held to,
   * when the caller read one: storage held that epoch when the mark was written, so a bundle read
   * after it is older only if storage went back. The mark as it stands now could hold a newer
   * epoch, written meanwhile by another tab or this one, and refuse a bundle that was the newest
   * when it was read.
   */
  const heedMark = async (fresh: VaultBundle, opts: { seenBefore?: DeviceMark | null, call: VaultCall }): Promise<SeenMark> => {
    const kept = await keptMark(opts.call)
    const held = (opts.seenBefore === undefined ? kept : opts.seenBefore)?.seen ?? null
    const older = held !== null && held.vault_id === fresh.vault_id
      && (fresh.unlock_epoch < held.unlock_epoch || fresh.vault_key_epoch < held.vault_key_epoch)
    if (older) {
      const refusal = new VaultError('rolled_back', "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it by forgetting what it saw of the vault (its deviceDB's eraseMark) and opening the vault again; otherwise the app's support should look at its storage.")
      // Storage that hands back an older copy is not to be trusted with an unlocked vault.
      await heedRefusal(refusal)
      throw refusal
    }
    return await raiseMark(kept, fresh)
  }

  /**
   * The mark this device keeps once it has seen `fresh`: `kept` itself when it has already seen
   * that vault at that `unlock_epoch` and `vault_key_epoch` or past both, and otherwise a new mark
   * at the higher of each, written before it is returned -- under the `device_id` `kept` has seen
   * that vault under, and for a vault not seen, the one this handle drafted it under, or a new one.
   */
  const raiseMark = async (kept: DeviceMark | null, fresh: VaultBundle): Promise<SeenMark> => {
    const mark = markSeeing(kept, fresh)
    if (mark.seen !== kept?.seen) { await deviceDB.writeMark(mark) }
    return mark
  }

  /** The mark {@link raiseMark} keeps, `kept` itself (whose `seen` it keeps) when nothing is raised. */
  const markSeeing = (kept: DeviceMark | null, fresh: VaultBundle): SeenMark => {
    const seen = kept?.seen?.vault_id === fresh.vault_id ? kept.seen : null
    if (kept !== null && seen !== null && seen.unlock_epoch >= fresh.unlock_epoch && seen.vault_key_epoch >= fresh.vault_key_epoch) { return { ...kept, seen } }
    return {
      format:          MarkFormat,
      ...scope,
      // The scope's locks count on, whichever vault stands under it.
      lock_generation: kept?.lock_generation ?? 0,
      seen:            {
        device_id:       seen?.device_id ?? newDeviceIdFor(fresh.vault_id),
        vault_id:        fresh.vault_id,
        unlock_epoch:    Math.max(seen?.unlock_epoch ?? 0, fresh.unlock_epoch),
        vault_key_epoch: Math.max(seen?.vault_key_epoch ?? 0, fresh.vault_key_epoch),
      },
    }
  }

  /** This scope's mark with nothing seen, at `lockGeneration`: what a lock leaves where no vault was seen, and destroy() leaves of one. */
  const blankMark = (lockGeneration: number): DeviceMark => ({ format: MarkFormat, ...scope, lock_generation: lockGeneration, seen: null })

  /** The `device_id` a mark of `vaultId` starts under: the one this handle drafted it under, or a new one. */
  const newDeviceIdFor = (vaultId: string): string => (drafted?.vault_id === vaultId ? drafted.device_id : randomId())

  /**
   * This device's id for the vault `standing` is, which every way in it adds carries: the one its
   * mark holds, set with the bundle in hand. A bundle in hand that has moved on to another vault
   * meanwhile is said as the stale write it would make.
   */
  const deviceIdFor = (standing: VaultBundle): string => {
    if (deviceMark?.seen.vault_id === standing.vault_id) { return deviceMark.seen.device_id }
    throw new VaultError('stale_write', 'The vault changed in storage while this device was reading it -- it was deleted or made anew elsewhere -- so nothing was written. Read the vault again before retrying.')
  }

  const ensureOpen = () => {
    if (closed) { throw new VaultError('vault_closed', 'This vault handle was closed: open the vault again.') }
  }
  /**
   * The vaultKey, for an operation that touches a secret, which calls this first. The threshold is
   * the truth: past `askPassphraseAt` no new work starts, whatever any timer has done. The key
   * itself stays for work already in hand until its shut time, when its timer drops it, or the
   * next look after, should the timer run late.
   */
  const ensureUnlocked = (): CryptoKey => {
    ensureOpen()
    const now = clockNow()
    dropKeyIfDue(now)
    if (vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > now) { return vaultKey }
    bump()
    throw lockedError()
  }
  /**
   * The vaultKey, for an operation already past `ensureUnlocked()` that looks again: only a shut,
   * a close, a relock by a vault reborn elsewhere, or the key's shut time passing has taken it,
   * never the entry gate closing.
   */
  const keyInHand = (): CryptoKey => {
    ensureOpen()
    dropKeyIfDue(clockNow())
    if (vaultKey === null) { throw lockedError() }
    return vaultKey
  }

  const currentBundle = (): VaultBundle => {
    if (bundle === UnreadBundle || bundle === null) {
      throw new VaultError('absent_vault', 'This vault has not been created yet: the first unlock() creates it.')
    }
    return bundle
  }

  /**
   * The vaultKey out of whichever of `standing`'s ways in `proof` opens, or the one `unlockId`
   * names; its refusal IS the passphrase (or passkey) check.
   */
  const unwrapWith = async (standing: VaultBundle, proof: UnlockProof, unlockId?: string) => (
    await Envelope.open(keyDeriver, proof, scope, standing, unlockId)
  )

  /**
   * A brand-new bundle around a brand-new vaultKey, wrapped under `passphrase`: its one way in,
   * added by this device under `deviceId`.
   */
  const draftBundle = async (passphrase: string, deviceId: string): Promise<{ draft: VaultBundle } & VaultKeyPair> => {
    const identity = { vault_id: randomId(), registered_at: clockNow() }
    const freshKey = await makeVaultKey()
    const stamp: EnvelopeStamp = {
      unlock_id:       randomId(),
      unlocklabel:     FirstUnlocklabel,
      vault_key_epoch: FirstVaultKeyEpoch,
      device_id:       deviceId,
      registered_at:   identity.registered_at,
    }
    const { envelope, sessionKey } = await Envelope.sealFirstPassphrase(keyDeriver, passphrase, scope, identity, stamp, freshKey)
    const draft: VaultBundle = {
      format:              'safebyok-vault-v2',
      ...scope,
      ...identity,
      unlock_epoch:        1,
      vault_key_epoch:     FirstVaultKeyEpoch,
      unlocks:             [envelope],
    }
    return { draft, transientKey: freshKey, sessionKey }
  }

  /**
   * The vaultKey for an unlock, and the bundle it was proven against: creating the vault when
   * absent, proving the proof when not. An unlock aimed at one way in never creates: the vault it
   * named no longer stands. Nor does a passkey's: a vault is created with a passphrase.
   */
  const settleUnlock = async (proof: UnlockProof, unlockId: string | undefined): Promise<{ standing: VaultBundle } & VaultKeyPair> => {
    if (bundle === null || bundle === UnreadBundle) {
      if (typeof proof !== 'string') {
        throw new VaultError('absent_vault', 'This vault has not been created yet, so no passkey opens it: the first unlock(), with a passphrase, creates it.')
      }
      if (unlockId !== undefined) {
        throw new VaultError('absent_unlock', "This vault has no way in with that unlock_id: it does not exist, and may have been destroyed on another device. Unlock without an unlockId to create it anew.")
      }
      await ensureStrongEnough(strengthTest, proof)
      const deviceId = randomId()
      const { draft, transientKey, sessionKey } = await draftBundle(proof, deviceId)
      drafted = { vault_id: draft.vault_id, device_id: deviceId }
      // Another device's vault, if one was made meanwhile, is held to the mark as it was before it.
      const seenBefore = checkedMark(await deviceDB.readMark(scope))
      const settled = await damagedAs(vaultDB.createBundle(draft), damagedBundle)
      const mark = await heedMark(settled, { seenBefore, call: 'unlock' })
      bundle = settled
      deviceMark = mark
      if (settled.vault_id === draft.vault_id) { return { standing: settled, transientKey, sessionKey } }
      // Another device created the vault between our look and our write: the settled bundle is
      // theirs, and this passphrase must prove itself against it like any other.
      return { standing: settled, ...await unwrapWith(settled, proof, unlockId) }
    }
    const standing = bundle
    return { standing, ...await unwrapWith(standing, proof, unlockId) }
  }

  /**
   * Rewrite the vault's ways in: prove `proof` against the bundle as storage holds it now (or
   * against the one way in `unlockId` names), write the unlocks `revise` makes of the standing ones
   * under the next unlock epoch, and take up the unlock under it. `check` runs first, on the
   * standing bundle, so a change refused for what it asks costs no key derivation.
   *
   * Every change to the unlocks goes through here: the proof first, the write only if no other
   * device changed them meanwhile, and a shut while it runs leaving the change landed and the vault
   * locked, as `changePassphrase()` promises.
   */
  const reviseUnlocks = async (
    proof: UnlockProof,
    unlockId: string | undefined,
    plan: {
      call:    'changePassphrase' | 'addPassphrase' | 'addPasskey' | 'removeUnlock'
      check?:  (standing: VaultBundle) => void
      // Runs once the proof holds, given this device's id for the vault; resolving null abandons
      // the change, writing nothing.
      revise:  (standing: VaultBundle, proven: VaultKeyPair & { unlockId: string }, deviceId: string) => UnlockEnvelope[] | Promise<UnlockEnvelope[] | null>
    },
  ): Promise<boolean> => {
    const started = await noteStart()
    // The proof is made against the bundle as the backend holds it now: a cached bundle could
    // bury one written elsewhere under a different vault_id entirely.
    await refresh()
    const standing = currentBundle()
    const deviceId = deviceIdFor(standing)
    plan.check?.(standing)
    const proven = await unwrapWith(standing, proof, unlockId)
    const unlocks = await plan.revise(standing, proven, deviceId)
    if (unlocks === null) { return false }
    const next: VaultBundle = {
      ...standing,
      unlock_epoch:     standing.unlock_epoch + 1,
      unlocks,
    }
    await refreshOnStale(vaultDB.updateBundle(next, { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }), plan.call)
    // The change has landed, whatever happens now: what follows is this device's own, and a
    // failure of it is said through the logger, never thrown as though the change had not landed.
    deviceMark = await raiseMarkAfter(next, plan.call)
    bundle = next
    // A shut meanwhile leaves only the change's unlock untaken.
    try {
      await takeUpUnlock(proven, next, started, deadlineFor(proof, 'revise'))
    } catch (err) {
      logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands as it stood here, and asks for the passphrase at its next open.", { call: plan.call }, asError(err))
    }
    bump()
    return true
  }

  /**
   * This device's mark raised to `next`, a bundle its own write just landed: never a refusal, as a
   * newer one seen meanwhile stands. A device store that fails to keep it is said through the
   * logger, and the mark is held in memory as raised: a missed mark only weakens the rollback
   * check until a later read raises it.
   */
  const raiseMarkAfter = async (next: VaultBundle, call: VaultCall): Promise<SeenMark> => {
    try {
      return await raiseMark(await keptMark(call), next)
    } catch (err) {
      logger.warn("The change to the vault's ways in landed in storage, but this device could not note it in its mark of the vault: the change stands, and the mark catches up at a later read.", { call }, asError(err))
      return markSeeing(deviceMark, next)
    }
  }

  /** A passphrase envelope in `standing` for `newPassphrase`, stamped `stamp`, around the vaultKey `proven` holds. */
  const sealFor = async (standing: VaultBundle, newPassphrase: string, stamp: EnvelopeStamp, proven: VaultKeyPair) => {
    return await Envelope.sealPassphrase(keyDeriver, newPassphrase, scope, standing, stamp, proven.transientKey)
  }

  /**
   * The stamp of a way in this device adds to `standing` now, named `naming`: around the vaultKey
   * the bundle stands for, under this device's id for the vault.
   */
  const newStamp = (standing: VaultBundle, naming: { unlock_id: string, unlocklabel: string }, deviceId: string): EnvelopeStamp => ({
    ...naming,
    vault_key_epoch: standing.vault_key_epoch,
    device_id:       deviceId,
    registered_at:   clockNow(),
  })

  /** Refuse a new passkey whose credential is already one of `standing`'s ways in. */
  const ensureNewCredential = (standing: VaultBundle, passkey: PasskeyProof) => {
    // Neither refusal here quotes an unlocklabel: a host's unlocklabel check may admit any text.
    if (standing.unlocks.some((envelope) => envelope.method === 'passkey' && envelope.credential_id === passkey.credentialId)) {
      throw new VaultError('bad_option', "That passkey is already a way into this vault: the snapshot's unlocks list each passkey's credential_id, beside its unlocklabel.")
    }
  }

  /** Refuse a new way in labelled `unlocklabel` that `standing` has no room or label for. */
  const ensureRoomForUnlock = (standing: VaultBundle, unlocklabel: string) => {
    if (standing.unlocks.some((envelope) => envelope.unlocklabel === unlocklabel)) {
      throw new VaultError('bad_label', "This vault already has a way in under that unlocklabel: pick another. The snapshot's unlocks list the labels taken.")
    }
    if (standing.unlocks.length >= MaxUnlocks) {
      throw new VaultError('too_many_unlocks', `This vault already holds its limit of ${String(MaxUnlocks)} ways in: remove one before adding another.`)
    }
  }

  /**
   * Forget the unlock, in memory and on this device. Every lock goes through here but a
   * `lockSoon()` with a grace, which does the same save that the key waits for its timer; whatever
   * unlock is under way when either does loses to it, in this handle or another on this device.
   */
  const shut = async (call: VaultCall) => {
    shutsSoFar += 1
    hardLocksSoFar += 1
    dropKey()
    await forgetUnlock(call)
  }

  /** {@link shut}, and the snapshot told, even when the device store fails: the key is dropped at once. */
  const shutAndSay = async (call: VaultCall) => {
    try {
      await shut(call)
    } finally {
      bump()
    }
  }

  /**
   * Forget this device's remembered unlock, raising its mark's lock generation first -- a scope
   * with no mark readable gets one with nothing seen, at generation 1 -- so an unlock under way in
   * any handle on this device, which began under the generation before, writes no record after
   * this one is erased: the versioned erase. An unlock creating the vault loses to it too.
   */
  const forgetUnlock = async (call: VaultCall) => {
    const kept = await keptMark(call)
    await deviceDB.writeMark(kept === null ? blankMark(1) : { ...kept, lock_generation: kept.lock_generation + 1 })
    await deviceDB.eraseUnlock(scope)
  }

  /**
   * What an unlock notes as it starts, to tell whether a lock lands while it is under way: this
   * handle's shut count, and the lock generation of this device's mark (0 with none).
   */
  const noteStart = async (): Promise<UnlockStart> => {
    const shutsThen = shutsSoFar
    const kept = checkedMark(await deviceDB.readMark(scope))
    return { shutsThen, lockGeneration: kept?.lock_generation ?? 0 }
  }

  /**
   * Do what the refusal policy says of a refusal, before it is thrown: for storage the vault
   * cannot trust -- a user no longer signed in, an older copy of the vault -- lock, as `lock()`
   * does. The refusal is what the caller must hear, so a device store that will not forget the
   * remembered unlock is only logged.
   */
  const heedRefusal = async (refusal: VaultError) => {
    if (RefusalPolicy.decide(refusal) !== 'lock') { return }
    const why = refusal.kind === 'rolled_back'
      ? 'Storage handed back an older copy of the vault than this device has seen'
      : 'Storage no longer serves the user this vault was opened for -- signed out, or another user signed in --'
    const wasUnlocked = vaultKey !== null
    try {
      await shut('untrustedStorage')
    } catch (err) {
      logger.warn(`${why} so the vault locked, but this device's remembered unlock could not be forgotten: the next open may pick it up.`, { call: 'untrustedStorage' }, asError(err))
    }
    bump()
    if (wasUnlocked) {
      logger.log(`${why} so the vault locked, as it always does when storage cannot be trusted with it. It asks for the passphrase again once storage is sound.`, { call: 'untrustedStorage' })
    }
  }

  /** Forget the unlock in memory, and the timer left to do so. */
  const dropKey = () => {
    cancelPendingShut()
    vaultKey = null
    askPassphraseAt = null
  }

  const cancelPendingShut = () => {
    if (pendingShut === null) { return }
    clearTimeout(pendingShut.timer)
    pendingShut = null
  }

  /**
   * Drop the vaultKey at `dueAt`, read against `now`, unless a shut already pending falls due
   * sooner: a shut time only ever moves earlier, until an unlock takes up a key anew.
   */
  const shutAt = (dueAt: number, now: number) => {
    if (pendingShut !== null && pendingShut.dueAt <= dueAt) { return }
    cancelPendingShut()
    pendingShut = { timer: unrefTimeout(dropNow, dueAt - now), dueAt }
  }

  /** Drop the vaultKey now, and say so: what each shut timer does when it rings. */
  const dropNow = () => {
    dropKey()
    bump()
  }

  /**
   * Arm the shut for a key taken up until `until`, at `now`, in place of any pending: a minute
   * past the deadline, for work in hand to finish, unless the key lasts until `lock()`. One timer
   * at a time: the first rings at the deadline, so the snapshot says `locked` then, and leaves
   * the second to drop the key at its shut time, read against the clock as it rings: a timer that
   * rang late leaves the second no more than what was left.
   */
  const armExpiry = (until: number, now: number) => {
    cancelPendingShut()
    if (isFarFuture(until)) { return }
    const dueAt = until + ExpiryGraceMillis
    const atDeadline = () => {
      try {
        pendingShut = { timer: unrefTimeout(dropNow, dueAt - clockNow()), dueAt }
        bump()
      } catch (err) {
        // The clock read has dropped the key already; a timer has nobody else to tell.
        logger.warn("The clock passed to openVault failed when the unlock's window ended, so the vault dropped its key at once, without the minute's grace. The clock's now() must return epoch milliseconds, as Date.now() does.", { call: 'expiry' }, asError(err))
      }
    }
    pendingShut = { timer: unrefTimeout(atDeadline, until - now), dueAt }
  }

  /** True when the vaultKey's shut time has come by `now`, whether or not its timer has run. */
  const isShutDue = (now: number) => pendingShut !== null && pendingShut.dueAt <= now

  /** Drop the vaultKey now if its shut time has come and its timer has not yet run. */
  const dropKeyIfDue = (now: number) => {
    if (! isShutDue(now)) { return }
    dropKey()
    bump()
  }

  /** A reading of the clock for lockSoon(), or null, said through the logger, when the clock fails. */
  const readClockOrNull = (): number | null => {
    try {
      return clockNow()
    } catch (err) {
      logger.warn("lockSoon() could not read the clock passed to openVault, so the vault locked at once, without a grace. The clock's now() must return epoch milliseconds, as Date.now() does.", { call: 'lockSoon' }, asError(err))
      return null
    }
  }

  /** True when the vault has shut since `shutsThen` was read from `shutsSoFar`. */
  const shutSince = (shutsThen: number) => shutsSoFar !== shutsThen

  /**
   * True when the handle has closed, or the vault has shut since `shutsThen`, or the bundle
   * standing now is no longer the one `standing` proved a passphrase against: destroyed, made
   * anew, or its unlocks changed, here or elsewhere.
   */
  const outrun = (standing: VaultBundle, shutsThen: number) => (
    closed || shutSince(shutsThen) || bundle === null || bundle === UnreadBundle
    || bundle.vault_id !== standing.vault_id || bundle.unlock_epoch !== standing.unlock_epoch
  )

  /**
   * The deadline of an unlock taken up now by `proof`, in `call`. The window renews whenever the
   * user proves who they are by typing a passphrase, in any call: an `unlock()`, a change of
   * passphrase, a way in added or removed. An `unlock()` by passkey sets it too, as it unlocks. A
   * passkey proving a change to the ways in keeps the deadline that stands, when the vault is
   * unlocked, and sets one only when it is not. Every proof passes through here, and nothing else
   * -- a read, a store, a refresh -- moves the deadline.
   */
  const deadlineFor = (proof: UnlockProof, call: 'unlock' | 'revise'): number => {
    const now = clockNow()
    const standing = vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > now ? askPassphraseAt : null
    const renews = call === 'unlock' || typeof proof === 'string'
    return renews || standing === null ? deadlineAfter(now, reentryMillis) : standing
  }

  /**
   * Remember an unlock on this device and take up its vaultKey until `until`, ending any grace
   * lockSoon() left and arming the shut anew -- unless something wins over it since `started`:
   * a lock in this handle, or in another on this device (whose raised lock generation refuses the
   * record), the handle closing, or the bundle the key was proven against no longer standing.
   * Then nothing is taken up. A record already written stays, but for a lock in this handle,
   * whose own erase may have run before it landed: a close is no lock, and a record of a bundle no
   * longer standing opens nothing.
   *
   * @returns True when the vault is now unlocked.
   */
  const takeUpUnlock = async (unlocked: VaultKeyPair, standing: VaultBundle, started: UnlockStart, until: number): Promise<boolean> => {
    if (outrun(standing, started.shutsThen)) { return false }
    try {
      // The transient's last act: wrapped into this device's remembered unlock, then dropped.
      await rememberDevice(unlocked.transientKey, standing, until, started.lockGeneration)
    } catch (err) {
      if (isVaultError(err, 'stale_write')) { return false }
      throw err
    }
    if (shutSince(started.shutsThen)) { await deviceDB.eraseUnlock(scope) }
    if (outrun(standing, started.shutsThen)) { return false }
    armExpiry(until, clockNow())
    vaultKey = unlocked.sessionKey
    askPassphraseAt = until
    return true
  }

  /**
   * Mint a fresh localUnlockKey, wrap the vaultKey under it, and remember the unlock on this
   * device, while its mark still stands at `lockGeneration`: kind 'stale_write' otherwise.
   */
  const rememberDevice = async (unlockedKey: CryptoKey, standing: VaultBundle, until: number, lockGeneration: number) => {
    const localUnlockKey = await makeLocalUnlockKey()
    const wrapped = await wrapKeyUnder(localUnlockKey, unlockedKey, localBinding(standing.vault_id, standing.unlock_epoch, until))
    await deviceDB.writeUnlock({
      format:                  'safebyok-unlock-v1',
      ...scope,
      vault_id:                standing.vault_id,
      unlock_epoch:            standing.unlock_epoch,
      local_unlock_key:        localUnlockKey,
      vault_key_local_wrapped: wrapped,
      ask_passphrase_at:       until,
    }, { lock_generation: lockGeneration })
  }

  /**
   * Pick up a remembered unlock, if this device holds one that still fits and still opens. The
   * deviceDB may be the host's own, so what it hands back is checked here, whoever wrote it: a
   * record that does not pass reads as "no remembered unlock", the safe failure.
   *
   * A record whose deadline lies past what this open's forcePassphraseReentryHours allows from
   * now was remembered under a longer setting, and does not fit either: lowering the option has
   * each device ask again at its next open, and raising it lengthens no unlock already
   * remembered. Nothing on this path writes a record, so it can never bring back one that
   * another tab's lock() erased meanwhile.
   */
  const rememberedUnlock = async () => {
    if (bundle === UnreadBundle || bundle === null) { return }
    const shutsThen = shutsSoFar
    const kept = await deviceDB.readUnlock(scope)
    if (kept === null) { return }
    const checked = DeviceUnlock.safeParse(kept)
    // A record naming some other scope is out of place, as unreadable as a mangled one.
    const readable = checked.success && Names.sameScope(checked.data, scope)
    const now = clockNow()
    const fits = readable
      && checked.data.vault_id === bundle.vault_id
      && checked.data.unlock_epoch === bundle.unlock_epoch
      && checked.data.ask_passphrase_at > now
      && checked.data.ask_passphrase_at <= deadlineAfter(now, reentryMillis)
    if (! fits) {
      await deviceDB.eraseUnlock(scope)
      // Expired, or outdated by a change to the unlocks or a shorter setting, is routine; unreadable is worth a word.
      if (! readable) { forgetUnreadableUnlock() }
      return
    }
    const remembered = checked.data
    try {
      // Nothing on the remembered path ever re-wraps the vaultKey, so no extractable handle
      // exists on it at all.
      const unwrapped = await unwrapKeyUnder(
        remembered.local_unlock_key,
        remembered.vault_key_local_wrapped,
        localBinding(bundle.vault_id, bundle.unlock_epoch, remembered.ask_passphrase_at),
        { extractable: false, usage: ['wrapKey', 'unwrapKey'] },
      )
      // A shut meanwhile -- a storage refusal saying the user signed out -- wins over the record.
      if (closed || shutSince(shutsThen)) { return }
      armExpiry(remembered.ask_passphrase_at, now)
      vaultKey = unwrapped
      askPassphraseAt = remembered.ask_passphrase_at
    } catch {
      // A record that no longer opens reads as "no remembered unlock": the safe failure.
      await deviceDB.eraseUnlock(scope)
      forgetUnreadableUnlock()
    }
  }

  // Told once the record is erased, so it never claims a forgetting that failed. Neither the record
  // nor the reason it failed is told: the record holds key material, and its validator's issues
  // may quote it.
  const forgetUnreadableUnlock = () => {
    logger.warn("This device's remembered unlock could not be read or would not open, so it was forgotten: the vault opens locked, and asks for the passphrase again.", { call: 'openVault' })
  }

  /**
   * What one lockbox counts for against the vault's storage: room for a whisper and public bag of
   * `maxWhisperBytes` together (twice that, as {@link StoredBytesPerWhisperByte} says), its
   * fixed-size fields, and its scope and boxlabel as measured, so names of any length are counted
   * as they are.
   */
  const lockboxWeight = (boxlabel: string) => (
    (whisperByteLimit * StoredBytesPerWhisperByte) + LockboxFixedBytes + jsonBytes([scope, boxlabel])
  )

  /**
   * Refuse a whisper whose JSON, with the public bag's beside it, is over `maxWhisperBytes`: kind
   * 'whisper_too_large', quoting neither.
   */
  const ensureWhisperFits = (whisperBytes: Uint8Array, publicJson: string) => {
    const publicBytes = new TextEncoder().encode(publicJson).length
    if (whisperBytes.length + publicBytes <= whisperByteLimit) { return }
    throw new VaultError('whisper_too_large', `That whisper and its lockbox's public bag are over this vault's limit of ${String(whisperByteLimit)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to openVault.`)
  }

  /**
   * Refuse a write that would crowd the vault: a new lockbox while it holds `maxLockboxes`, or one
   * that would take the vault past its storage's `maxVaultBytes` (each weighed by
   * {@link lockboxWeight}). Counted from the snapshot's boxes, which every write and
   * every change pushed from storage refreshes, so a store costs no extra read of the whole vault;
   * a vault that looks full is caught up with storage before it is refused.
   */
  const ensureRoomFor = async (boxlabel: string, prev: Lockbox | null) => {
    // A replacement weighs what it replaces, so it never makes the vault fuller: it always lands.
    if (prev !== null) { return }
    const weight = lockboxWeight(boxlabel)
    const crowding = () => {
      const others = boxes.filter((box) => box.boxlabel !== boxlabel)
      if (others.length >= lockboxLimit) { return 'count' }
      const othersWeight = others.reduce((sum, box) => sum + lockboxWeight(box.boxlabel), 0)
      return othersWeight + weight > vaultByteLimit ? 'bytes' : null
    }
    if (crowding() === null) { return }
    await refresh()
    const crowded = crowding()
    if (crowded === 'count') {
      throw new VaultError('vault_full', `This vault already holds its limit of ${String(lockboxLimit)} lockboxes: erase one before storing another. A vault meant to hold more can be opened with a larger maxLockboxes, up to what its storage adapter allows.`)
    }
    if (crowded === 'bytes') {
      throw new VaultError('vault_full', `This vault has no room for that lockbox in the ${String(vaultByteLimit)} bytes its storage holds of one vault, counting each lockbox's boxlabel and room for a whisper and public bag of maxWhisperBytes: erase a lockbox, or store under a shorter boxlabel.`)
    }
  }

  /**
   * `boxlabel`, once a lockbox stands under it, for erase(), which reaches a lockbox by the name it
   * was stored under: a record that fails verification still stands, and so does one stored under
   * a name the vault's boxlabel check refuses (by another client, or under other checks). Storage
   * is read once.
   */
  const checkStandingBoxlabel = async (boxlabel: string): Promise<string> => {
    const label = Names.checkFloor('boxlabel', boxlabel)
    if (await readBoxOrDamaged(label) === null) { throw nothingUnder(label) }
    return label
  }

  /**
   * The revision the snapshot's listing names for the lockbox under `boxlabel`, sound or damaged;
   * null for none listed, or a damaged record that holds none. Storage arbitrates a write that
   * names it, so a listing gone stale costs a refusal and a retry, never a record.
   */
  const listedRevisionOf = (boxlabel: string): string | null => boxes.find((box) => box.boxlabel === boxlabel)?.revision_id ?? null

  /** True when the snapshot's listing shows the lockbox under `boxlabel` as damaged. */
  const isListedDamaged = (boxlabel: string): boolean => boxes.some((box) => box.boxlabel === boxlabel && box.damaged)

  /** The lockbox under `boxlabel`; null when there is none, and 'damaged' when its record fails verification. */
  const readBoxOrDamaged = async (boxlabel: string): Promise<Lockbox | 'damaged' | null> => {
    try {
      return await vaultDB.readBox(scope, boxlabel)
    } catch (err) {
      if (! isVaultError(err, 'corrupt_record')) { throw err }
      return 'damaged'
    }
  }

  const readBoxOrThrow = async (boxlabel: string) => {
    const label = Names.checkFloor('boxlabel', boxlabel)
    const lockbox = await damagedAs(vaultDB.readBox(scope, label), damagedLockbox)
    if (lockbox === null) { throw nothingUnder(label) }
    return lockbox
  }

  /**
   * Why nothing stands under `boxlabel`, a name above the floor: kind 'bad_label' when the vault's
   * boxlabel check refuses it -- the name was never one this app would store under -- and
   * 'absent_box' otherwise. The host's check runs here, once, only when storage holds nothing
   * under the name: a lockbox stored under a name it refuses reads and erases as any other.
   */
  const nothingUnder = (boxlabel: string): VaultError => {
    Names.check(rules, 'boxlabel', boxlabel)
    return absentBox()
  }

  /**
   * The whisper in `boxlabel`, for an operation that wants it whole. A hard lock landing while it
   * is read wins -- a shut, a close(), or a refresh finding the key outlived -- and the whisper is
   * dropped, never handed back: the call refuses as locked, or as closed. A soft lock, which waits
   * for work in hand, does not stop it.
   */
  const openBox = async (boxlabel: string): Promise<Whisper> => {
    const unlockedKey = ensureUnlocked()
    const hardLocksThen = hardLocksSoFar
    const lockbox = await readBoxOrThrow(boxlabel)
    const whisper = await decipherOrCatchUp(unlockedKey, lockbox)
    if (hardLocksSoFar !== hardLocksThen) {
      // A close() meanwhile is said as such: the handle, not the vault, is what refuses now.
      ensureOpen()
      throw lockedError()
    }
    return whisper
  }

  /**
   * The whisper `lockbox` holds, or -- for one that will not open under the key in hand -- one
   * catch-up with storage before the kind is named: a vault destroyed and made anew elsewhere, or
   * its ways in changed, relocks this device, and the call refuses as 'vault_locked'; otherwise
   * the lockbox is 'damaged_lockbox'. A catch-up that fails is thrown as it came: whether the box
   * is damaged is not known.
   */
  const decipherOrCatchUp = async (unlockedKey: CryptoKey, lockbox: Lockbox): Promise<Whisper> => {
    try {
      return await decipherLockbox(unlockedKey, currentBundle(), lockbox)
    } catch (err) {
      if (! isVaultError(err, 'damaged_lockbox')) { throw err }
      await refresh()
      keyInHand()
      throw err
    }
  }

  /**
   * The key a lockbox's lockboxKey is unwrapped under, chosen by its `vault_key_epoch`: the
   * session's vaultKey for a lockbox under the bundle's own. Kind 'damaged_lockbox' for a lockbox
   * under any other, which no key this vault holds opens.
   */
  const unwrappingKeyFor = (unlockedKey: CryptoKey, standing: VaultBundle, lockbox: Lockbox): CryptoKey => {
    if (lockbox.vault_key_epoch === standing.vault_key_epoch) { return unlockedKey }
    // Quotes no boxlabel, as no refusal here does: a host's boxlabel check may admit any text.
    throw new VaultError('damaged_lockbox', "That lockbox is damaged: it says it was sealed under a vaultKey this vault does not hold, so it can't be opened. It was left as it is; erase it, or store its whisper again over it.")
  }

  /**
   * Unwrap a lockbox's lockboxKey under the vaultKey, decipher its whisper, and hand it back
   * validated: kind 'damaged_lockbox' when the record will not open, or opens to no whisper.
   * The vaultKey is the vault's own, proven by the way in that gave it, so a lockbox that will not
   * open under it is one altered in storage, or moved there from somewhere else.
   */
  const decipherLockbox = async (unlockedKey: CryptoKey, standing: VaultBundle, lockbox: Lockbox): Promise<Whisper> => {
    let whisperBytes: Uint8Array
    const { format: _format, lockbox_key_wrapped: lockboxKeyWrapped, whisper_ciphered: whisperCiphered, ...header } = lockbox
    const vaultId = standing.vault_id
    const unwrappingKey = unwrappingKeyFor(unlockedKey, standing, lockbox)
    try {
      const lockboxKey = await unwrapKeyUnder(
        unwrappingKey,
        lockboxKeyWrapped,
        boxBinding(vaultId, header, 'lockbox_key_wrapped'),
        { extractable: false, usage: ['decrypt'] },
      )
      whisperBytes = await decipherBytes(lockboxKey, whisperCiphered, boxBinding(vaultId, header, 'whisper_ciphered'))
    } catch {
      throw new VaultError('damaged_lockbox', "That lockbox is damaged: it would not open under this vault's key, as if altered in storage or moved there from somewhere else. It was left as it is; erase it, or store its whisper again over it.")
    }
    const checked = Whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
    if (! checked.success) {
      throw new VaultError('damaged_lockbox', "That lockbox opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; erase it, or store its whisper again over it.")
    }
    return checked.data
  }

  /**
   * True when `prev` opens under the vault's key, and so vouches for the public fields a store
   * carries forward from it; false for a record altered in storage, whose fields nothing vouches
   * for. What it holds is dropped unread: a store compares nothing.
   */
  const recordOpens = async (unlockedKey: CryptoKey, standing: VaultBundle, prev: Lockbox): Promise<boolean> => {
    try {
      await decipherLockbox(unlockedKey, standing, prev)
      return true
    } catch {
      // decipherLockbox refuses only as damaged_lockbox: a record that will not open.
      return false
    }
  }

  /**
   * Write `lockbox` over `expected`, as `store()` does, erasing what stands under its boxlabel
   * first when `clearsFirst`. A refusal as stale has just caught this device up with storage: a
   * device it relocked, or a box it shows gone that stood when the store began (`boxStood`), ends
   * the store here -- 'erased', for the latter -- as the next attempt would end it, but without the
   * wait before it that no retry could use. Work in hand, it may finish within a grace.
   */
  const writeOver = async (lockbox: Lockbox, expected: LockboxExpectation, clearsFirst: boolean, boxStood: boolean): Promise<'written' | 'erased'> => {
    try {
      if (clearsFirst) { await refreshOnStale(vaultDB.eraseBox(scope, lockbox.boxlabel, { vault_id: expected.vault_id }), 'store') }
      await refreshOnStale(vaultDB.updateBox(scope, lockbox, expected), 'store')
    } catch (err) {
      if (! isVaultError(err, 'stale_write')) { throw err }
      keyInHand()
      if (boxStood && boxes.every((box) => box.boxlabel !== lockbox.boxlabel)) { return 'erased' }
      throw err
    }
    return 'written'
  }

  const vault: Vault = {
    reentryWindowMillis: reentryMillis,

    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    unlock: async (givenProof, unlockOpts) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      const unlockId = parseAim(unlockOpts)
      const started = await noteStart()
      // Sync with the backend first: the passphrase proves itself against the bundle as it
      // stands there now, not against a cached one a destroy or recreate may have outdated.
      await refresh()
      const unlocked = closed || shutSince(started.shutsThen) ? null : await settleUnlock(proof, unlockId)
      const tookUp = unlocked !== null && await takeUpUnlock(unlocked, unlocked.standing, started, deadlineFor(proof, 'unlock'))
      bump()
      if (tookUp) { return }
      // A close() meanwhile is said as such: the handle, not the vault, is what refuses now.
      ensureOpen()
      throw new VaultError('vault_locked', 'The vault was locked or destroyed on this device, or its ways in changed on another, while this unlock was under way, and that wins: nothing was unlocked, and this device remembers nothing. Unlock again to carry on.')
    },

    lock: async () => {
      ensureOpen()
      await shutAndSay('lock')
    },

    lockSoon: async (graceSeconds) => {
      ensureOpen()
      const graceMillis = parseGraceSeconds(graceSeconds)
      if (graceMillis === 0) {
        await shutAndSay('lockSoon')
        return
      }
      if (vaultKey !== null) {
        // A clock gone wrong cannot time a grace: the lock wins at once, as lock(). A key already
        // past its shut time gets no grace, and one past its deadline no more than the minute it
        // had left: a shut time only moves earlier.
        const now = readClockOrNull()
        if (now === null) {
          await shutAndSay('lockSoon')
          return
        }
        if (isShutDue(now)) { dropKey() } else { shutAt(now + graceMillis, now) }
      }
      // A soft lock: no new operation starts, and this device forgets its remembered unlock now,
      // but work in hand finishes -- an unlock or a change under way, here or in another tab,
      // among it -- and the vaultKey waits for it. The gate closes by having no deadline at all,
      // not one at now, which a clock stepped back reopens.
      askPassphraseAt = null
      bump()
      await deviceDB.eraseUnlock(scope)
    },

    changePassphrase: async (givenProof, newPassphrase, changeOpts) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      parsePassphrase(newPassphrase, 'changePassphrase')
      if (! newPassphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
      const unlockId = parseAim(changeOpts)
      // A passphrase proves the way in it opens, and that is the one it changes; a passkey proves
      // the user, and which passphrase to change is then the caller's to say (or the only one).
      const byPasskey = typeof proof !== 'string'
      await ensureStrongEnough(strengthTest, newPassphrase)
      await reviseUnlocks(proof, byPasskey ? undefined : unlockId, {
        call:   'changePassphrase',
        // The passphrase's way in takes the new one, keeping its stamp: its id and label, and the
        // device and time that added it. Its vault_key_epoch is the bundle's, whatever the
        // replaced envelope's: a passkey can mend a passphrase stored at another.
        revise: async (standing, proven) => {
          const replaced = passphraseToReplace(standing, byPasskey ? unlockId : proven.unlockId)
          const sealed = await sealFor(standing, newPassphrase, { ...replaced, vault_key_epoch: standing.vault_key_epoch }, proven)
          return standing.unlocks.map((envelope) => (envelope === replaced ? sealed : envelope))
        },
      })
    },

    addPassphrase: async (givenProof, newPassphrase, labelling) => {
      ensureOpen()
      parsePassphrase(newPassphrase, 'addPassphrase')
      if (! newPassphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
      const proof = parseProof(givenProof)
      const unlocklabel = parseUnlocklabel(rules, labelling, 'addPassphrase')
      await ensureStrongEnough(strengthTest, newPassphrase)
      const naming = { unlock_id: randomId(), unlocklabel }
      await reviseUnlocks(proof, undefined, {
        call:   'addPassphrase',
        check:  (standing) => { ensureRoomForUnlock(standing, unlocklabel) },
        revise: async (standing, proven, deviceId) => [...standing.unlocks, await sealFor(standing, newPassphrase, newStamp(standing, naming, deviceId), proven)],
      })
      return naming.unlock_id
    },

    addPasskey: async (givenProof, makePasskey, labelling) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      parsePasskeyMaker(makePasskey)
      const unlocklabel = parseUnlocklabel(rules, labelling, 'addPasskey')
      const naming = { unlock_id: randomId(), unlocklabel }
      const added = await reviseUnlocks(proof, undefined, {
        call:   'addPasskey',
        check:  (standing) => { ensureRoomForUnlock(standing, unlocklabel) },
        // The authenticator is asked only now, the proof proven: a refusal before leaves no passkey behind.
        revise: async (standing, proven, deviceId) => {
          const answered = await makePasskey()
          if (answered === null) { return null }
          const passkey = parseNewPasskey(answered)
          ensureNewCredential(standing, passkey)
          return [...standing.unlocks, await Envelope.sealPasskey(passkey, scope, standing, newStamp(standing, naming, deviceId), proven.transientKey)]
        },
      })
      return added ? naming.unlock_id : null
    },

    removeUnlock: async (givenProof, unlockId) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      const doomedId = parseUnlockId(unlockId)
      await reviseUnlocks(proof, undefined, {
        call:  'removeUnlock',
        check: (standing) => {
          const doomed = standing.unlocks.find((envelope) => envelope.unlock_id === doomedId)
          if (doomed === undefined) {
            throw Envelope.absentUnlock()
          }
          const remaining = standing.unlocks.filter((envelope) => envelope !== doomed)
          if (remaining.length === 0 || (doomed.method === 'passphrase' && remaining.every((envelope) => envelope.method !== 'passphrase'))) {
            throw new VaultError('last_unlock', "That is this vault's last passphrase, and a vault always keeps one: a passkey can be lost with its device, and every way in with it. Add another passphrase first, or destroy the vault if that is what's meant.")
          }
        },
        // Any way in still standing is proof enough, the one going included.
        revise: (standing) => standing.unlocks.filter((envelope) => envelope.unlock_id !== doomedId),
      })
    },

    store: async (boxlabel, whisper, storeOpts) => {
      ensureUnlocked()
      // A name the check refuses is never written anew, even where a lockbox stored under other
      // checks stands under it: reading and erasing reach that one.
      const label = Names.check(rules, 'boxlabel', boxlabel)
      const givenPublicJson = publicJsonOf(storeOpts)
      const checked = Whisper.safeParse(whisper)
      // The refusal never quotes its input: a whisper stays out of error messages.
      if (! checked.success) {
        throw new VaultError('bad_whisper', 'A whisper must be a JSON value: a string, number, boolean, array, or plain object. A bare null or undefined cannot be stored -- to empty a lockbox, erase it. (null inside an array or object is fine.)')
      }
      const whisperBytes = new TextEncoder().encode(stableJsonify(checked.data))
      ensureWhisperFits(whisperBytes, givenPublicJson ?? EmptyPublicJson)
      // Each attempt reads the box afresh and seals the whisper anew, under a lockboxKey and a
      // revision of its own; only the write that follows is ever repeated.
      let boxStood = false
      const outcome = await retryStale(isCaughtUpStale, async () => {
        // A refusal as stale has just caught this device up with storage, which may have relocked
        // it (a vault reborn, or its unlocks changed, elsewhere): then the retry ends here.
        keyInHand()
        const standing = await readBoxOrDamaged(label)
        // Erase wins: a box this store began over, and now finds gone, was erased elsewhere, and
        // a retry would silently undo that. The erase is already in the snapshot.
        if (standing === null && boxStood) { return 'erased' }
        // A damaged box is overwritten as a fresh store: nothing in it can be carried forward.
        const prev = standing === 'damaged' ? null : standing
        boxStood ||= prev !== null
        await ensureRoomFor(label, prev)
        // The key and the vault it belongs to, taken together after the last look at storage.
        const unlockedKey = keyInHand()
        const standingBundle = currentBundle()
        const { vault_id: vaultId, vault_key_epoch: vaultKeyEpoch } = standingBundle
        // Only a record that opens vouches for its public fields: one that will not, altered in
        // storage, is written over as a fresh lockbox is, keeping neither its bag nor its
        // registered_at, so a bag planted in storage is never sealed into a revision that reads clean.
        const vouched = prev !== null && await recordOpens(unlockedKey, standingBundle, prev) ? prev : null
        const publicJson = givenPublicJson ?? vouched?.public_json ?? EmptyPublicJson
        ensureWhisperFits(whisperBytes, publicJson)
        const revisionId = randomId()
        const lockboxKey = await makeLockboxKey()
        const now = clockNow()
        // Lands only in the vault this whisper is sealed for, under the vaultKey that seals it, over
        // the revision just read -- for a damaged box, the one the listing names -- : a vault reborn
        // elsewhere, a vaultKey replaced, or a box written meanwhile by another device, refuses it.
        const overRevision = standing === 'damaged' ? listedRevisionOf(label) : prev?.revision_id ?? null
        // Only a box the listing shows damaged and naming no revision is erased first: one the
        // listing does not show yet is written as over none, which storage refuses while it
        // stands, and the catch-up lists it with its revision for the retry.
        const clearsFirst = standing === 'damaged' && overRevision === null && isListedDamaged(label)
        const expected = { vault_id: vaultId, revision_id: overRevision, vault_key_epoch: vaultKeyEpoch }
        const header: LockboxHeader = {
          boxlabel:               label,
          revision_id:            revisionId,
          vault_key_epoch:        vaultKeyEpoch,
          whisper_codec:          'json_v1',
          whisper_schema_version: 1,
          public_json:            publicJson,
          registered_at:          vouched?.registered_at ?? now,
          written_at:             now,
        }
        const lockbox: Lockbox = {
          format:              LockboxFormat,
          ...header,
          lockbox_key_wrapped: await wrapKeyUnder(unlockedKey, lockboxKey, boxBinding(vaultId, header, 'lockbox_key_wrapped')),
          whisper_ciphered:    await cipherBytes(lockboxKey, whisperBytes, boxBinding(vaultId, header, 'whisper_ciphered')),
        }
        return await writeOver(lockbox, expected, clearsFirst, boxStood)
      })
      if (outcome === 'erased') {
        throw new VaultError('stale_write', 'That lockbox was erased on another device while this one was storing into it, so nothing was written: an erase wins. Store it again if it should exist after all.')
      }
      await refresh()
    },

    read: async (boxlabel) => await openBox(boxlabel),

    use: async (boxlabel, callback) => {
      if (typeof callback !== 'function') { throw new VaultError('bad_option', 'use needs a callback function to hand the whisper to.') }
      const whisper = await openBox(boxlabel)
      return await callback(whisper)
    },

    erase: async (boxlabel) => {
      ensureUnlocked()
      const label = await checkStandingBoxlabel(boxlabel)
      keyInHand()
      // Lands only in the vault this device holds keys for, whatever revision of the box stands:
      // a vault destroyed and made anew elsewhere refuses it. That is its only expectation, and
      // trying again could not change it: a stale erase is thrown at once, never retried.
      try {
        await refreshOnStale(vaultDB.eraseBox(scope, label, { vault_id: currentBundle().vault_id }), 'erase')
      } catch (err) {
        // Said as what happened to the box, once caught up; a catch-up that failed says so instead.
        if (! isCaughtUpStale(err)) { throw err }
        throw new VaultError('stale_write', "The contents of that lockbox could not be erased, because the vault it was in is gone: it was deleted, or deleted and made anew, on another device. Nothing was erased, and this device has caught up with storage. If the vault was made anew and the lockbox stands in it, unlock that vault and erase it there.", { cause: err })
      }
      await refresh()
    },

    destroy: async () => {
      ensureOpen()
      // A handle that has seen no vault looks first: "delete my vault" must not report success
      // over one standing. Otherwise only the vault this handle had read when called: one
      // destroyed and made anew since refuses, even if a background refresh brings it in while
      // this awaits.
      if (bundle === null) { await refresh() }
      const doomed = bundle
      await shut('destroy')
      if (doomed !== null && doomed !== UnreadBundle) {
        await refreshOnStale(vaultDB.eraseVault(scope, { vault_id: doomed.vault_id }), 'destroy')
      }
      // This device forgets the vault it had seen, too: one made later under this scope is
      // another. It keeps the scope's lock generation, which the shut has just raised: an unlock
      // under way in another tab must not find it back where it began.
      const kept = await keptMark('destroy')
      await deviceDB.writeMark(blankMark(kept?.lock_generation ?? 0))
      await refresh()
    },

    close: () => {
      // A second close does nothing: an adapter's unsubscribe may count down a watch it shares.
      if (closed) { return }
      closed = true
      // Not a lock of the vault: an unlock under way takes nothing up, but nothing this device
      // remembers is erased, nor its lock generation raised. A hard lock of this handle's key.
      hardLocksSoFar += 1
      dropKey()
      unsubscribeDB()
      listeners.clear()
    },
  }

  /**
   * `write`, with a refusal as stale catching this device up with storage before it is thrown --
   * once, before the kind is named: the snapshot then shows what beat the write, and a vault
   * reborn elsewhere, or its ways in changed, relocks this device. A catch-up that fails is
   * thrown as 'stale_write' too, its failure the cause, the snapshot saying `syncing: false` --
   * but for a catch-up refused as 'identity_revoked', 'rolled_back' or 'newer_format', which is
   * thrown as it came: each asks something else of the caller than a stale write does.
   */
  const refreshOnStale = async (write: Promise<void>, call: VaultCall): Promise<void> => {
    try {
      await write
    } catch (err) {
      if (! isVaultError(err, 'stale_write')) { throw err }
      await catchUp(err, call)
      throw err
    }
  }

  /**
   * True for a refusal as stale that the catch-up after it has caught up with: what `store()` tries
   * again. A retry made blind, after a catch-up that failed, would meet the same trouble.
   */
  const isCaughtUpStale = (err: unknown) => isVaultError(err, 'stale_write') && syncing

  /** One refresh after `refusal`, a write storage refused as stale; one that fails is said as {@link refreshOnStale} says. */
  const catchUp = async (refusal: VaultError, call: VaultCall) => {
    try {
      await refresh()
    } catch (err) {
      logger.warn('A catch-up with storage, after a write it refused as stale, failed: what the vault shows may lag behind storage (syncing: false) until a read succeeds.', { call }, asError(err))
      if (CatchUpPassesThrough.some((kind) => isVaultError(err, kind))) { throw err }
      throw new VaultError('stale_write', `${refusal.message} Catching up with storage afterwards failed too, so what the vault shows may be behind it: this error's cause says why.`, { cause: err })
    }
  }

  // Watch the backend so lockboxes written elsewhere (another tab, the inspector's reset button)
  // show up without a manual refresh. A failing background refresh has nobody to throw to, so it
  // leaves the snapshot standing, saying `syncing: false`, and warns once for a failing streak;
  // the next read that succeeds says so once.
  const watchRefresh = async () => {
    try {
      await refresh()
    } catch (err) {
      if (watchWarned) { return }
      watchWarned = true
      logger.warn('Storage rang with a change the vault could not read, so what it shows may lag behind storage (syncing: false). It says nothing more of this until a read succeeds; its next call meets the same trouble, and throws it.', { call: 'refresh' }, asError(err))
    }
  }
  const unsubscribeDB = vaultDB.subscribe(scope, () => { void watchRefresh() })

  try {
    await refresh()
    await rememberedUnlock()
  } catch (err) {
    // A failed open hands its caller no handle to close, so it closes itself: no storage watch
    // (with Convex, a live query) may outlive it. The caller gets the original error, even if
    // the adapter's unsubscribe throws too: what stopped the open is what the caller must act on.
    try {
      vault.close()
    } catch (closeErr) {
      // The open's own failure, rethrown below, is the one to report; this one is only logged.
      logger.error("The storage adapter's unsubscribe threw while a failed openVault was closing its storage watch. openVault rejects with the error that stopped the open; this one is the adapter's to mend.", { call: 'openVault' }, asError(closeErr))
    }
    throw err
  }
  bump()
  return vault
}

/** What {@link eraseDamagedVault} needs of openVault's options: which vault, and the two stores it lives in. */
export type EraseDamagedVaultOpts = Pick<OpenVaultOpts, 'applabel' | 'userId' | 'vaultlabel' | 'vaultDB' | 'deviceDB' | 'validators'>

/**
 * Erase a vault that `openVault` refuses as `damaged_bundle`, and only that: its stored bundle and
 * every lockbox, through the VaultDB, and the unlock this device remembered for it and its device
 * mark, through the DeviceDB -- what `destroy()` does for a vault that opens, and nothing else. A stored bundle that
 * fails its checks cannot be opened, so no handle exists to `destroy()`; this is the way to clear
 * it and start over. Whatever the vault held is gone for good, so ask the user first.
 *
 * It takes the options `openVault` took, and refuses a vault that is sound: kind 'bad_option' and
 * nothing erased, since a vault that opens is deleted with its handle's `destroy()`, which takes
 * the care of a handle that has seen the vault it deletes. With no vault stored it erases only the
 * device's remembered unlock and mark, so a call that was cut short can be made again. Kind 'damaged_bundle'
 * when the record is too damaged to say which vault it is, which only the backend's own tools can
 * clear; 'stale_write' when the vault was replaced elsewhere meanwhile. Other refusals are
 * storage's: 'storage_unavailable', 'identity_revoked', 'not_permitted'. The device store failing
 * after the vault is erased is 'storage_unavailable' too, saying what failed: call again to finish
 * clearing the device -- or 'storage_blocked', which calling again cannot mend until the
 * browser lets the device keep its storage. Misuse is refused before
 * storage is touched, as `openVault` does: 'bad_label' for a label that fails its check, and
 * 'bad_option' for an option missing.
 *
 * A record this version cannot read may be one a newer safebyok wrote and opens, so a `format`,
 * unlock method or number of unlocks it does not know is refused too, as 'newer_format', with
 * nothing erased and a message to update the app, as `openVault` refuses it: any change to what a stored record may hold --
 * a field, a shape, or a range a check accepts -- bumps `format`, so that newer can be told from
 * damaged. There is no handle to lock, so a storage refusal such as 'identity_revoked' is thrown
 * as it comes, with no lock to make.
 *
 * @example
 *   try { await openVault(opts) } catch (err) {
 *     if (isVaultError(err, 'damaged_bundle') && userConfirmedStartingOver()) { await eraseDamagedVault(opts) }
 *   }
 */
export const eraseDamagedVault = async (opts: EraseDamagedVaultOpts): Promise<void> => {
  if (! isBag(opts)) { throw new VaultError('bad_option', 'eraseDamagedVault takes one bag of options: applabel, userId, vaultlabel, vaultDB and deviceDB, as openVault did.') }
  const rules = Names.rulesOf(opts.validators)
  const scope = Names.checkScope(rules, { applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
  const vaultDB = parseVaultDB(opts.vaultDB)
  if (typeof vaultDB.eraseDamagedVault !== 'function') {
    throw new VaultError('bad_option', "vaultDB has no eraseDamagedVault: a storage adapter that hands each call on to another's must hand this one on too.")
  }
  const deviceDB = deviceTroubleAsConditions(parseDeviceDB(opts.deviceDB))
  // The vault first: a sound one refuses, and then the device keeps what it remembers of it. A
  // retry after a failure here finds the vault gone, and still clears the device.
  await vaultDB.eraseDamagedVault(scope)
  await deviceDB.eraseUnlock(scope)
  await deviceDB.eraseMark(scope)
}

/**
 * What `reading` resolves to, with storage's refusal of the record as corrupt said instead as
 * `damaged` says it: what a record failing its checks means for this vault. Storage's refusal is
 * its cause.
 */
const damagedAs = async <ResultT>(reading: Promise<ResultT>, damaged: (opts: ErrorOptions) => VaultError): Promise<ResultT> => {
  try {
    return await reading
  } catch (err) {
    if (! isVaultError(err, 'corrupt_record')) { throw err }
    throw damaged({ cause: err })
  }
}

/**
 * `deviceDB`'s verbs, each with a failure that is no VaultError -- an IndexedDB error, say, or a
 * throw before the promise -- said as a condition, with the device store's own error as its cause
 * and a message naming what failed: 'storage_blocked' for a refusal the browser gives for a reason
 * that holds until something outside the app changes ({@link isStorageBlocked}), which a host
 * shows without offering a retry, and 'storage_unavailable' for any other, which it shows in
 * place and offers to retry. A VaultError passes as it came. What `openVault` and
 * `eraseDamagedVault` call the device store through; not exported from the package.
 *
 * @param deviceDB - The device store a host handed in.
 * @returns The same verbs, each failure said as a condition.
 *
 * @example await deviceTroubleAsConditions(deviceDB).readMark(scope)  // a failing IndexedDB: 'storage_unavailable', "...failed reading its mark of this vault..."
 * @example await deviceTroubleAsConditions(deviceDB).readMark(scope)  // site data blocked (a SecurityError): 'storage_blocked', "...will not help until that changes..."
 */
export const deviceTroubleAsConditions = (deviceDB: DeviceDB): DeviceDB => ({
  readUnlock:  async (...args) => await asCondition('readUnlock', () => deviceDB.readUnlock(...args)),
  writeUnlock: async (...args) => { await asCondition('writeUnlock', () => deviceDB.writeUnlock(...args)) },
  eraseUnlock: async (...args) => { await asCondition('eraseUnlock', () => deviceDB.eraseUnlock(...args)) },
  readMark:    async (...args) => await asCondition('readMark', () => deviceDB.readMark(...args)),
  writeMark:   async (...args) => { await asCondition('writeMark', () => deviceDB.writeMark(...args)) },
  eraseMark:   async (...args) => { await asCondition('eraseMark', () => deviceDB.eraseMark(...args)) },
  eraseAll:    async (...args) => { await asCondition('eraseAll', () => deviceDB.eraseAll(...args)) },
})

/**
 * What failed, for each device-store verb, and what it leaves undone: the heart of the message a
 * failure of that verb is said with, and what a retry may do about it. None names a scope or
 * quotes a record.
 */
const DeviceTroubleSaid: Record<keyof DeviceDB, { failed: string, retry: string }> = {
  readUnlock:  { failed: "reading the unlock it remembers for this vault, so the vault could not pick it up", retry: "try again, or unlock with a passphrase or passkey" },
  writeUnlock: { failed: "writing the unlock it remembers for this vault, so this device may not remember it at the next open", retry: "try again" },
  eraseUnlock: { failed: "erasing the unlock it remembers for this vault, so the next open on this device may still pick it up", retry: "try again" },
  readMark:    { failed: "reading its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so the vault could not check storage against it", retry: "try again" },
  writeMark:   { failed: "writing its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so it may not be kept", retry: "try again" },
  eraseMark:   { failed: "erasing its mark of this vault, so it still holds the newest copy of the vault it had seen", retry: "try again" },
  eraseAll:    { failed: "erasing everything it keeps for safebyok, so some of it may remain", retry: "try again" },
}

/**
 * The names a browser gives a storage refusal whose reason holds until something outside the app
 * changes: storage withheld from the page (`SecurityError`: site data blocked, a sandboxed frame),
 * no room in it (`QuotaExceededError`: a quota of zero, a full disk), or no storage of the kind at
 * all (`NotSupportedError`). Every other name may pass.
 */
const BlockedStorageNames: ReadonlySet<string> = new Set(['SecurityError', 'QuotaExceededError', 'NotSupportedError'])

/** True for a device store's failure that a retry cannot mend until something outside the app changes: one named in {@link BlockedStorageNames}. */
const isStorageBlocked = (err: unknown): boolean => (
  // By name, not by class: a DOMException from another frame is no instance of this one's Error.
  typeof err === 'object' && err !== null && 'name' in err && typeof err.name === 'string' && BlockedStorageNames.has(err.name)
)

/** What `call` to the device store's `verb` resolves to, or its failure, as {@link deviceTroubleAsConditions} says it. */
const asCondition = async <ResultT>(verb: keyof DeviceDB, call: () => Promise<ResultT>): Promise<ResultT> => {
  try {
    return await call()
  } catch (err) {
    if (isVaultError(err)) { throw err }
    const { failed, retry } = DeviceTroubleSaid[verb]
    if (isStorageBlocked(err)) {
      throw new VaultError('storage_blocked', `This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so it failed ${failed}. Trying again will not help until that changes. The device store's error is this error's cause.`, { cause: err })
    }
    throw new VaultError('storage_unavailable', `This device's own storage failed ${failed}: ${retry}. If it fails every time, this device may not let the app keep anything: storage blocked or full, or a private window. The device store's error is this error's cause.`, { cause: err })
  }
}

const damagedBundle = (opts: ErrorOptions) => new VaultError('damaged_bundle', "This vault's stored record is damaged, so no passphrase or passkey can be tried against it, and it can't be opened. It was left as it is: the app's support may be able to restore it.", opts)

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
const damagedLockbox = (opts: ErrorOptions) => new VaultError('damaged_lockbox', "That lockbox is stored damaged, so it can't be read. It was left as it is; erase it, or store its whisper again over it.", opts)

const lockedError = () => new VaultError('vault_locked', 'The vault is locked: ask the user for their passphrase and call unlock().')

/**
 * A proof as a host hands one in, checked: a blank passphrase is refused at once, as it could open
 * nothing and trying would cost a derivation per way in; a passkey's answer of the wrong shape is
 * misuse.
 */
const parseProof = (candidate: UnlockProof): UnlockProof => {
  if (typeof candidate !== 'string') { return parsePasskey(candidate) }
  if (! candidate.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
  return candidate
}

/** How many bytes a passkey's PRF answers with: always 32, by the WebAuthn PRF extension. */
const PrfAnswerBytes = 32

/** What a passkey's answer must carry. The refusal never quotes it: its bytes are secret. */
const passkeyShape = Z.object({
  credentialId: Z.string().check(Z.minLength(1)),
  prfSaltB64:   Z.string().check(Z.minLength(1)),
  prfBytes:     Z.custom<Uint8Array>((candidate) => candidate instanceof Uint8Array && candidate.length === PrfAnswerBytes),
})

const parsePasskey = (candidate: PasskeyProof): PasskeyProof => {
  const checked = passkeyShape.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `A passkey's answer is { credentialId, prfSaltB64, prfBytes }: the credential's id and the salt it answered for, as base64url text, and its ${String(PrfAnswerBytes)}-byte PRF answer, as safebyok-react's askPasskey and createPasskey give them.`)
  }
  return checked.data
}

/** What `addPasskey` calls to make its passkey, checked to be something it can call. */
const parsePasskeyMaker = (candidate: unknown) => {
  if (typeof candidate !== 'function') {
    throw new VaultError('bad_option', "addPasskey takes a function that makes the passkey once the proof holds, () => createPasskey({ ... }), not a passkey's answer.")
  }
}

/** A new passkey's answer, checked: its salt must be a fresh one of {@link PasskeySaltBytes}, as its envelope will keep. */
const parseNewPasskey = (candidate: PasskeyProof): PasskeyProof => {
  const passkey = parsePasskey(candidate)
  if (Envelope.saltBytesOf(passkey.prfSaltB64)?.length !== PasskeySaltBytes) {
    throw new VaultError('bad_option', `A new passkey answers over a fresh salt of ${String(PasskeySaltBytes)} random bytes, as base64url text: safebyok-react's createPasskey mints one.`)
  }
  return passkey
}

/**
 * True when `box` lists as damaged already, or stands under a vaultKey `standing` holds: its own,
 * or the prior one. A lockbox under any other epoch opens under no key the vault holds.
 */
const isUnderHeldKey = (box: LockboxSummary | DamagedLockbox, standing: VaultBundle): boolean => (
  box.damaged || box.vault_key_epoch === standing.vault_key_epoch || box.vault_key_epoch === standing.prior_vault_key?.vault_key_epoch
)

/** `box`, a lockbox listed sound, as damaged: under its boxlabel and revision, nothing else of it trusted. */
const asDamaged = (box: LockboxSummary | DamagedLockbox): DamagedLockbox => ({ boxlabel: box.boxlabel, damaged: true, revision_id: box.revision_id })

/** What an unlock notes as it starts: this handle's shut count, and the device mark's lock generation. */
type UnlockStart = { shutsThen: number, lockGeneration: number }

/** A device mark that has seen a vault: what this handle holds beside the bundle in hand. */
type SeenMark = DeviceMark & { seen: SeenVault }

/** The device mark's format, as each mark carries it. */
const MarkFormat = 'safebyok-mark-v3'

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'openVault' | 'refresh' | 'expiry' | 'unlock' | 'lock' | 'lockSoon' | 'destroy' | 'untrustedStorage'
  | 'changePassphrase' | 'addPassphrase' | 'addPasskey' | 'removeUnlock' | 'store' | 'erase' | 'read'

/** The `unlocklabel` of the way in a vault is created with, by its first `unlock()`. */
const FirstUnlocklabel = 'passphrase'

/** The `vault_key_epoch` of a vault's first vaultKey, the one it is created with. */
const FirstVaultKeyEpoch = 1

/** The lockbox's format, as each record carries it and each of its bindings begins. */
const LockboxFormat = 'safebyok-lockbox-v4'

/**
 * The refusals a write's catch-up with storage throws as they came, never as 'stale_write': each
 * asks the caller for something a stale write does not -- the user to sign in again
 * ('identity_revoked'; the vault has locked), storage to be looked at ('rolled_back'; locked too),
 * or the app to be updated ('newer_format').
 */
const CatchUpPassesThrough = ['identity_revoked', 'rolled_back', 'newer_format'] as const satisfies readonly VaultErrorKind[]

/**
 * A lockbox's public header: every field of its record but its format, which leads each binding,
 * and the two encrypted ones. All of it is bound into both.
 */
type LockboxHeader = Omit<Lockbox, 'format' | 'lockbox_key_wrapped' | 'whisper_ciphered'>

/** The JSON of an empty public bag: what a lockbox given none holds. */
const EmptyPublicJson = '{}'

/**
 * The public bag a `store()` was handed, as the JSON a lockbox keeps, keys sorted; undefined when
 * it was handed none. Kind 'bad_option' for anything JSON cannot carry, quoting none of it.
 */
const publicJsonOf = (storeOpts: { public?: PublicBag | undefined } | undefined): string | undefined => {
  if (storeOpts?.public === undefined) { return undefined }
  const checked = PublicBag.safeParse(storeOpts.public)
  if (! checked.success) {
    throw new VaultError('bad_option', "A lockbox's public bag must be a JSON value: a string, number, boolean, null, array, or plain object, with nothing JSON cannot carry (undefined, a function, a Date) inside it.")
  }
  return stableJsonify(checked.data)
}

/** An unlock_id as a host hands one back: the id of one of the snapshot's `unlocks`. */
const unlockIdShape = Z.string().check(Z.minLength(1))
/** The options that aim an `unlock()` or `changePassphrase()` at one way in. */
const aimShape = Z.optional(Z.object({ unlockId: Z.optional(unlockIdShape) }))

const parseAim = (candidate: { unlockId?: string | undefined } | undefined): string | undefined => {
  const checked = aimShape.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', "unlockId is the unlock_id of one of the snapshot's unlocks, as text; leave it out to try every passphrase.")
  }
  return checked.data?.unlockId
}

/**
 * The passphrase envelope of `standing` that a change replaces: the one `unlockId` names, or --
 * given none, as when a passkey proves the change -- the vault's only passphrase.
 */
const passphraseToReplace = (standing: VaultBundle, unlockId: string | undefined): PassphraseEnvelope => {
  const passphrases = standing.unlocks.filter((envelope) => envelope.method === 'passphrase')
  if (unlockId !== undefined) {
    const named = passphrases.find((envelope) => envelope.unlock_id === unlockId)
    if (named !== undefined) { return named }
    throw new VaultError('absent_unlock', "None of this vault's passphrases has that unlock_id: it may have been removed on another device, or be a passkey's, which changePassphrase does not replace. Look again at the snapshot's unlocks.")
  }
  const [only, ...others] = passphrases
  if (only === undefined) {
    throw new VaultError('absent_unlock', 'This vault has no passphrase to replace: add one with addPassphrase.')
  }
  if (others.length > 0) {
    throw new VaultError('bad_option', "This vault has several passphrases, and a passkey does not say which to replace: pass the unlock_id of one of the snapshot's unlocks as opts.unlockId.")
  }
  return only
}

const parseUnlockId = (candidate: string): string => {
  const checked = unlockIdShape.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', "removeUnlock names the way in to remove by its unlock_id, from the snapshot's unlocks.")
  }
  return checked.data
}

/**
 * `opts.unlocklabel`, once it passes the vault's unlocklabel check: kind 'bad_label' otherwise.
 * Never empty, whatever the check admits, as a stored way in has a label.
 */
const parseUnlocklabel = (rules: Names.NameRules, candidate: { unlocklabel: string } | undefined, call: 'addPassphrase' | 'addPasskey'): string => {
  const unlocklabel: unknown = candidate?.unlocklabel
  if (typeof unlocklabel !== 'string' || unlocklabel === '') {
    throw new VaultError('bad_label', `${call} needs an unlocklabel, what the user calls this way in, as text that is not empty.`)
  }
  return Names.check(rules, 'unlocklabel', unlocklabel)
}

/**
 * How many times `store()` tries its versioned write before it lets a `stale_write` through: this
 * many attempts in all, the first one included, so three means one try and two retries. Small,
 * because a box that three reads in a row find changed again is being written in earnest by
 * someone else, and the caller should hear of it. Each retry waits first (see `WriteRetryBaseMillis`),
 * so the limit also bounds how long a losing store can take: about six seconds longer.
 */
const MaxWriteAttempts = 3

/**
 * The shortest wait before `store()`'s first retry, in milliseconds; the retry after that waits
 * twice as long. Two devices that collide on a box would otherwise both retry at once and collide
 * again in lockstep -- a thundering herd -- so each waits a random time in
 * `[WriteRetryBaseMillis * 2^(n-1), WriteRetryBaseMillis * 2^n)` before retry n: 1 to 2 seconds before the
 * first, 2 to 4 before the second. The windows double, so the longer a box stays contested, the
 * further apart the contenders spread. Not a public option, and there is no conflict handler: an
 * erase wins, the last writer wins, and a host that disagrees with an outcome calls `store()` or
 * `erase()` again.
 */
const WriteRetryBaseMillis = 1000

/**
 * A random wait before retry number `retryNumber` (1 for the first), uniform over
 * `[WriteRetryBaseMillis * 2^(n-1), WriteRetryBaseMillis * 2^n)` milliseconds, a whole number.
 *
 * The jitter guards no secret -- it only spreads devices out in time -- so it needs nothing
 * stronger than spreading. It is drawn from `crypto.getRandomValues` all the same, because the
 * linter keeps `Math.random` out of `src/`, and one source of randomness is easier to review.
 */
const retryDelayMillis = (retryNumber: number): number => {
  const windowMillis = WriteRetryBaseMillis * (2 ** (retryNumber - 1))
  const fraction = new DataView(randomBytes(4).buffer).getUint32(0) / (2 ** 32)
  return windowMillis + Math.floor(fraction * windowMillis)
}

/** Resolve after `delayMillis`. `setTimeout` runs everywhere the package does. */
const sleep = (delayMillis: number): Promise<void> => (
  new Promise((resolve) => { setTimeout(resolve, delayMillis) })
)

/**
 * Run `attempt`, and run it again when it refuses as `retriable` says it may be tried again -- a
 * refusal as stale, once caught up -- up to `attemptsLeft` attempts in all; any other refusal, and
 * the last one, is thrown as it came. Before each retry it
 * waits a random, doubling time (`retryDelayMillis`); there is no wait before the first attempt, and
 * none after the last refusal, which is thrown at once. The attempt must do its own reading, for
 * each try to be made from what storage holds now -- and from whether this device is still
 * unlocked, so that a lock during the wait ends the retry without a write.
 */
const retryStale = async <ResultT>(retriable: (err: unknown) => boolean, attempt: () => Promise<ResultT>, attemptsLeft = MaxWriteAttempts): Promise<ResultT> => {
  try {
    return await attempt()
  } catch (err) {
    if (attemptsLeft <= 1 || ! retriable(err)) { throw err }
    await sleep(retryDelayMillis(MaxWriteAttempts - attemptsLeft + 1))
    return await retryStale(retriable, attempt, attemptsLeft - 1)
  }
}

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
const absentBox = () => new VaultError('absent_box', 'No lockbox stands under that boxlabel in this vault: its snapshot lists the ones it holds.')

/**
 * Refuse, with kind 'insecure_context', a page the platform says is not a secure context: plain
 * http, anywhere but localhost, where a browser withholds WebCrypto and the vault would fail with
 * a TypeError and no kind. A runtime with no such notion (Node, Bun, React Native) passes.
 */
const ensureSecureContext = () => {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) {
    throw new VaultError('insecure_context', 'This page is not a secure context -- it was served over plain http -- so the browser withholds the cryptography the vault needs: serve the app over https (http://localhost counts as secure, for development).')
  }
}

// The refusal never quotes its input: a passphrase stays out of error messages.
const parsePassphrase = (candidate: string, said: 'changePassphrase' | 'addPassphrase') => {
  if (typeof candidate !== 'string') {
    throw new VaultError('bad_option', `${said} takes each passphrase as a string: the text the user typed.`)
  }
}

const isFunction = (candidate: unknown) => typeof candidate === 'function'
const isBag = (candidate: unknown) => typeof candidate === 'object' && candidate !== null

/**
 * What a VaultDB must carry: its public verbs, on an instance of the `VaultDB` base class, whose
 * verbs check every record and expectation an adapter's own code sees. Checked only: openVault
 * keeps the adapter.
 */
const vaultDBShape = Z.object({
  readBundle:   Z.custom(isFunction),
  createBundle: Z.custom(isFunction),
  updateBundle: Z.custom(isFunction),
  readBox:      Z.custom(isFunction),
  listBoxes:    Z.custom(isFunction),
  updateBox:    Z.custom(isFunction),
  eraseBox:     Z.custom(isFunction),
  eraseVault:   Z.custom(isFunction),
  subscribe:    Z.custom(isFunction),
})

const parseVaultDB = (candidate: VaultDB): VaultDB => {
  if (! (candidate instanceof VaultDB) || ! vaultDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "vaultDB is not a VaultDB: pass a storage adapter, such as localVaultDB({ store }), idbVaultDB() from 'safebyok-indexeddb', or your backend's own, which extends the VaultDB class.")
  }
  return candidate
}

/** What a DeviceDB must carry. Checked only: openVault keeps the device store it was handed. */
const deviceDBShape = Z.object({
  readUnlock:  Z.custom(isFunction),
  writeUnlock: Z.custom(isFunction),
  eraseUnlock: Z.custom(isFunction),
  readMark:    Z.custom(isFunction),
  writeMark:   Z.custom(isFunction),
  eraseMark:   Z.custom(isFunction),
  eraseAll:    Z.custom(isFunction),
})

const parseDeviceDB = (candidate: DeviceDB): DeviceDB => {
  if (! deviceDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "deviceDB is not a DeviceDB: in a browser, spread browserOpts() from 'safebyok/browser' into openVault's options; elsewhere, pass memoryDeviceDB().")
  }
  return candidate
}

/**
 * How many bytes of storage a vault reserves for each byte of whisper and public bag: two.
 * Stored, a whisper's ciphertext is base64, a third larger than the whisper, and a bag's JSON,
 * written as text inside its record, at most twice its own (each quote and backslash escaped);
 * the rest is room for each backend's own way of counting bytes. So one whisper and its bag may
 * claim at most half of an adapter's `maxRecordBytes`.
 */
export const StoredBytesPerWhisperByte = 2

/**
 * The room openVault plans for a lockbox's stored fields besides its whisper and public bag, in
 * bytes of their JSON, when it checks that `maxLockboxes` lockboxes fit the storage's
 * `maxVaultBytes`: its format, boxlabel, revision, codec, times, wrapped lockboxKey, the cipherIv
 * and tag of its whisperCiphered, and the scope a backend files it under. Under the default
 * validators, at their largest -- a forty-character boxlabel, applabel and vaultlabel and a
 * user_id of 100, each unit at three UTF-8 bytes -- they take under 1000. A host's validators may
 * admit longer names, so each store also weighs its lockbox as it is ({@link LockboxFixedBytes});
 * this is only the plan.
 */
export const LockboxFieldsBytes = 2048

/**
 * Room for the stored fields every lockbox has at the same size, in bytes of their JSON: its
 * format, revision, codec, times, wrapped lockboxKey, and the cipherIv and tag of its
 * whisperCiphered, with every field's name. A store weighs a lockbox as this, its whisper and
 * bag's room, and its scope and boxlabel as measured.
 */
export const LockboxFixedBytes = 512

const maxWhisperBytes = Z._default(Z.int().check(Z.positive()), MaxWhisperBytes)
const maxLockboxes = Z.optional(Z.int().check(Z.positive()))
/**
 * The largest limit in bytes the vault keeps. An adapter's `Infinity`, its way of saying it sets
 * no limit, becomes this as openVault reads it: past that read, no limit is infinite.
 */
const UnlimitedBytes = Number.MAX_SAFE_INTEGER

/** A limit as an adapter declares one, some bytes or `Infinity` for none, to the finite form the vault keeps. */
const someBytes = Z.union([Z.number().check(Z.positive()), Z.literal(Infinity)])
const bytesKept = Z.transform((bytes: number) => Math.min(bytes, UnlimitedBytes))
const byteLimit = Z.number().check(Z.positive(), Z.lte(UnlimitedBytes))
const declaredBytes = Z.pipe(Z.pipe(someBytes, bytesKept), byteLimit)

/**
 * The most lockboxes the vault keeps as a limit. An adapter's `Infinity`, its way of saying it
 * counts none, becomes this as openVault reads it: past that read, no limit is infinite.
 */
const UnlimitedLockboxes = Number.MAX_SAFE_INTEGER

/** A count of lockboxes as an adapter declares one, a whole number or `Infinity` for none, to the finite form the vault keeps. */
const someLockboxes = Z.union([Z.int().check(Z.positive()), Z.literal(Infinity)])
const declaredLockboxes = Z.pipe(someLockboxes, Z.transform((count: number) => Math.min(count, UnlimitedLockboxes)))

/** How openVault reads each limit an adapter declares. */
const DeclaredLimitFor = {
  maxRecordBytes: declaredBytes,
  maxVaultBytes:  declaredBytes,
  maxLockboxes:   declaredLockboxes,
} as const

const HourMillis = 60 * MinuteMillis

/**
 * How long past `askPassphraseAt` the vaultKey stays for work already in hand, as a `lockSoon()`
 * grace does: from the deadline no new work starts, and a minute later the key is dropped.
 */
const ExpiryGraceMillis = MinuteMillis

/**
 * True for an instant within a minute of {@link FarFuture}: a deadline that never comes. Never
 * compared for equality, so a reading rounded or nudged on its way still counts.
 */
const isFarFuture = (at: number): boolean => at >= FarFuture - MinuteMillis

/**
 * `setTimeout(callback, delayMillis)`, a delay below zero as none, that lets a Node or Bun process
 * exit while it is pending: a vault left open must not keep a server or a script alive for days.
 * A browser's timer has no `unref`, and needs none.
 */
const unrefTimeout = (callback: () => void, delayMillis: number): ReturnType<typeof setTimeout> => {
  const timer = setTimeout(callback, Math.max(0, delayMillis))
  const handle = timer as unknown as { unref?: () => unknown }
  if (typeof handle.unref === 'function') { handle.unref() }
  return timer
}

/** How long `lockSoon()` lets work in hand finish, unless told otherwise, in seconds. */
const LockSoonGraceSeconds = 5
/** The longest grace `lockSoon()` gives, in seconds: the vaultKey outlives a lock by at most this. */
const MaxLockSoonGraceSeconds = 60

/** A grace in seconds, as the host thinks of it, to whole milliseconds. Zod's number refuses NaN and Infinity. */
const graceSecondsGiven = Z._default(Z.number().check(Z.gte(0), Z.lte(MaxLockSoonGraceSeconds)), LockSoonGraceSeconds)
const secondsToMillis = Z.transform((seconds: number) => Math.round(seconds * 1000))
const graceSeconds = Z.pipe(graceSecondsGiven, secondsToMillis)

const parseGraceSeconds = (candidate: number | undefined): number => {
  const checked = graceSeconds.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `lockSoon's graceSeconds is a number of seconds from 0 to ${String(MaxLockSoonGraceSeconds)}; fractions are fine. Leave it out for ${String(LockSoonGraceSeconds)}.`)
  }
  return checked.data
}

/**
 * Hours, as the host thinks of them, to whole milliseconds, as every time inside is kept: a window
 * one timer can reach ({@link MaxReentryHours} at most), or `Infinity`, which becomes
 * {@link ForeverMillis}.
 */
const someHours = Z.union([Z.number().check(Z.positive(), Z.lte(MaxReentryHours)), Z.literal(Infinity)])
const reentryHours = Z._default(someHours, ForcePassphraseReentryHours)
const hoursToMillis = Z.transform((hours: number) => (hours === Infinity ? ForeverMillis : Math.round(hours * HourMillis)))
const reentryWindowMillis = Z.number().check(Z.gte(1))
const forcePassphraseReentryHours = Z.pipe(Z.pipe(reentryHours, hoursToMillis), reentryWindowMillis)

/** The deadline for a passphrase entered at `nowMillis`: `reentryMillis` later, in whole ms, but never past {@link FarFuture}. */
const deadlineAfter = (nowMillis: number, reentryMillis: number): number => Math.min(Math.floor(nowMillis + reentryMillis), FarFuture)

const parseForcePassphraseReentryHours = (candidate: number | undefined): number => {
  const checked = forcePassphraseReentryHours.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `forcePassphraseReentryHours is a number of hours greater than zero and at most ${String(MaxReentryHours)} (24.5 days), fractions too (0.25 is fifteen minutes), or Infinity for never: until lock(). A longer finite window is refused, as no timer reaches past it.`)
  }
  return checked.data
}

/** What a Clock must carry. Checked only: openVault keeps the clock it was handed, and checks each reading. */
const clockShape = Z.object({
  now: Z.custom<Clock['now']>((candidate) => typeof candidate === 'function'),
})

const parseClock = (candidate: Clock | undefined): Clock => {
  if (candidate === undefined) { return wallClock }
  if (! clockShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'clock is not a Clock: it needs a now() function returning epoch milliseconds, as Date.now() does.')
  }
  return candidate
}

/**
 * A clock reading the package accepts: epoch milliseconds from {@link FarPast} to {@link FarFuture},
 * a fraction allowed, as a clock may return one. Floored as it is read, so every time kept is a
 * whole-millisecond {@link EpochMillis}.
 */
const clockReading = Z.number().check(Z.gte(FarPast), Z.lte(FarFuture))

/** A reading of the host's clock, checked and rounded down to whole milliseconds. */
const readClock = (clock: Clock): number => {
  let reading: unknown
  try {
    reading = clock.now()
  } catch (err) {
    // The host's own error rides along as the cause, unquoted.
    throw new VaultError('bad_option', "The clock passed to openVault threw when read: its now() must return epoch milliseconds, as Date.now() does. The clock's own error is this error's cause.", { cause: err })
  }
  const checked = clockReading.safeParse(reading)
  if (! checked.success) {
    throw new VaultError('bad_option', "The clock passed to openVault read a time outside 1981 to 2255: its now() must return epoch milliseconds, as Date.now() does, not seconds or microseconds.")
  }
  return Math.floor(checked.data)
}

const parseMaxWhisperBytes = (candidate: number | undefined): number => {
  const checked = maxWhisperBytes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxWhisperBytes is a whole number of bytes, greater than zero.')
  }
  return checked.data
}

/**
 * The vault's `maxLockboxes`: as given, or by default the smaller of {@link MaxLockboxes} and
 * `storeLockboxes`, the most the vaultDB holds in one vault -- which a given one may not exceed.
 */
const parseMaxLockboxes = (candidate: number | undefined, storeLockboxes: number): number => {
  const checked = maxLockboxes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxLockboxes is a whole number of lockboxes, greater than zero.')
  }
  if (checked.data === undefined) { return Math.min(MaxLockboxes, storeLockboxes) }
  if (checked.data > storeLockboxes) {
    throw new VaultError('bad_option', `maxLockboxes is over the ${String(storeLockboxes)} lockboxes this storage adapter holds in one vault (its own maxLockboxes): pass ${String(storeLockboxes)} or fewer.`)
  }
  return checked.data
}

/** What a KeyDeriver must carry. Checked only: openVault keeps the deriver it was handed, prototype and all. */
const keyDeriverShape = Z.object({
  algorithm:         Z.optional(Z.string()),
  key_deriver_label: Z.string().check(Z.minLength(1)),
  salt_bytes:        Z.int().check(Z.gte(1), Z.lte(MaxSaltBytes)),
  deriveKeyBytes:    Z.custom<KeyDeriver['deriveKeyBytes']>((candidate) => typeof candidate === 'function'),
})

/**
 * `candidate` as the KeyDeriver a vault keeps, once it passes: the shape of a deriver, a label
 * that is not safebyok's to reserve, and -- for one declaring `algorithm: 'argon2id'` -- a whole
 * spec Argon2id can run. Warns through `logger`, and goes on, for the label of a test deriver.
 */
const parseKeyDeriver = (candidate: KeyDeriver | undefined, logger: VaultLogger): KeyDeriver => {
  if (candidate === undefined) {
    throw new VaultError('bad_option', "openVault needs a keyDeriver: in a browser, spread browserOpts() from 'safebyok/browser' into its options.")
  }
  if (! keyDeriverShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'keyDeriver is not a KeyDeriver: it needs a key_deriver_label, a salt_bytes from 1 to 65536 and a deriveKeyBytes function.')
  }
  // A deriver declaring Argon2id must be one Argon2id can run: its refusal here, with a kind, is
  // the one it would otherwise make at the first unlock, as a plain Error from the library.
  if (candidate.algorithm === 'argon2id') { parseKeyDeriverSpec(candidate as KeyDeriverSpec) }
  ensureSuppliedSpecKept(candidate)
  if (candidate.key_deriver_label.startsWith(TestLabelPrefix)) {
    logger.warn(TestDeriverNotice, { call: 'openVault' })
  }
  return candidate
}

/**
 * One of the adapter's declared limits, in the finite form the vault keeps: `Infinity` becomes
 * {@link UnlimitedBytes} or {@link UnlimitedLockboxes}.
 */
const parseDeclared = (vaultDB: VaultDB, limitname: keyof typeof DeclaredLimitFor): number => {
  const checked = DeclaredLimitFor[limitname].safeParse(vaultDB[limitname])
  // An adapter that declares no limit, or one written before a limit existed, is refused: never guessed.
  if (! checked.success) {
    throw new VaultError('bad_option', `This storage adapter does not declare ${limitname}, a limit every adapter states: update the adapter, or ask its author to.`)
  }
  return checked.data
}

/**
 * Refuse limits the storage adapter might not honour: a whisper too large for one of its records,
 * or a vault too large for it to hold, list and erase whole.
 *
 * @returns The most the adapter holds of one vault, in the finite form the vault keeps.
 */
const ensureLimitsFit = (vaultDB: VaultDB, whisperByteLimit: number, lockboxLimit: number): number => {
  const recordBytes = parseDeclared(vaultDB, 'maxRecordBytes')
  if (whisperByteLimit * StoredBytesPerWhisperByte > recordBytes) {
    throw new VaultError('bad_option', `maxWhisperBytes is over half of the ${String(recordBytes)} bytes this storage adapter holds in one record, so a whisper that large might not store: pass a smaller maxWhisperBytes.`)
  }
  const vaultBytes = parseDeclared(vaultDB, 'maxVaultBytes')
  const lockboxBytes = (whisperByteLimit * StoredBytesPerWhisperByte) + LockboxFieldsBytes
  if (lockboxLimit * lockboxBytes <= vaultBytes) { return vaultBytes }
  const fitting = Math.floor(vaultBytes / lockboxBytes)
  const outcome = fitting === 0
    ? 'At that maxWhisperBytes, not even one lockbox fits: pass a smaller maxWhisperBytes.'
    : `At that maxWhisperBytes, at most ${String(fitting)} lockboxes fit: pass a smaller maxLockboxes or maxWhisperBytes.`
  throw new VaultError('bad_option', `${String(lockboxLimit)} lockboxes (maxLockboxes) of up to ${String(whisperByteLimit)} bytes of whisper each (maxWhisperBytes) might not fit in the ${String(vaultBytes)} bytes this storage adapter holds of one vault (its maxVaultBytes), with room for each lockbox's other fields. ${outcome}`)
}

/** JSON text parsed, or null on text that is not JSON -- which Whisper's validator then refuses. */
const parseJsonOrNull = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
