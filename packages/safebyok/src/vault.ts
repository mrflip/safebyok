import * as Z from 'zod/mini'
import { DeviceMark, Lease, LockboxSummary, Sidecar, type SeenVault, type DamagedLockbox, LeaseHours, FarFuture, FarPast, ForeverMillis, MaxLockboxes, MaxLeaseHours, MaxUnlocks, MaxWhisperBytes, MinuteMillis, PasskeySaltBytes, VaultProps, type VaultScope, Whisper, wallClock, type Clock, type PasskeyProof, type PassphraseWayin, type WayinSummary } from './types'
import type { Lockbox } from './lockbox'
import * as Names from './names'
import { isStorageBlocked } from './refusals'
import { optionsCheck } from './options'
import type { VaultValidators } from './validators'
import { VaultError, isVaultError, type VaultErrorKind } from './errors'
import type { KeyDeriver } from './key-deriver'
import { MaxSaltBytes, TestDeriverNotice, TestLabelPrefix, ensureSuppliedSpecKept, parseKeyDeriverSpec, type KeyDeriverSpec } from './key-deriver-spec'
import {
  cipherCtx, cipherBytes, decipherBytes,
  makeLeaseKey, makeLockboxKey, makeVaultKey, randomId, wrapKeyUnder, unwrapKeyUnder,
} from './crypto'
import * as Wayin from './wayin'
import type { WayinStamp, Proof, VaultKeyPair } from './wayin'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import type { DeviceDB } from './device-db'
import { VaultDB, jsonBytes, type LockboxExpectation } from './vault-db'
import { asError, parseLogger, type VaultLogger } from './logger'
import * as RefusalPolicy from './refusal-policy'
import { checkStrengthTest, ensureStrongEnough, type PassphraseStrengthTest } from './passphrase-strength'

/**
 * Where the vault stands, as the UI branches on it:
 *  * `opening`  -- still reading the vault props and device cache; show nothing yet
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
   * -- which `retireBox()` removes and `storeBox()` overwrites. The listing reads each record's shape and
   * never opens its ciphertext: ciphertext altered in storage shows only when it is read.
   */
  boxes:     readonly (LockboxSummary | DamagedLockbox)[]
  /**
   * Epoch ms from which the vault asks for the passphrase again, while unlocked; null otherwise.
   * `leaseHours` after a proof last unlocked the vault, by passphrase or passkey, or a passphrase
   * last proved a change to its ways in (see `Vault.unlock`); never later than {@link FarFuture}
   * (in 2255): with `Infinity` hours, a vault that asks again only after `lock()` reads as that
   * instant. Compare with `>= FarFuture - MinuteMillis`, never for equality.
   */
  askPassphraseAt: number | null
  /**
   * The vault's ways in, public face only, in the order the vault tries them: one
   * {@link WayinSummary} per passphrase or passkey, readable while locked, so a host can list
   * them, ask which one the user means, name one to `unlock()`, `changePassphrase()` or
   * `retireWayin()`, and ask a passkey's authenticator for its answer. Empty until the vault exists.
   */
  wayins:    readonly WayinSummary[]
  /**
   * False when the vault's last read of storage failed -- a change pushed from storage it could
   * not read, or a catch-up after a write storage refused -- so what it shows may be behind
   * storage until a read succeeds; true otherwise. A UI may say "not syncing" while it is false.
   * The vault keeps working either way: every write still lands only where storage stands as
   * this device last read it.
   */
  syncing:   boolean
  /**
   * The refusal the vault's last read met, while nothing has read since: what `hello()` was
   * refused with -- storage unreachable, a user storage does not serve yet, vault props damaged --
   * or what a later read of storage failed with, a change pushed from storage or a catch-up after a
   * write it refused. Null before any read has failed, and again once a read succeeds.
   *
   * A first `hello()` that fails before the vault props are read -- storage unreachable, a user
   * not yet signed in, vault props damaged -- leaves the vault `opening`, saying why here: show the
   * refusal in place, and offer a retry that calls `hello()` again where one may mend it
   * (`isVaultCondition`, and not `storage_blocked`). Any other call tries again first, as it waits
   * for `hello()`. One that fails after them, as this device's store refuses its lease, settles
   * `locked` with `trouble` beside it. Once the vault has settled, a failure never takes it back to
   * `opening`: `state` says what it last read, and `trouble` beside it why that may be behind
   * storage now.
   *
   * @example
   *   const { state, trouble } = vault.getSnapshot()
   *   if (state === 'opening' && trouble !== null) { showRetry(trouble.message, () => { void vault.hello() }) }
   */
  trouble:   VaultError | null
}

export type MakeVaultOpts = {
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
   * How many hours a lease lasts on this device, across reloads, after a proof unlocks the vault,
   * before the vault asks for a proof again. Default: {@link LeaseHours}, 168 (seven days).
   * Any number above zero up to {@link MaxLeaseHours}, 588 (24.5 days), fractions too: 0.25 is
   * fifteen minutes. `Infinity` means never on this device: the vault stays unlocked until
   * `lock()` (or the vault changes under it), and `askPassphraseAt` reads as {@link FarFuture}.
   * A finite number past 588 is refused with kind 'bad_option': the vault drops its key with a
   * timer a minute after the lease ends, and no timer reaches further.
   *
   * Lowering it takes hold on each device at its next hello: a lease granted under the longer
   * setting, whose deadline lies past this many hours from then, is forgotten, and the vault
   * opens locked. Raising it lengthens no lease already granted. A device keeps one lease per
   * vault, so two tabs opening a vault with different settings are one device with two settings,
   * which is not supported (`notes/wontfix.md`): the lower one wins.
   */
  leaseHours?: number | undefined
  /**
   * Time source for expiry and for the times stored with each record; tests inject one. Default:
   * the wall clock. Its `now()` returns epoch milliseconds, as `Date.now()` does, from 1981 to 2255
   * ({@link FarPast} to {@link FarFuture}), fractions allowed (each reading is rounded down to
   * whole milliseconds). Vault.make reads it once and refuses a clock outside those bounds, or one
   * that throws, with kind 'bad_option'; so does any later call that reads it so, dropping the
   * vaultKey first, so the vault is locked.
   */
  clock?: Clock | undefined
  /**
   * The largest whisper `storeBox()` accepts, in bytes of its JSON and its lockbox's sidecar's
   * together. Default: {@link MaxWhisperBytes}, 40444. Checked on write only, so lowering it never
   * strands a whisper already stored. At most half the vaultDB's `maxRecordBytes`: Vault.make
   * refuses more with kind 'bad_option'.
   */
  maxWhisperBytes?: number | undefined
  /**
   * The most lockboxes the vault holds. Default: {@link MaxLockboxes}, 100, or the vaultDB's own
   * `maxLockboxes` when that is smaller. `storeBox()` refuses a new lockbox past it with kind
   * 'vault_full'; replacing one already there is always allowed, and lowering it strands nothing
   * already stored. Raise this or `maxWhisperBytes` freely while this stays within the vaultDB's
   * `maxLockboxes` and the two fit its `maxVaultBytes`: Vault.make refuses otherwise, with kind
   * 'bad_option'.
   */
  maxLockboxes?: number | undefined
  /**
   * Where the vault says what it has nobody to throw to -- a lock that skipped its grace, a
   * background refresh that failed, a lease it could not read -- as a
   * {@link VaultLogger}: `log`, `warn` and `error` functions. The vault hands
   * it no secret material or option's value (a host's own error goes as the host made it); whatever
   * it throws is ignored. Pass functions that do nothing for quiet. Default (none, or null): the
   * logger the `vaultDB` was made with, which is the default logger when it was given none. It does
   * not go the other way: a storage adapter keeps the logger it was made with, so to have one logger
   * hear both, give it to the adapter's factory and leave this out; to have the vault use the
   * default whatever the adapter was given, pass `DefaultLogger`. Kind 'bad_option' for anything else.
   */
  logger?: VaultLogger | null | undefined
  /**
   * The checks for the vault's names where they enter it, as a {@link VaultValidators} bag: each
   * field given replaces ours (`Label` for each label, a wayin's `wayinlabel` among them,
   * `UserId` for the user, from `safebyok/validators`), and each left out keeps ours. Each is a Zod
   * schema that checks synchronously, and only checks: what passes is kept exactly as given.
   * Beneath every one, the floor (`NameFloor`) holds whatever the bag says. Kind 'bad_option' for
   * a bag holding anything else, or a field it does not know (a `note` among them: a lockbox's
   * sidecar is the host's to check).
   */
  validators?: VaultValidators | undefined
  /**
   * The check every new passphrase must pass, as a {@link PassphraseStrengthTest}: the one the
   * first `unlock()` creates the vault with, and each `addPassphrase()` or `changePassphrase()`
   * sets, before any key derivation. It is handed the passphrase and the vault's scope, and a
   * passphrase it finds weak is refused with kind 'weak_passphrase', the test's reason the
   * message. It never runs on `unlock()` of a vault that stands. Required, as the vault has no
   * test of its own: in a browser, `browserOpts()` from `safebyok/browser` supplies
   * `zxcvbnPassphraseTest`, which turns away short passphrases, common passwords and patterns.
   * The vault keeps the test it was opened with for its life. Kind 'bad_option' for anything but a
   * function, and for a test that answers anything but a verdict; whatever it throws, the call
   * throws.
   */
  passphraseStrengthTest: PassphraseStrengthTest
}

/**
 * A user's vault of lockboxes. All reading and writing of whispers goes through here; the UI
 * renders from `getSnapshot()` and re-renders on `subscribe()`.
 *
 * Operations that touch a whisper -- `storeBox`, `readBox`, `useBox`, `retireBox` -- require the
 * vault unlocked, and throw a VaultError of kind 'vault_locked' otherwise: the host catches that,
 * asks the user for their passphrase, calls unlock(), and retries. Nothing prompts on open.
 *
 * This device keeps a mark of the newest copy of the vault props it has seen (a device mark, in
 * the deviceDB, which `lock()` leaves and `retire()` empties). A call that reads the vault props
 * afresh -- `hello()`, `unlock()`, a change to the ways in, a store that catches up with storage, a
 * background refresh -- refuses an older copy of that same vault, one at a lower unlock epoch or
 * vaultKey epoch than this device has seen, with kind 'rolled_back', taking nothing from it and
 * writing nothing: storage handing back older vault props could otherwise bring back a way in
 * that was removed. Storage so little to be trusted locks the vault, as `lock()` does, as a storage
 * refusal of kind 'identity_revoked' does. A host that knows its storage was restored from an
 * older copy on purpose accepts it on this device by erasing the device's mark of the vault
 * (`deviceDB.eraseMark(scope)`) and calling `hello()` again.
 *
 * Storage alone settles a race. When it refuses a write as stale, or a lockbox will not open, the
 * vault catches up with storage once before it names the refusal: a vault retired and made
 * anew, or its ways in changed, elsewhere relocks this device. A catch-up that fails leaves the
 * snapshot saying `syncing: false` until a read succeeds; a write whose catch-up fails throws
 * 'stale_write', the catch-up's failure its cause -- unless that failure is 'identity_revoked',
 * 'rolled_back' or 'newer_format', which the write throws as it came.
 */
export type Vault = {
  /**
   * How long a lease lasts on this device, in whole milliseconds: the `leaseHours` the vault was
   * opened with, its default (168 hours) when none was given. A vault that stays unlocked until
   * `lock()` (`Infinity` hours) reads {@link ForeverMillis}. Fixed for the handle's life, so a UI
   * can say how long an unlock lasts without being told the option again.
   *
   * @example vault.leaseMillis >= ForeverMillis - MinuteMillis ? 'until you lock it' : `for ${String(Math.round(vault.leaseMillis / MinuteMillis))} minutes`
   */
  readonly leaseMillis: number
  /** Current snapshot; same object until something changes (useSyncExternalStore-ready). */
  getSnapshot: () => VaultSnapshot
  /**
   * Calls `listener` after every snapshot change; returns the unsubscribe. Kind 'bad_option' for
   * a listener that is not a function.
   */
  subscribe: (listener: () => void) => () => void

  /**
   * Read the vault props from storage and this device's lease, and settle the snapshot from
   * `opening` into `absent`, `locked`, or (when the lease still fits) `unlocked` -- never
   * prompting: asking for a passphrase is the host's job, and only when a whisper is actually
   * wanted. `Vault.make` starts it, and every other call but `lock()`, `lockSoon()` and `close()`
   * waits for it first, so a host need not call it at all: await it to know the vault has settled,
   * or to hear why it could not.
   *
   * Once is enough. Every call while a hello is under way shares its promise, and once one has
   * succeeded each later call resolves at once -- until what it read may no longer stand: a read
   * of storage that fails (saying so in the snapshot's `trouble`), storage the vault cannot trust
   * (`identity_revoked`, `rolled_back`, `newer_format`), or the vault retired. The next hello then
   * reads afresh, and clears `trouble` once it succeeds. A hello that fails may be called again at
   * once. A lock leaves it standing; after `close()` it refuses with kind 'vault_closed'.
   *
   * It refuses with storage's own error -- storage refusing a user not yet signed in, say -- and
   * the snapshot says the same as its `trouble`, its `state` the last it settled into: `opening`
   * while the vault props were never read, and `locked` for a first hello that fails after them,
   * as this device's store refusing its lease. Stored vault props that fail their checks are kind 'damaged_vault',
   * which no retry mends (`retireDamagedVault` clears them); those a newer safebyok may have
   * written, kind 'newer_format': update the app; those older than this device has already seen
   * the vault at, kind 'rolled_back', which also forgets this device's lease (see the `Vault`'s
   * own doc).
   *
   * @example await vault.hello()   // vault.getSnapshot().state: 'absent' | 'locked' | 'unlocked'
   * @example
   *   try { await vault.hello() } catch (err) {
   *     if (isVaultError(err, 'damaged_vault') && userConfirmedStartingOver()) { await retireDamagedVault(opts) }
   *   }
   */
  hello(): Promise<void>

  /**
   * Open the vault with its passphrase, granting this device a lease for `leaseHours`. On an
   * `absent` vault this first unlock creates it, with this passphrase as its one way in, labelled
   * `passphrase` -- once the vault's `passphraseStrengthTest` passes it: kind 'weak_passphrase'
   * otherwise, the test's reason its message, and nothing is created. A vault that stands is never
   * refused its passphrase for weakness. A wrong passphrase throws kind 'wrong_passphrase' and
   * changes nothing -- learned from the vaultKey wayin refusing to decrypt, never from a
   * comparison. A passphrase that is not text is misuse: kind 'bad_option'.
   *
   * A vault with several passphrases tries this one against each in turn, one key derivation
   * apiece (with the browser's deriver, about half a second each), so a wrong passphrase takes
   * longest. `opts.wayinId`, from the snapshot's `wayins`, aims it at that passphrase alone:
   * one derivation, and kind 'absent_wayin' when the vault has no such passphrase. An aimed
   * unlock never creates the vault: on an `absent` one, it too refuses as 'absent_wayin'.
   *
   * A way in stored in a form this package never writes is damaged, and passed over: the others
   * are tried as ever. Kind 'damaged_wayin' when the unlock is aimed at a damaged one, or every
   * passphrase is. A passphrase wayin altered in storage refuses its passphrase just as a typo
   * does, so 'wrong_passphrase' is all the vault can say of it; its message names both.
   *
   * The first unlock of an `absent` vault can lose a race: another device creates the vault
   * between this one's look at storage and its write. Storage then hands back that device's vault,
   * and the passphrase given must open it like any other. If it does, the unlock goes ahead. If it
   * does not, the refusal is kind 'created_elsewhere', not 'wrong_passphrase': nothing was
   * created here, the vault now shows `locked` as the other device made it, and the user is to
   * enter the passphrase chosen there.
   *
   * The lease lasts until `askPassphraseAt`, `leaseHours` from now: from then
   * no new work starts, work in hand has a minute more to finish, and then the vaultKey is
   * dropped, by a timer and at the next look alike. Every later call in which the user types a
   * passphrase and it proves -- `changePassphrase()`, or a way in added or removed with a
   * passphrase as proof -- starts the lease again from then; nothing else moves it.
   *
   * A `lock()` or `retire()` called while the unlock is still under way wins, in this tab or in
   * another on this device: the vault stays locked, this device is granted no lease, and the call
   * throws kind 'vault_locked'. A `lockSoon()` does not: it lets work in hand finish, this unlock
   * among it. A vault the unlock was creating stays created,
   * locked, under this passphrase. So does a vault retired, made anew, or with its wayins
   * changed on another device meanwhile: the passphrase was proven against a vault that no longer
   * stands as it was. A wrong passphrase is still told as 'wrong_passphrase', lock or no lock.
   * The lease running out while the unlock is under way is no lock: the unlock stands, with a
   * lease of its own.
   *
   * `proof` may instead be a passkey's answer, a {@link PasskeyProof} (`safebyok-react`'s
   * `askPasskey` gets one): it opens the passkey wayin of the credential that answered, with
   * no key derivation to wait for, and grants this device a lease for `leaseHours` as a
   * passphrase does. It refuses with kind 'absent_wayin' when no
   * way in is that passkey's, 'wrong_passkey' when its answer does not open the vault (its
   * message saying that the way in may be damaged), 'damaged_wayin' when its wayin is stored
   * damaged, and 'absent_vault' on an `absent` vault: a vault is created with a passphrase.
   *
   * @example await vault.unlock(passphrase)
   * @example await vault.unlock(passphrase, { wayinId: chosen.wayin_id })    // chosen from getSnapshot().wayins
   * @example await vault.unlock(passkey)  // from askPasskey(vault.getSnapshot().wayins)
   * @example
   *   try { await vault.unlock(passphrase) } catch (err) {
   *     if (isVaultError(err, 'created_elsewhere')) { showAdvice(err.message) }  // the vault now shows `locked`: ask again
   *   }
   */
  unlock(proof: string | PasskeyProof, opts?: { wayinId?: string | undefined }): Promise<void>
  /**
   * Forget the unlock, in memory and on this device: back to `locked`, at once -- the hard lock.
   * Wins over an `unlock()` or `changePassphrase()` still under way, which then leaves the vault
   * locked -- in this tab, or in another on this device, whose unlock is then granted no lease
   * either -- and over a `readBox()` or `useBox()` under way, which refuses with kind 'vault_locked',
   * handing back nothing. A write already sent to storage lands. Kind 'storage_unavailable' when
   * this device's store fails to forget its record ('storage_blocked' when the browser withholds
   * that store); the vault is locked all the same.
   *
   * The other hard locks: `retire()`, a lock for storage the vault cannot trust (a user signed
   * out, an older copy of the vault), and a refresh that finds the vault's ways in changed or the
   * vault gone, which drops the key; `close()` likewise stops a read under way. Not hard locks:
   * `lockSoon()`, whose grace lets work in hand finish even once its shut time has come and the
   * key is dropped, and a clock that cannot be read, which drops the key at once without a grace.
   */
  lock(): Promise<void>
  /**
   * Lock gently, for a hidden tab or a sign-out -- the soft lock: no new secrets from this instant,
   * work in hand finishes, and the vaultKey is dropped `graceSeconds` from now -- or sooner, when
   * the unlock's own lease would drop it sooner: a key past `askPassphraseAt` keeps only the
   * minute it had left, and one past that is dropped at once. At once, the snapshot reads
   * `locked`, every `readBox`, `useBox`, `storeBox` or `retireBox` called from now on throws kind
   * 'vault_locked', and this device forgets its lease. What the grace spares is work already past
   * its start: a `readBox()`, a `storeBox()` or a `retireBox()` still lands; and an `unlock()` or
   * `changePassphrase()` still under way, in this tab or another on this device, finishes, leaving
   * the vault unlocked again. An `unlock()` or `changePassphrase()` begun within the grace ends it
   * too: the vault is unlocked again, and nothing is dropped.
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
   * in keeps its `wayin_id` and `wayinlabel`, and takes a fresh passphraseSalt. The vault's
   * other ways in are untouched, and still open it. Lockboxes are untouched too -- their
   * lockboxKeys stay wrapped under the unchanged vaultKey -- so this is cheap no matter how many
   * there are. Every other device's unlock (a lease or in hand) lapses: the vault props'
   * unlockEpoch moves, and they fall back to `locked` on their next look.
   *
   * A `newPassphrase` the vault's `passphraseStrengthTest` finds weak is refused first, before any
   * key derivation, with kind 'weak_passphrase', the test's reason its message.
   *
   * `proof` is any way in the vault has: the passphrase being replaced, another passphrase, or
   * a passkey's answer ({@link PasskeyProof}) -- any way in proves any change, so a user who
   * forgot their passphrase sets a new one with their fingerprint. Given a passphrase, the way
   * in it opens is the one replaced (`opts.wayinId` aims it at one way in, as `unlock()` is
   * aimed). Given a passkey's answer, which passphrase to replace is `opts.wayinId`'s to say,
   * unless the vault has only one.
   *
   * Works locked or unlocked, since the proof is proof enough. A wrong passphrase throws kind
   * 'wrong_passphrase', and a passkey's answer that does not open the vault 'wrong_passkey' or
   * 'absent_wayin', changing nothing. A passkey's answer with several passphrases to choose
   * from and no `opts.wayinId` throws kind 'bad_option', and an `opts.wayinId` that names no
   * passphrase of the vault 'absent_wayin'. If another device changes the vault's ways in (or
   * retires the vault) between this device's look and its write, nothing is written and the
   * call throws kind 'stale_write', after catching up with storage.
   *
   * Leaves the vault unlocked under the new passphrase, the lease starting again from now when a
   * passphrase proved the change, since the user just typed who they are; a passkey's answer
   * keeps the lease standing on an unlocked vault, and grants one on a locked vault, as
   * `unlock()` by passkey would -- unless `lock()` or `retire()` is called
   * while the change is under way, which wins: the passphrase still changes, and the vault stays
   * locked. A `lockSoon()` lets it finish, unlocked. So does the lease running out while the
   * change is under way: the vault ends unlocked, with its new lease. Once the change has landed
   * in storage, the call resolves: should this device then fail to keep its own records of it,
   * the logger says so, and the vault asks for the passphrase at its next open.
   *
   * @example await vault.changePassphrase(oldPassphrase, newPassphrase)
   * @example await vault.changePassphrase(passkey, newPassphrase)  // forgot the old one: a passkey's answer proves it
   * @example await vault.changePassphrase(passkey, newPassphrase, { wayinId: homePhraseId })   // a vault of several passphrases
   */
  changePassphrase(proof: string | PasskeyProof, newPassphrase: string, opts?: { wayinId?: string | undefined }): Promise<void>

  /**
   * Give the vault another way in: a second passphrase (a third, ...), which opens it as the
   * first does, on any device. `proof`, a passphrase the vault already opens with or a passkey's
   * answer ({@link PasskeyProof}), proves the user may -- asked for even while unlocked, since the
   * vault keeps no copy of its vaultKey it could wrap anew. A passkey as proof is how a user who
   * forgot their passphrase sets a new one. `opts.wayinlabel` is what the user calls the new one
   * (`home_phrase`), a label no other way into this vault already has.
   *
   * Refuses with kind 'wrong_passphrase' when `proof` opens nothing (or `newPassphrase` is
   * empty), 'wrong_passkey' or 'absent_wayin' for a passkey's answer that does not open the
   * vault, 'bad_label' for a wayinlabel that fails the vault's wayinlabel check (by default
   * `Label`; a host's own in Vault.make's `validators`), is empty or is already taken,
   * 'weak_passphrase' for a `newPassphrase` the vault's `passphraseStrengthTest` finds weak (the
   * test's reason the message, before any key derivation), and
   * 'too_many_wayins' when the vault already holds {@link MaxUnlocks}: remove one first. Like
   * `changePassphrase()`, it moves the unlockEpoch, so every other device locks; it leaves
   * this one unlocked, and throws kind 'stale_write' when another device changed the vault's ways
   * in meanwhile. A passphrase as proof starts the lease again from now; a passkey's
   * keeps the deadline that stands, or, on a vault locked, sets one as `unlock()` by passkey
   * would. So does every change to the ways in.
   *
   * @returns The new way in's `wayin_id`.
   *
   * @example const wayinId = await vault.addPassphrase(passphrase, spare, { wayinlabel: 'written_down' })
   * @example const wayinId = await vault.addPassphrase(passkey, remembered, { wayinlabel: 'new_phrase' })    // forgot the old one
   */
  addPassphrase(proof: string | PasskeyProof, newPassphrase: string, opts: { wayinlabel: string }): Promise<string>

  /**
   * Give the vault a passkey as a way in: a fingerprint, a face, or a security key, whose
   * authenticator answers for the vault through the WebAuthn PRF extension. `proof`, a passphrase
   * the vault opens with or another passkey's answer, proves the user may, as for
   * `addPassphrase()`. Only once it has, the vault calls `makePasskey`, which asks the
   * authenticator for the new passkey and resolves with its answer over a fresh salt
   * ({@link PasskeyProof}), or null when the user dismissed the prompt: `safebyok-react`'s
   * `createPasskey` is one, and the core never calls WebAuthn itself. So a proof refused, a label
   * taken, or a vault already full leaves no passkey behind on the authenticator, opening nothing.
   * `opts.wayinlabel` is what the user calls it (`laptop_fingerprint`).
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
   * @returns The new way in's `wayin_id`, or null when `makePasskey` resolved null: nothing was added.
   *
   * @example
   *   const makePasskey = () => createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } })
   *   const wayinId = await vault.addPasskey(passphrase, makePasskey, { wayinlabel: 'laptop_fingerprint' })
   */
  addPasskey(proof: string | PasskeyProof, makePasskey: () => Promise<PasskeyProof | null>, opts: { wayinlabel: string }): Promise<string | null>

  /**
   * Take away one way in, a passphrase or a passkey, named by its `wayin_id` from the snapshot's
   * `wayins`. `proof`, a passphrase the vault opens with or a passkey's answer -- the one going,
   * or another -- proves the user may. Refuses with kind 'absent_wayin' when there is no such way
   * in, and 'last_wayin' when it is the vault's last passphrase: a vault always keeps one, since
   * a passkey can be lost with its device. Like `changePassphrase()`, it moves the
   * unlockEpoch, so every other device locks and must unlock again with a way in still
   * standing; it leaves this one unlocked.
   *
   * Removal is not revocation: whoever knew the removed passphrase, or holds the removed passkey,
   * and kept a copy of the vault as it was can still open that copy, and the vaultKey inside it is
   * the one the vault still uses. Removing a way in stops it opening the vault from here on; it
   * cannot take back what it opened before.
   *
   * @example await vault.retireWayin(passphrase, leaked.wayin_id)
   */
  retireWayin(proof: string | PasskeyProof, wayinId: string): Promise<void>

  /**
   * Write a whisper into the lockbox `boxlabel`, creating or replacing it. Requires unlocked;
   * kind 'whisper_too_large' when its JSON and the lockbox's sidecar's together are over the
   * vault's `maxWhisperBytes`, and kind 'vault_full' when `boxlabel` is new and the vault already
   * holds its `maxLockboxes` -- retire one first. A sidecar left out, and so kept from the lockbox,
   * counts toward `maxWhisperBytes` as one given does. Replacing a lockbox is never refused as
   * 'vault_full' by the vault's own limits, though a backend holding a limit of its own may refuse
   * a heavier replacement in a full vault as kind 'vault_full'.
   *
   * The write lands only if storage still holds what this device last read: the same vault, under
   * the same vaultKey, and the same revision of this lockbox (or still none). The store makes one
   * attempt. When another device or tab got in first -- writing this lockbox, creating it, or
   * retiring it -- storage refuses the write, and the call catches up with storage once and throws
   * kind 'stale_write' at once, without waiting: nothing was written, and the snapshot now shows
   * the lockbox as storage holds it. The vault merges nothing and decides nothing for the user: the
   * app shows what is there now, and calls `storeBox()` again if this whisper should still replace
   * it. A catch-up that finds the vault retired or made anew elsewhere, or its ways in changed,
   * relocks this device instead, and the call throws kind 'vault_locked' without writing: a stale
   * session never writes into a vault reborn under new keys.
   *
   * Should the catch-up after a refusal fail itself, the call throws kind 'stale_write', the
   * catch-up's failure its cause, and the snapshot says `syncing: false` -- or, for a catch-up
   * refused as 'identity_revoked', 'rolled_back' or 'newer_format', that refusal as it came.
   *
   * The lockbox keeps the time it was first stored as `registered_at`, and stamps `written_at`
   * with the time of this write: every store moves it, the same whisper stored again included, so
   * it says when the lockbox was last written, never whether its whisper changed.
   *
   * A lockbox whose stored record cannot be read as one -- every lockbox the snapshot lists as
   * damaged, and also one that lists as sound but whose ciphered fields are missing or malformed
   * -- is overwritten as though it were new, with nothing carried from it, neither its sidecar
   * nor its `registered_at`: in one write over the revision the listing names, which another
   * device's write meanwhile refuses, as for any lockbox. A record that names no revision is
   * retired first, then written; should that write fail, the old record is gone and the call
   * throws: calling `storeBox()` again writes the lockbox afresh. A record that reads but will not decipher --
   * its ciphertext, its sidecar or a time altered in storage -- is written over its revision, but
   * carries nothing forward either: nothing vouches for its server-readable fields, so its sidecar becomes `{}`
   * unless one is given, and its `registered_at` is now. A boxlabel the vault's check refuses is
   * kind 'bad_label', writing nothing, even where a lockbox stored under other checks stands under
   * it: that one reads and retires by its name, but is never written anew under it.
   *
   * `opts.sidecar` is the lockbox's sidecar ({@link Sidecar}): your app's own data, riding
   * beside the whisper, server-readable -- authenticated, but never encrypted, so anyone who can
   * read the database can read it. Any JSON value, shown in the snapshot while locked, never interpreted by the vault -- kind 'bad_option' for anything JSON
   * cannot carry. Check its shape yourself before storing it. It is the only option: any other
   * (a misspelt `sidcar`, or a `note` beside it) is kind 'bad_option', writing nothing. Left out, the lockbox keeps the sidecar
   * it has (when its record opens: see above), and a new lockbox gets `{}`; `{}` empties it. The sidecar is stored in the clear and
   * bound into the lockbox's encryption, so a sidecar altered in storage makes the lockbox refuse to
   * open. Put in it what your app wants searchable server-side (a team, a rotation reminder, a
   * usage count), never secret material. A lockbox heavier, whisper and names and sidecar together,
   * than storage holds in one record is refused with kind 'lockbox_too_large'; one that would take
   * the vault past what its storage holds of one vault, with kind 'vault_full'.
   *
   * @example await vault.storeBox('anthropic_api_key', 'sk-ant-...', { sidecar: { note: 'work account' } })
   * @example await vault.storeBox('anthropic_api_key', 'sk-ant-...')              // keeps the sidecar it has
   * @example await vault.storeBox('anthropic_api_key', 'sk-ant-...', { sidecar: {} }) // and empties it
   */
  storeBox(boxlabel: string, whisper: Whisper, opts?: { sidecar?: Sidecar | undefined }): Promise<void>
  /**
   * The whisper in `boxlabel`. Requires unlocked; kind 'absent_box' when there is none, and
   * 'damaged_lockbox' when its stored record fails its checks, or will not open under the vault's
   * key: `retireBox()` it, or `storeBox()` over it. A lockbox that will not open is named so only
   * after one catch-up with storage: one a vault retired and made anew elsewhere wrote relocks this
   * device, and the call throws kind 'vault_locked'; a catch-up that fails throws its own
   * refusal. A hard lock landing while it reads wins, and nothing is handed back: kind
   * 'vault_locked' for a `lock()`, a `retire()`, or a refresh that finds the vault's ways in
   * changed or the vault gone; 'vault_closed' for a `close()`.
   * A lockbox stored under a boxlabel the vault's check refuses -- by another client, or under
   * other checks -- reads as any other, by the name it was stored under. With nothing under it, a
   * name the check refuses is kind 'bad_label', and one below the floor every name is held to is
   * 'bad_label' always.
   */
  readBox(boxlabel: string): Promise<Whisper>
  /**
   * Hand the whisper to `callback` and return its result: the shape that discourages parking a
   * secret in state. Requires unlocked; kind 'bad_option', before anything is read, for a
   * `callback` that is not a function. Refuses `boxlabel` as `readBox()` does: 'absent_box',
   * 'damaged_lockbox', and 'bad_label' for a name the vault's check refuses with nothing under it.
   *
   * @example await vault.useBox('anthropic_api_key', (whisper) => callAnthropic(whisper))
   */
  useBox<ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT>
  /**
   * Remove the lockbox `boxlabel` entirely, whatever revision of it stands -- even one whose
   * stored record fails verification, which the snapshot lists as damaged and reading refuses as
   * 'damaged_lockbox': retiring it needs nothing from it, and is the remedy for it. A lockbox
   * stored under a boxlabel the vault's check refuses is reached by that name too. Requires
   * unlocked; kind 'absent_box' when absent, and 'bad_label' for a refused name with nothing
   * under it. The retirement lands only in the vault this device last read: if it was retired, or
   * retired and made anew, elsewhere, nothing is removed and the call throws kind
   * 'stale_write', after catching up with storage -- which relocks this device -- its message
   * saying the lockbox could not be retired because the vault it was in is gone, and the
   * adapter's refusal its cause.
   */
  retireBox(boxlabel: string): Promise<void>

  /**
   * Retire the vault: delete its every stored record, remote and device-local, the vault half of
   * deleting an account. No tombstone is kept. Deliberately does NOT require unlock -- an authenticated owner can always delete
   * their own rows server-side, and requiring unlock here would only look like protection.
   *
   * Deletes the vault this handle last read, and only that one: if it was retired, or
   * retired and made anew, elsewhere since, storage keeps what stands there now and the call
   * throws kind 'stale_write', after catching up -- so a second retire(), the user asking again,
   * deletes the vault that then stands, the one the snapshot shows. A handle that has seen no
   * vault reads storage first, and deletes whatever vault stands there: "delete my vault" never
   * reports success over one standing. Locks as `lock()` does, and wins as it does over work under
   * way; this device's mark of the vault forgets it, keeping its lock generation.
   */
  retire(): Promise<void>
  /**
   * Release subscriptions and refuse further calls, dropping the vaultKey from memory. It is not
   * a lock of the vault, and forgets nothing stored: this device's lease stays, and the next
   * vault made takes it up. An `unlock()` still under way takes nothing up and throws kind 'vault_closed';
   * any lease it granted on the device before the close stays too. A `readBox()` or
   * `useBox()` still under way hands back nothing and throws kind 'vault_closed', as after a hard
   * lock. A second `close()` does nothing.
   */
  close(): void
}

/**
 * What `vaultProps` holds before the backend's first answer arrives: distinct from null, which is
 * the backend's own answer ("no vault props: this vault was never created"). Symbol.for, not Symbol, so
 * the sentinel stays one value even when the ESM and CJS builds load side by side.
 */
const UnreadVaultProps = Symbol.for('safebyok.unread_vault_props')

/**
 * A handle on one user's vault, made at once: its options checked, nothing read yet. It starts
 * `hello()` itself, which reads the vault props and this device's lease and settles the snapshot
 * from `opening` into `absent`, `locked` or `unlocked`; every call on the handle but `lock()`,
 * `lockSoon()` and `close()` waits for that first, so the handle may be used at once. A hello that
 * fails -- storage unreachable, a user not yet signed in -- rejects nothing unheard: the snapshot
 * says why as its `trouble` (the vault still `opening`, when storage could not be read), and the
 * vault's logger warns of it. Await
 * `vault.hello()` to hear the refusal itself, and call it again to retry.
 *
 * Misuse throws here, before storage is touched: kind 'bad_label' for a label or a `userId` that
 * fails its check (`validators`), and 'bad_option' for any other option -- an option it does not
 * take (a misspelling, or a name it no longer uses, which it names), or a `vaultDB` or `deviceDB`
 * short of a verb, or a `vaultDB` that is no instance of the `VaultDB` class. Kind
 * 'insecure_context', first of all, in a page the browser says is not a secure context
 * (`isSecureContext` false: plain http, anywhere but localhost), where it withholds WebCrypto:
 * serve the app over https.
 *
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 *   await vault.hello()
 *   vault.getSnapshot().state  // 'absent' | 'locked' | 'unlocked'
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, deviceDB, keyDeriver, passphraseStrengthTest })
 * @example Vault.make({ ...opts, forcePassphraseReentryHours: 1 })  // throws 'bad_option': it is called leaseHours now
 */
const make = (opts: MakeVaultOpts): Vault => {
  ensureSecureContext()
  if (! isBag(opts)) { throw new VaultError('bad_option', 'Vault.make takes one bag of options: applabel, userId, vaultlabel, vaultDB, deviceDB, keyDeriver and passphraseStrengthTest at least.') }
  ensureKnownOpts(opts)
  const rules = Names.rulesOf(opts.validators)
  const scope = Names.checkScope(rules, { applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
  const { applabel, vaultlabel } = scope
  const givenVaultDB = parseVaultDB(opts.vaultDB)
  // Every failure of the device's own storage reaches the vault's callers as a condition, with a kind.
  const deviceDB = deviceTroubleAsConditions(parseDeviceDB(opts.deviceDB))
  const leaseMillis = parseLeaseHours(opts.leaseHours)
  // The host's logger for the vault, else the one its storage was made with; guarded either way.
  const logger = parseLogger(opts.logger ?? givenVaultDB.logger)
  const clock = parseClock(opts.clock)
  // Every reading of the host's clock is checked, this first one so that a clock counting in the
  // wrong unit fails make rather than some later call.
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
  const strengthTest = checkStrengthTest(opts.passphraseStrengthTest)
  const whisperByteLimit = parseMaxWhisperBytes(opts.maxWhisperBytes)
  const lockboxLimit = parseMaxLockboxes(opts.maxLockboxes, parseDeclared(givenVaultDB, 'maxLockboxes'))
  const vaultByteLimit = ensureLimitsFit(givenVaultDB, whisperByteLimit, lockboxLimit)
  // Every storage refusal, whichever call met it, passes by the refusal policy on its way out.
  const vaultDB = RefusalPolicy.heed(givenVaultDB, async (refusal) => { await heedRefusal(refusal) })

  let vaultProps: VaultProps | null | typeof UnreadVaultProps = UnreadVaultProps
  // This device's mark for the vault props in hand, set with them, so the two always name one vault.
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
  // How many times this handle has had this device forget its lease: every shut, and every
  // lockSoon(). A hello notes the number when it starts, and takes up no lease unless it was 0 then
  // and has not moved meanwhile: a lock, soft or hard, wins over the lease it forgot, on this
  // handle for good.
  let forgetsSoFar = 0
  // The timer that drops the vaultKey, and when it falls due: a minute past askPassphraseAt (see
  // ExpiryGraceMillis), or sooner for lockSoon(). Null when no key is held, or the one held lasts
  // until lock().
  let pendingShut: { timer: ReturnType<typeof setTimeout>, dueAt: number } | null = null

  const listeners = new Set<() => void>()
  const vaultState = (): VaultState => {
    if (vaultProps === UnreadVaultProps) { return 'opening' }
    if (vaultProps === null) { return 'absent' }
    if (vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > clockNow()) { return 'unlocked' }
    return 'locked'
  }
  /** The public face of each way into the vault, once there is one. */
  const wayinSummaries = (): readonly WayinSummary[] => (
    vaultProps === UnreadVaultProps || vaultProps === null ? [] : vaultProps.wayins.map((wayin) => Wayin.summarize(wayin))
  )
  // Whether the last read of storage succeeded, as the snapshot says; and whether the storage
  // watch has warned of a failing streak it has not yet seen end.
  let syncing = true
  let watchWarned = false
  // The refusal the last read met, until a read succeeds: the snapshot's trouble.
  let trouble: VaultError | null = null
  // The hello under way, or the last to succeed while what it read still stands (`greeted`); null
  // when the next hello must read afresh. See hello().
  let greeting: Promise<void> | null = null
  let greeted = false
  let snapshot: VaultSnapshot = { state: vaultState(), scope, boxes, askPassphraseAt, wayins: [], syncing, trouble }
  // The snapshot keeps its identity until something really changed: useSyncExternalStore's
  // contract, and what spares React a render when a background refresh found nothing new. Its
  // trouble is told apart by identity, as two refusals of one kind read alike as JSON.
  const bump = () => {
    const state = vaultState()
    const next: VaultSnapshot = { state, scope, boxes, askPassphraseAt: state === 'unlocked' ? askPassphraseAt : null, wayins: wayinSummaries(), syncing, trouble }
    if (next.trouble === snapshot.trouble && stableJsonify({ ...next, trouble: null }) === stableJsonify({ ...snapshot, trouble: null })) { return }
    snapshot = next
    listeners.forEach((listener) => { listener() })
  }

  // The context each encryption is bound to; see VOCABULARY.md on ctx. A
  // wayin's ctx is the Wayin module's. A lease's is bound to every field of its record but the
  // key and the wrap, the scope, vault and epoch as this vault expects them.
  const leaseCtx = (vaultId: string, epoch: number, deadline: number) => (
    cipherCtx('safebyok-lease-v1', applabel, scope.user_id, vaultlabel, vaultId, epoch, deadline, 'vault_key_lease_wrapped')
  )
  // A lockbox's ctx binds its format, the vault it lies in, and its record's whole public header:
  // every field but the format, which leads, and the two encrypted ones, so a sidecar, a time, its
  // codec or its vaultKey's epoch altered in storage refuses to open.
  const boxCtx = (vaultId: string, header: LockboxHeader, purpose: 'lockbox_key_wrapped' | 'whisper_ciphered') => (
    cipherCtx(LockboxFormat, applabel, scope.user_id, vaultlabel, vaultId, purpose, header)
  )

  /**
   * Bring the snapshot up to what storage holds now, one read at a time: a refresh asked for while
   * one runs is served by one more run once that ends, shared by every request made meanwhile, so
   * each caller sees storage as it stood after it asked, and no two reads interleave.
   */
  const refresh = oneAtATime(() => readStorage())

  /**
   * One read of storage into the snapshot. One that fails leaves the snapshot as it stood, but for
   * its `syncing` and `trouble`, and has the next hello read afresh.
   */
  const readStorage = async () => {
    try {
      await takeStorage()
    } catch (err) {
      syncing = false
      noteTrouble(err)
      forgetHello()
      bump()
      throw err
    }
    if (! watchWarned) { return }
    watchWarned = false
    logger.log('Storage reads again after the failures the vault warned of: what it shows has caught up with storage.', { call: 'refresh' })
  }

  const takeStorage = async () => {
    // The mark the vault props are held to is read before them (see heedMark), and an older copy of a vault
    // this device has seen newer is refused before anything is taken from it.
    const seenBefore = checkedMark(await deviceDB.readMark(scope))
    const fresh = await damagedAs(vaultDB.readVaultProps(scope), damagedVaultProps)
    const mark = fresh === null ? null : await heedMark(fresh, { seenBefore, call: 'refresh' })
    // A change to the wayins elsewhere (new epoch) or a deletion ends this device's unlock: the
    // vaultKey in hand still works on old rows, but passing as current invites confusion.
    const outlived = vaultKey !== null && vaultProps !== UnreadVaultProps && vaultProps !== null
      && (fresh?.unlock_epoch !== vaultProps.unlock_epoch || fresh.vault_id !== vaultProps.vault_id)
    if (outlived) {
      hardLocksSoFar += 1
      dropKey()
      await deviceDB.eraseLease(scope)
    }
    const listed = fresh === null ? [] : await vaultDB.listBoxes(scope)
    // Taken up together once all is read, so a read that fails partway leaves the snapshot's
    // vault, mark and lockboxes as they stood: never a vault beside another's lockboxes.
    vaultProps = fresh
    deviceMark = mark
    // A lockbox under a vaultKey the vault does not hold lists as damaged from its epoch alone.
    boxes = fresh === null ? [] : listed.map((box) => (isUnderHeldKey(box, fresh) ? box : asDamaged(box)))
    syncing = true
    trouble = null
    bump()
  }

  /** Keep `err`, what a read met, as the snapshot's trouble. Every failure on a read's path is a VaultError: storage's, the device store's and the clock's are each said as one. */
  const noteTrouble = (err: unknown) => {
    if (isVaultError(err)) { trouble = err }
  }

  /**
   * Have the next hello read afresh, once one has succeeded: what it read may no longer stand. A
   * hello under way is left to finish, every caller sharing it; one that fails forgets itself.
   */
  const forgetHello = () => {
    if (! greeted) { return }
    greeting = null
    greeted = false
  }

  /** The hello `Vault.hello` promises, shared while it runs and kept once it succeeds; see there. */
  const hello = (): Promise<void> => {
    if (closed) { return Promise.reject(closedError()) }
    greeting ??= greet()
    return greeting
  }

  /**
   * One hello: storage read, then this device's lease taken up. One that fails says so in the
   * snapshot and forgets itself, so the next hello reads afresh. No other hello can start while one
   * runs (see forgetHello), so the one this ends is always the one in `greeting`.
   */
  const greet = async (): Promise<void> => {
    const forgetsThen = forgetsSoFar
    try {
      await refresh()
      await takeUpLease(forgetsThen)
    } catch (err) {
      greeting = null
      noteTrouble(err)
      bump()
      throw err
    }
    greeted = true
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
   * This device's mark for `fresh`, vault props storage handed back, kept up to date: vault props
   * of the vault the mark names, at an `unlock_epoch` or a `vault_key_epoch` below the one this
   * device has seen, are refused as 'rolled_back', and nothing is written or taken from them. The
   * vaultKey's epoch is bound into every wayin and held to the vault props', so storage cannot
   * raise it on older vault props and still have a way in open; the unlock epoch is bound into
   * nothing, so older vault props at the same vaultKey under a raised unlock epoch pass.
   *
   * `seenBefore` is the mark as it was read before `fresh` was, which the vault props are then held
   * to, when the caller read one: storage held that epoch when the mark was written, so vault props
   * read after it are older only if storage went back. The mark as it stands now could hold a newer
   * epoch, written meanwhile by another tab or this one, and refuse vault props that were the newest
   * when they were read.
   */
  const heedMark = async (fresh: VaultProps, opts: { seenBefore?: DeviceMark | null, call: VaultCall }): Promise<SeenMark> => {
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
  const raiseMark = async (kept: DeviceMark | null, fresh: VaultProps): Promise<SeenMark> => {
    const mark = markSeeing(kept, fresh)
    if (mark.seen !== kept?.seen) { await deviceDB.writeMark(mark) }
    return mark
  }

  /** The mark {@link raiseMark} keeps, `kept` itself (whose `seen` it keeps) when nothing is raised. */
  const markSeeing = (kept: DeviceMark | null, fresh: VaultProps): SeenMark => {
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

  /** This scope's mark with nothing seen, at `lockGeneration`: what a lock leaves where no vault was seen, and retire() leaves of one. */
  const blankMark = (lockGeneration: number): DeviceMark => ({ format: MarkFormat, ...scope, lock_generation: lockGeneration, seen: null })

  /** The `device_id` a mark of `vaultId` starts under: the one this handle drafted it under, or a new one. */
  const newDeviceIdFor = (vaultId: string): string => (drafted?.vault_id === vaultId ? drafted.device_id : randomId())

  /**
   * This device's id for the vault `standing` is, which every way in it adds carries: the one its
   * mark holds, set with the vault props in hand. Vault props in hand that have moved on to another
   * vault meanwhile are said as the stale write they would make.
   */
  const deviceIdFor = (standing: VaultProps): string => {
    if (deviceMark?.seen.vault_id === standing.vault_id) { return deviceMark.seen.device_id }
    throw new VaultError('stale_write', 'The vault changed in storage while this device was reading it -- it was deleted or made anew elsewhere -- so nothing was written. Read the vault again before retrying.')
  }

  const ensureOpen = () => {
    if (closed) { throw closedError() }
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

  const currentVaultProps = (): VaultProps => {
    if (vaultProps === UnreadVaultProps || vaultProps === null) {
      throw new VaultError('absent_vault', 'This vault has not been created yet: the first unlock() creates it.')
    }
    return vaultProps
  }

  /**
   * The vaultKey out of whichever of `standing`'s ways in `proof` opens, or the one `wayinId`
   * names; its refusal IS the passphrase (or passkey) check.
   */
  const unwrapWith = async (standing: VaultProps, proof: Proof, wayinId?: string) => (
    await Wayin.open(keyDeriver, proof, scope, standing, wayinId)
  )

  /**
   * Brand-new vault props around a brand-new vaultKey, wrapped under `passphrase`: their one way
   * in, added by this device under `deviceId`.
   */
  const draftVaultProps = async (passphrase: string, deviceId: string): Promise<{ draft: VaultProps } & VaultKeyPair> => {
    const identity = { vault_id: randomId(), registered_at: clockNow() }
    const freshKey = await makeVaultKey()
    const stamp: WayinStamp = {
      wayin_id:        randomId(),
      wayinlabel:      FirstWayinlabel,
      vault_key_epoch: FirstVaultKeyEpoch,
      device_id:       deviceId,
      registered_at:   identity.registered_at,
    }
    const { wayin, sessionKey } = await Wayin.sealFirstPassphrase(keyDeriver, passphrase, scope, identity, stamp, freshKey)
    const draft: VaultProps = {
      format:              'safebyok-vault-v3',
      ...scope,
      ...identity,
      unlock_epoch:        1,
      vault_key_epoch:     FirstVaultKeyEpoch,
      wayins:              [wayin],
    }
    return { draft, transientKey: freshKey, sessionKey }
  }

  /**
   * The vaultKey for an unlock, and the vault props it was proven against: creating the vault when
   * absent, proving the proof when not. An unlock aimed at one way in never creates: the vault it
   * named no longer stands. Nor does a passkey's: a vault is created with a passphrase.
   */
  const settleUnlock = async (proof: Proof, wayinId: string | undefined): Promise<{ standing: VaultProps } & VaultKeyPair> => {
    if (vaultProps === null || vaultProps === UnreadVaultProps) {
      if (typeof proof !== 'string') {
        throw new VaultError('absent_vault', 'This vault has not been created yet, so no passkey opens it: the first unlock(), with a passphrase, creates it.')
      }
      if (wayinId !== undefined) {
        throw new VaultError('absent_wayin', "This vault has no way in with that wayin_id: it does not exist, and may have been retired on another device. Unlock without a wayinId to create it anew.")
      }
      await ensureStrongEnough(strengthTest, proof, scope)
      const deviceId = randomId()
      const { draft, transientKey, sessionKey } = await draftVaultProps(proof, deviceId)
      drafted = { vault_id: draft.vault_id, device_id: deviceId }
      // Another device's vault, if one was made meanwhile, is held to the mark as it was before it.
      const seenBefore = checkedMark(await deviceDB.readMark(scope))
      const settled = await damagedAs(vaultDB.fetchOrCreateVaultProps(draft), damagedVaultProps)
      const mark = await heedMark(settled, { seenBefore, call: 'unlock' })
      vaultProps = settled
      deviceMark = mark
      if (settled.vault_id === draft.vault_id) { return { standing: settled, transientKey, sessionKey } }
      // Another device created the vault between our look and our write: the settled vault props are
      // theirs, and this passphrase must prove itself against them like any other.
      try {
        return { standing: settled, ...await unwrapWith(settled, proof, wayinId) }
      } catch (err) {
        if (isVaultError(err, 'wrong_passphrase')) { await refuseCreatedElsewhere(err) }
        throw err
      }
    }
    const standing = vaultProps
    return { standing, ...await unwrapWith(standing, proof, wayinId) }
  }

  /**
   * Rewrite the vault's ways in: prove `proof` against the vault props as storage holds them now (or
   * against the one way in `wayinId` names), write the wayins `revise` makes of the standing ones
   * under the next unlock epoch, and take up the unlock under it. `check` runs first, on the
   * standing vault props, so a change refused for what it asks costs no key derivation.
   *
   * Every change to the wayins goes through here: the proof first, the write only if no other
   * device changed them meanwhile, and a shut while it runs leaving the change landed and the vault
   * locked, as `changePassphrase()` promises.
   */
  const reviseWayins = async (
    proof: Proof,
    wayinId: string | undefined,
    plan: {
      call:    'changePassphrase' | 'addPassphrase' | 'addPasskey' | 'retireWayin'
      check?:  (standing: VaultProps) => void
      // Runs once the proof holds, given this device's id for the vault; resolving null abandons
      // the change, writing nothing.
      revise:  (standing: VaultProps, proven: VaultKeyPair & { wayinId: string }, deviceId: string) => VaultProps['wayins'] | Promise<VaultProps['wayins'] | null>
    },
  ): Promise<boolean> => {
    const started = await noteStart()
    await hello()
    // The proof is made against the vault props as the backend holds them now: a cached copy could
    // bury props written elsewhere under a different vault_id entirely.
    await refresh()
    const standing = currentVaultProps()
    const deviceId = deviceIdFor(standing)
    plan.check?.(standing)
    const proven = await unwrapWith(standing, proof, wayinId)
    const wayins = await plan.revise(standing, proven, deviceId)
    if (wayins === null) { return false }
    const next: VaultProps = {
      ...standing,
      unlock_epoch:     standing.unlock_epoch + 1,
      wayins,
    }
    await refreshOnStale(vaultDB.updateVaultProps(next, { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }), plan.call)
    // The change has landed, whatever happens now: what follows is this device's own, and a
    // failure of it is said through the logger, never thrown as though the change had not landed.
    deviceMark = await raiseMarkAfter(next, plan.call)
    vaultProps = next
    // A shut meanwhile leaves only the change's unlock untaken.
    try {
      await takeUpVaultKey(proven, next, started, deadlineFor(proof, 'revise'))
    } catch (err) {
      logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands as it stood here, and asks for the passphrase at its next open.", { call: plan.call }, asError(err))
    }
    bump()
    return true
  }

  /**
   * This device's mark raised to `next`, vault props its own write just landed: never a refusal, as
   * newer ones seen meanwhile stand. A device store that fails to keep it is said through the
   * logger, and the mark is held in memory as raised: a missed mark only weakens the rollback
   * check until a later read raises it.
   */
  const raiseMarkAfter = async (next: VaultProps, call: VaultCall): Promise<SeenMark> => {
    try {
      return await raiseMark(await keptMark(call), next)
    } catch (err) {
      logger.warn("The change to the vault's ways in landed in storage, but this device could not note it in its mark of the vault: the change stands, and the mark catches up at a later read.", { call }, asError(err))
      return markSeeing(deviceMark, next)
    }
  }

  /** A passphrase wayin in `standing` for `newPassphrase`, stamped `stamp`, around the vaultKey `proven` holds. */
  const sealFor = async (standing: VaultProps, newPassphrase: string, stamp: WayinStamp, proven: VaultKeyPair) => {
    return await Wayin.sealPassphrase(keyDeriver, newPassphrase, scope, standing, stamp, proven.transientKey)
  }

  /**
   * The stamp of a way in this device adds to `standing` now, named `naming`: around the vaultKey
   * the vault props stand for, under this device's id for the vault.
   */
  const newStamp = (standing: VaultProps, naming: { wayin_id: string, wayinlabel: string }, deviceId: string): WayinStamp => ({
    ...naming,
    vault_key_epoch: standing.vault_key_epoch,
    device_id:       deviceId,
    registered_at:   clockNow(),
  })

  /** Refuse a new passkey whose credential is already one of `standing`'s ways in. */
  const ensureNewCredential = (standing: VaultProps, passkey: PasskeyProof) => {
    // Neither refusal here quotes a wayinlabel: a host's wayinlabel check may admit any text.
    if (standing.wayins.some((wayin) => wayin.wayinkind === 'passkey' && wayin.credential_id === passkey.credentialId)) {
      throw new VaultError('bad_option', "That passkey is already a way into this vault: the snapshot's wayins list each passkey's credential_id, beside its wayinlabel.")
    }
  }

  /** Refuse a new way in labelled `wayinlabel` that `standing` has no room or label for. */
  const ensureRoomForWayin = (standing: VaultProps, wayinlabel: string) => {
    if (standing.wayins.some((wayin) => wayin.wayinlabel === wayinlabel)) {
      throw new VaultError('bad_label', "This vault already has a way in under that wayinlabel: pick another. The snapshot's wayins list the labels taken.")
    }
    if (standing.wayins.length >= MaxUnlocks) {
      throw new VaultError('too_many_wayins', `This vault already holds its limit of ${String(MaxUnlocks)} ways in: remove one before adding another.`)
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
    forgetsSoFar += 1
    dropKey()
    await forgetLease(call)
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
   * Forget this device's lease, raising its mark's lock generation first -- a scope
   * with no mark readable gets one with nothing seen, at generation 1 -- so an unlock under way in
   * any handle on this device, which began under the generation before, writes no record after
   * this one is erased: the versioned erase. An unlock creating the vault loses to it too.
   */
  const forgetLease = async (call: VaultCall) => {
    const kept = await keptMark(call)
    await deviceDB.writeMark(kept === null ? blankMark(1) : { ...kept, lock_generation: kept.lock_generation + 1 })
    await deviceDB.eraseLease(scope)
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
   * lease is only logged.
   */
  const heedRefusal = async (refusal: VaultError) => {
    if (UntrustedStorageKinds.some((kind) => isVaultError(refusal, kind))) { forgetHello() }
    if (RefusalPolicy.decide(refusal) !== 'lock') { return }
    const why = refusal.kind === 'rolled_back'
      ? 'Storage handed back an older copy of the vault than this device has seen'
      : 'Storage no longer serves the user this vault was opened for -- signed out, or another user signed in --'
    const wasUnlocked = vaultKey !== null
    try {
      await shut('untrustedStorage')
    } catch (err) {
      logger.warn(`${why} so the vault locked, but this device's lease could not be forgotten: the next vault made on this device, as at the next page load, may take it up.`, { call: 'untrustedStorage' }, asError(err))
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
        logger.warn("The clock passed to Vault.make failed when the unlock's window ended, so the vault dropped its key at once, without the minute's grace. The clock's now() must return epoch milliseconds, as Date.now() does.", { call: 'expiry' }, asError(err))
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
      logger.warn("lockSoon() could not read the clock passed to Vault.make, so the vault locked at once, without a grace. The clock's now() must return epoch milliseconds, as Date.now() does.", { call: 'lockSoon' }, asError(err))
      return null
    }
  }

  /** True when the vault has shut since `shutsThen` was read from `shutsSoFar`. */
  const shutSince = (shutsThen: number) => shutsSoFar !== shutsThen

  /**
   * True when the handle has closed, or the vault has shut since `shutsThen`, or the vault props
   * standing now are no longer the ones `standing` proved a passphrase against: retired, made
   * anew, or their wayins changed, here or elsewhere.
   */
  const outrun = (standing: VaultProps, shutsThen: number) => (
    closed || shutSince(shutsThen) || vaultProps === null || vaultProps === UnreadVaultProps
    || vaultProps.vault_id !== standing.vault_id || vaultProps.unlock_epoch !== standing.unlock_epoch
  )

  /**
   * The deadline of an unlock taken up now by `proof`, in `call`. The lease renews whenever the
   * user proves who they are by typing a passphrase, in any call: an `unlock()`, a change of
   * passphrase, a way in added or removed. An `unlock()` by passkey sets it too, as it unlocks. A
   * passkey proving a change to the ways in keeps the deadline that stands, when the vault is
   * unlocked, and sets one only when it is not. Every proof passes through here, and nothing else
   * -- a read, a store, a refresh -- moves the deadline.
   */
  const deadlineFor = (proof: Proof, call: 'unlock' | 'revise'): number => {
    const now = clockNow()
    const standing = vaultKey !== null && askPassphraseAt !== null && askPassphraseAt > now ? askPassphraseAt : null
    const renews = call === 'unlock' || typeof proof === 'string'
    return renews || standing === null ? deadlineAfter(now, leaseMillis) : standing
  }

  /**
   * Grant this device a lease and take up the vaultKey until `until`, ending any grace
   * lockSoon() left and arming the shut anew -- unless something wins over it since `started`:
   * a lock in this handle, or in another on this device (whose raised lock generation refuses the
   * record), the handle closing, or the vault props the key was proven against no longer standing.
   * Then nothing is taken up. A record already written stays, but for a lock in this handle,
   * whose own erase may have run before it landed: a close is no lock, and a record of vault props no
   * longer standing opens nothing.
   *
   * @returns True when the vault is now unlocked.
   */
  const takeUpVaultKey = async (unlocked: VaultKeyPair, standing: VaultProps, started: UnlockStart, until: number): Promise<boolean> => {
    if (outrun(standing, started.shutsThen)) { return false }
    try {
      // The transient's last act: wrapped into this device's lease, then dropped.
      await grantLease(unlocked.transientKey, standing, until, started.lockGeneration)
    } catch (err) {
      if (isVaultError(err, 'stale_write')) { return false }
      throw err
    }
    if (shutSince(started.shutsThen)) { await deviceDB.eraseLease(scope) }
    if (outrun(standing, started.shutsThen)) { return false }
    armExpiry(until, clockNow())
    vaultKey = unlocked.sessionKey
    askPassphraseAt = until
    return true
  }

  /**
   * Mint a fresh leaseKey, wrap the vaultKey under it, and keep the lease on this device, while
   * its mark still stands at `lockGeneration`: kind 'stale_write' otherwise.
   */
  const grantLease = async (unlockedKey: CryptoKey, standing: VaultProps, until: number, lockGeneration: number) => {
    const leaseKey = await makeLeaseKey()
    const wrapped = await wrapKeyUnder(leaseKey, unlockedKey, leaseCtx(standing.vault_id, standing.unlock_epoch, until))
    await deviceDB.writeLease({
      format:                  'safebyok-lease-v1',
      ...scope,
      vault_id:                standing.vault_id,
      unlock_epoch:            standing.unlock_epoch,
      lease_key:               leaseKey,
      vault_key_lease_wrapped: wrapped,
      ask_passphrase_at:       until,
    }, { lock_generation: lockGeneration })
  }

  /**
   * Take up this device's lease, if it holds one that still fits and still opens: the vault is
   * then unlocked until the lease's askPassphraseAt, with no proof asked. Anything else leaves
   * the vault as it stands, and a lease that does not fit or open is erased. Runs once the vault
   * props are read, in hello(), and does nothing while there are none. The deviceDB may be the
   * host's own, so what it hands back is checked here, whoever wrote it: a record that does not
   * pass reads as "no lease", the safe failure.
   *
   * A lease whose deadline lies past what this handle's leaseHours allows from now was granted
   * under a longer setting, and does not fit either: lowering the option has each device ask
   * again at its next hello, and raising it lengthens no lease already granted. Nothing on this
   * path writes a record, so it can never bring back one that another tab's lock() erased
   * meanwhile.
   *
   * Only a handle that has never forgotten a lease takes one up: `forgetsThen`, read from
   * `forgetsSoFar` before the vault props were, must be 0, and must not have moved by the time the
   * lease opens. A lock on this handle, hard or soft, or a lock for storage it cannot trust, is the
   * user's word, or the vault's, that this handle is locked: a lease the lock could not erase is
   * left for the next handle made (the next page load), and this one asks for a proof. A handle
   * whose first hello failed -- storage unreachable, say -- has forgotten nothing, and still takes
   * its lease up once a hello succeeds; but one refused as storage it cannot trust has locked, as
   * above. One already unlocked holds its key, and loses nothing.
   */
  const takeUpLease = async (forgetsThen: number) => {
    if (forgetsThen !== 0 || vaultProps === UnreadVaultProps || vaultProps === null) { return }
    const kept = await deviceDB.readLease(scope)
    if (kept === null) { return }
    const checked = Lease.safeParse(kept)
    // A record naming some other scope is out of place, as unreadable as a mangled one.
    const readable = checked.success && Names.sameScope(checked.data, scope)
    const now = clockNow()
    const fits = readable
      && checked.data.vault_id === vaultProps.vault_id
      && checked.data.unlock_epoch === vaultProps.unlock_epoch
      && checked.data.ask_passphrase_at > now
      && checked.data.ask_passphrase_at <= deadlineAfter(now, leaseMillis)
    if (! fits) {
      await deviceDB.eraseLease(scope)
      // Expired, or outdated by a change to the wayins or a shorter setting, is routine; unreadable is worth a word.
      if (! readable) { forgetUnreadableLease() }
      return
    }
    const lease = checked.data
    try {
      // Nothing on the lease's path ever re-wraps the vaultKey, so no extractable handle exists
      // on it at all.
      const unwrapped = await unwrapKeyUnder(
        lease.lease_key,
        lease.vault_key_lease_wrapped,
        leaseCtx(vaultProps.vault_id, vaultProps.unlock_epoch, lease.ask_passphrase_at),
        { extractable: false, usage: ['wrapKey', 'unwrapKey'] },
      )
      // A lock meanwhile -- the host's, or a storage refusal saying the user signed out -- wins
      // over the record.
      if (closed || forgetsSoFar !== forgetsThen) { return }
      armExpiry(lease.ask_passphrase_at, now)
      vaultKey = unwrapped
      askPassphraseAt = lease.ask_passphrase_at
    } catch {
      // A lease that no longer opens reads as "no lease": the safe failure.
      await deviceDB.eraseLease(scope)
      forgetUnreadableLease()
    }
  }

  // Told once the record is erased, so it never claims a forgetting that failed. Neither the record
  // nor the reason it failed is told: the record holds key material, and its validator's issues
  // may quote it.
  const forgetUnreadableLease = () => {
    logger.warn("This device's lease could not be read or would not open, so it was forgotten: the vault opens locked, and asks for the passphrase again.", { call: 'hello' })
  }

  /**
   * What one lockbox counts for against the vault's storage: room for a whisper and sidecar of
   * `maxWhisperBytes` together (twice that, as {@link StoredBytesPerWhisperByte} says), its
   * fixed-size fields, and its scope and boxlabel as measured, so names of any length are counted
   * as they are.
   */
  const lockboxWeight = (boxlabel: string) => (
    (whisperByteLimit * StoredBytesPerWhisperByte) + LockboxFixedBytes + jsonBytes([scope, boxlabel])
  )

  /**
   * Refuse a whisper whose JSON, with the sidecar's beside it, is over `maxWhisperBytes`: kind
   * 'whisper_too_large', quoting neither.
   */
  const ensureWhisperFits = (whisperBytes: Uint8Array, sidecarJson: string) => {
    const sidecarBytes = new TextEncoder().encode(sidecarJson).length
    if (whisperBytes.length + sidecarBytes <= whisperByteLimit) { return }
    throw new VaultError('whisper_too_large', `That whisper and its lockbox's sidecar are over this vault's limit of ${String(whisperByteLimit)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Vault.make.`)
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
      throw new VaultError('vault_full', `This vault already holds its limit of ${String(lockboxLimit)} lockboxes: retire one before storing another. A vault meant to hold more can be opened with a larger maxLockboxes, up to what its storage adapter allows.`)
    }
    if (crowded === 'bytes') {
      throw new VaultError('vault_full', `This vault has no room for that lockbox in the ${String(vaultByteLimit)} bytes its storage holds of one vault, counting each lockbox's boxlabel and room for a whisper and sidecar of maxWhisperBytes: retire a lockbox, or store under a shorter boxlabel.`)
    }
  }

  /**
   * `boxlabel`, once a lockbox stands under it, for retireBox(), which reaches a lockbox by the name it
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
   * names it, so a listing gone stale costs a refusal and a second store, never a record.
   */
  const listedRevisionOf = (boxlabel: string): string | null => boxes.find((box) => box.boxlabel === boxlabel)?.revision_tok ?? null

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
   * under the name: a lockbox stored under a name it refuses reads and retires as any other.
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
    await hello()
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
   * catch-up with storage before the kind is named: a vault retired and made anew elsewhere, or
   * its ways in changed, relocks this device, and the call refuses as 'vault_locked'; otherwise
   * the lockbox is 'damaged_lockbox'. A catch-up that fails is thrown as it came: whether the box
   * is damaged is not known.
   */
  const decipherOrCatchUp = async (unlockedKey: CryptoKey, lockbox: Lockbox): Promise<Whisper> => {
    try {
      return await decipherLockbox(unlockedKey, currentVaultProps(), lockbox)
    } catch (err) {
      if (! isVaultError(err, 'damaged_lockbox')) { throw err }
      await refresh()
      keyInHand()
      throw err
    }
  }

  /**
   * The key a lockbox's lockboxKey is unwrapped under, chosen by its `vault_key_epoch`: the
   * session's vaultKey for a lockbox under the vault props' own. Kind 'damaged_lockbox' for a lockbox
   * under any other, which no key this vault holds opens.
   */
  const unwrappingKeyFor = (unlockedKey: CryptoKey, standing: VaultProps, lockbox: Lockbox): CryptoKey => {
    if (lockbox.vault_key_epoch === standing.vault_key_epoch) { return unlockedKey }
    // Quotes no boxlabel, as no refusal here does: a host's boxlabel check may admit any text.
    throw new VaultError('damaged_lockbox', "That lockbox is damaged: it says it was sealed under a vaultKey this vault does not hold, so it can't be opened. It was left as it is; retire it, or store its whisper again over it.")
  }

  /**
   * Unwrap a lockbox's lockboxKey under the vaultKey, decipher its whisper, and hand it back
   * validated: kind 'damaged_lockbox' when the record will not open, or opens to no whisper.
   * The vaultKey is the vault's own, proven by the way in that gave it, so a lockbox that will not
   * open under it is one altered in storage, or moved there from somewhere else.
   */
  const decipherLockbox = async (unlockedKey: CryptoKey, standing: VaultProps, lockbox: Lockbox): Promise<Whisper> => {
    let whisperBytes: Uint8Array
    const { format: _format, lockbox_key_wrapped: lockboxKeyWrapped, whisper_ciphered: whisperCiphered, ...header } = lockbox
    const vaultId = standing.vault_id
    const unwrappingKey = unwrappingKeyFor(unlockedKey, standing, lockbox)
    try {
      const lockboxKey = await unwrapKeyUnder(
        unwrappingKey,
        lockboxKeyWrapped,
        boxCtx(vaultId, header, 'lockbox_key_wrapped'),
        { extractable: false, usage: ['decrypt'] },
      )
      whisperBytes = await decipherBytes(lockboxKey, whisperCiphered, boxCtx(vaultId, header, 'whisper_ciphered'))
    } catch {
      throw new VaultError('damaged_lockbox', "That lockbox is damaged: it would not open under this vault's key, as if altered in storage or moved there from somewhere else. It was left as it is; retire it, or store its whisper again over it.")
    }
    const checked = Whisper.safeParse(parseJsonOrNull(new TextDecoder().decode(whisperBytes)))
    if (! checked.success) {
      throw new VaultError('damaged_lockbox', "That lockbox opened, but what was inside is not a whisper this package knows, so it is damaged. It was left as it is; retire it, or store its whisper again over it.")
    }
    return checked.data
  }

  /**
   * True when `prev` opens under the vault's key, and so vouches for the public fields a store
   * carries forward from it; false for a record altered in storage, whose fields nothing vouches
   * for. What it holds is dropped unread: a store compares nothing.
   */
  const recordOpens = async (unlockedKey: CryptoKey, standing: VaultProps, prev: Lockbox): Promise<boolean> => {
    try {
      await decipherLockbox(unlockedKey, standing, prev)
      return true
    } catch {
      // decipherLockbox refuses only as damaged_lockbox: a record that will not open.
      return false
    }
  }

  /**
   * Write `lockbox` over `expected`, as `storeBox()` does, retiring what stands under its boxlabel
   * first when `clearsFirst`. One attempt: a refusal is thrown as {@link refuseStaleStoreBox} says.
   * Work in hand, it may finish within a grace.
   */
  const writeOver = async (lockbox: Lockbox, expected: LockboxExpectation, clearsFirst: boolean): Promise<void> => {
    try {
      if (clearsFirst) { await refreshOnStale(vaultDB.retireBox(scope, lockbox.boxlabel, { vault_id: expected.vault_id }), 'storeBox') }
      await refreshOnStale(vaultDB.updateBox(scope, lockbox, expected), 'storeBox')
    } catch (err) {
      refuseStaleStoreBox(err)
    }
  }

  /**
   * Throw `err`, what a `storeBox()`'s write met, as its refusal. A refusal as stale that
   * {@link refreshOnStale} has caught this device up after becomes kind 'stale_write', saying
   * nothing was written and the vault now shows the lockbox as storage holds it, the adapter's
   * refusal its cause -- or kind 'vault_locked', when that catch-up relocked this device (a vault
   * reborn, or its ways in changed, elsewhere). Anything else, a catch-up that failed among it, is
   * thrown as it came.
   */
  const refuseStaleStoreBox = (err: unknown): never => {
    if (! isCaughtUpStale(err)) { throw err }
    keyInHand()
    throw new VaultError('stale_write', 'That lockbox was written or retired on another device or tab while this one was storing into it, so nothing was written. This device has caught up with storage, and the vault now shows the lockbox as storage holds it: call storeBox() again if this whisper should still replace what is there.', { cause: err })
  }

  /**
   * Throw kind 'created_elsewhere', for a first unlock whose passphrase `wrong` refused against the
   * vault another device created meanwhile. The vault props were taken up as storage handed them
   * back; this catches the rest of the snapshot up with storage (its lockboxes), so that it shows
   * the vault as that device made it, `locked`. A catch-up that fails is warned of, and the
   * snapshot says `syncing: false`; but for one refused as untrusted storage, thrown as it came.
   */
  const refuseCreatedElsewhere = async (wrong: VaultError): Promise<never> => {
    try {
      await refresh()
    } catch (err) {
      logger.warn('A catch-up with storage, after a vault was found created on another device, failed: what the vault shows may lag behind storage (syncing: false) until a read succeeds.', { call: 'unlock' }, asError(err))
      if (UntrustedStorageKinds.some((kind) => isVaultError(err, kind))) { throw err }
    }
    throw new VaultError('created_elsewhere', 'A vault was just created for this label on another device, with a different passphrase than the one you entered. Nothing was created on this device. Enter the passphrase you chose there to unlock it.', { cause: wrong })
  }

  const vault: Vault = {
    leaseMillis,

    getSnapshot: () => snapshot,

    hello,

    subscribe: (listener) => {
      if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    unlock: async (givenProof, unlockOpts) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      const wayinId = parseAim(unlockOpts)
      const started = await noteStart()
      await hello()
      // Sync with the backend first: the passphrase proves itself against the vault props as they
      // stand there now, not against a cached copy a retire or recreate may have outdated.
      await refresh()
      const unlocked = closed || shutSince(started.shutsThen) ? null : await settleUnlock(proof, wayinId)
      const tookUp = unlocked !== null && await takeUpVaultKey(unlocked, unlocked.standing, started, deadlineFor(proof, 'unlock'))
      bump()
      if (tookUp) { return }
      // A close() meanwhile is said as such: the handle, not the vault, is what refuses now.
      ensureOpen()
      throw new VaultError('vault_locked', 'The vault was locked or retired on this device, or its ways in changed on another, while this unlock was under way, and that wins: nothing was unlocked, and this device keeps no lease. Unlock again to carry on.')
    },

    // Neither lock waits for hello(): a lock wins at once, storage reachable or not, and a lease
    // being taken up meanwhile is not taken up.
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
      // A soft lock: no new operation starts, and this device forgets its lease now,
      // but work in hand finishes -- an unlock or a change under way, here or in another tab,
      // among it -- and the vaultKey waits for it. The gate closes by having no deadline at all,
      // not one at now, which a clock stepped back reopens.
      askPassphraseAt = null
      forgetsSoFar += 1
      bump()
      await deviceDB.eraseLease(scope)
    },

    changePassphrase: async (givenProof, newPassphrase, changeOpts) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      parsePassphrase(newPassphrase, 'changePassphrase')
      if (! newPassphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
      const wayinId = parseAim(changeOpts)
      // A passphrase proves the way in it opens, and that is the one it changes; a passkey proves
      // the user, and which passphrase to change is then the caller's to say (or the only one).
      const byPasskey = typeof proof !== 'string'
      await ensureStrongEnough(strengthTest, newPassphrase, scope)
      await reviseWayins(proof, byPasskey ? undefined : wayinId, {
        call:   'changePassphrase',
        // The passphrase's way in takes the new one, keeping its stamp: its id and label, and the
        // device and time that added it. Its vault_key_epoch is the vault props', whatever the
        // replaced wayin's: a passkey can mend a passphrase stored at another.
        revise: async (standing, proven) => {
          const replaced = passphraseToReplace(standing, byPasskey ? wayinId : proven.wayinId)
          const sealed = await sealFor(standing, newPassphrase, { ...replaced, vault_key_epoch: standing.vault_key_epoch }, proven)
          return standing.wayins.map((wayin) => (wayin === replaced ? sealed : wayin))
        },
      })
    },

    addPassphrase: async (givenProof, newPassphrase, labelling) => {
      ensureOpen()
      parsePassphrase(newPassphrase, 'addPassphrase')
      if (! newPassphrase.trim()) { throw new VaultError('wrong_passphrase', "A passphrase can't be empty or only spaces.") }
      const proof = parseProof(givenProof)
      const wayinlabel = parseWayinlabel(rules, labelling, 'addPassphrase')
      await ensureStrongEnough(strengthTest, newPassphrase, scope)
      const naming = { wayin_id: randomId(), wayinlabel }
      await reviseWayins(proof, undefined, {
        call:   'addPassphrase',
        check:  (standing) => { ensureRoomForWayin(standing, wayinlabel) },
        revise: async (standing, proven, deviceId) => [...standing.wayins, await sealFor(standing, newPassphrase, newStamp(standing, naming, deviceId), proven)],
      })
      return naming.wayin_id
    },

    addPasskey: async (givenProof, makePasskey, labelling) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      parsePasskeyMaker(makePasskey)
      const wayinlabel = parseWayinlabel(rules, labelling, 'addPasskey')
      const naming = { wayin_id: randomId(), wayinlabel }
      const added = await reviseWayins(proof, undefined, {
        call:   'addPasskey',
        check:  (standing) => { ensureRoomForWayin(standing, wayinlabel) },
        // The authenticator is asked only now, the proof proven: a refusal before leaves no passkey behind.
        revise: async (standing, proven, deviceId) => {
          const answered = await makePasskey()
          if (answered === null) { return null }
          const passkey = parseNewPasskey(answered)
          ensureNewCredential(standing, passkey)
          return [...standing.wayins, await Wayin.sealPasskey(passkey, scope, standing, newStamp(standing, naming, deviceId), proven.transientKey)]
        },
      })
      return added ? naming.wayin_id : null
    },

    retireWayin: async (givenProof, wayinId) => {
      ensureOpen()
      const proof = parseProof(givenProof)
      const doomedId = parseWayinId(wayinId)
      await reviseWayins(proof, undefined, {
        call:  'retireWayin',
        check: (standing) => {
          const doomed = standing.wayins.find((wayin) => wayin.wayin_id === doomedId)
          if (doomed === undefined) {
            throw Wayin.absentWayin()
          }
          const remaining = standing.wayins.filter((wayin) => wayin !== doomed)
          if (remaining.length === 0 || (doomed.wayinkind === 'passphrase' && remaining.every((wayin) => wayin.wayinkind !== 'passphrase'))) {
            throw new VaultError('last_wayin', "That is this vault's last passphrase, and a vault always keeps one: a passkey can be lost with its device, and every way in with it. Add another passphrase first, or retire the vault if that is what's meant.")
          }
        },
        // Any way in still standing is proof enough, the one going included.
        revise: (standing) => standing.wayins.filter((wayin) => wayin.wayin_id !== doomedId),
      })
    },

    storeBox: async (boxlabel, whisper, storeOpts) => {
      await hello()
      ensureUnlocked()
      // A name the check refuses is never written anew, even where a lockbox stored under other
      // checks stands under it: reading and retiring reach that one.
      const label = Names.check(rules, 'boxlabel', boxlabel)
      const givenSidecarJson = sidecarJsonOf(storeOpts)
      const checked = Whisper.safeParse(whisper)
      // The refusal never quotes its input: a whisper stays out of error messages.
      if (! checked.success) {
        throw new VaultError('bad_whisper', 'A whisper must be a JSON value: a string, number, boolean, array, or plain object. A bare null or undefined cannot be stored -- to empty a lockbox, retire it. (null inside an array or object is fine.)')
      }
      const whisperBytes = new TextEncoder().encode(stableJsonify(checked.data))
      ensureWhisperFits(whisperBytes, givenSidecarJson ?? EmptySidecarJson)
      const standing = await readBoxOrDamaged(label)
      // A damaged box is overwritten as a fresh store: nothing in it can be carried forward.
      const prev = standing === 'damaged' ? null : standing
      await ensureRoomFor(label, prev)
      // The key and the vault it belongs to, taken together after the last look at storage.
      const unlockedKey = keyInHand()
      const standingVaultProps = currentVaultProps()
      const { vault_id: vaultId, vault_key_epoch: vaultKeyEpoch } = standingVaultProps
      // Only a record that opens vouches for its public fields: one that will not, altered in
      // storage, is written over as a fresh lockbox is, keeping neither its sidecar nor its
      // registered_at, so a sidecar planted in storage is never sealed into a revision that reads clean.
      const vouched = prev !== null && await recordOpens(unlockedKey, standingVaultProps, prev) ? prev : null
      const sidecarJson = givenSidecarJson ?? vouched?.sidecar_json ?? EmptySidecarJson
      ensureWhisperFits(whisperBytes, sidecarJson)
      const revisionTok = randomId()
      const lockboxKey = await makeLockboxKey()
      const now = clockNow()
      // Lands only in the vault this whisper is sealed for, under the vaultKey that seals it, over
      // the revision just read -- for a damaged box, the one the listing names -- : a vault reborn
      // elsewhere, a vaultKey replaced, or a box written meanwhile by another device, refuses it.
      const overRevision = standing === 'damaged' ? listedRevisionOf(label) : prev?.revision_tok ?? null
      // Only a box the listing shows damaged and naming no revision is retired first: one the
      // listing does not show yet is written as over none, which storage refuses while it
      // stands, and the catch-up lists it with its revision for the next store.
      const clearsFirst = standing === 'damaged' && overRevision === null && isListedDamaged(label)
      const expected = { vault_id: vaultId, revision_tok: overRevision, vault_key_epoch: vaultKeyEpoch }
      const header: LockboxHeader = {
        boxlabel:               label,
        revision_tok:           revisionTok,
        vault_key_epoch:        vaultKeyEpoch,
        whisper_codec:          'json_v1',
        whisper_schema_version: 1,
        sidecar_json:           sidecarJson,
        registered_at:          vouched?.registered_at ?? now,
        written_at:             now,
      }
      const lockbox: Lockbox = {
        format:              LockboxFormat,
        ...header,
        lockbox_key_wrapped: await wrapKeyUnder(unlockedKey, lockboxKey, boxCtx(vaultId, header, 'lockbox_key_wrapped')),
        whisper_ciphered:    await cipherBytes(lockboxKey, whisperBytes, boxCtx(vaultId, header, 'whisper_ciphered')),
      }
      await writeOver(lockbox, expected, clearsFirst)
      await refresh()
    },

    readBox: async (boxlabel) => await openBox(boxlabel),

    useBox: async (boxlabel, callback) => {
      if (typeof callback !== 'function') { throw new VaultError('bad_option', 'use needs a callback function to hand the whisper to.') }
      const whisper = await openBox(boxlabel)
      return await callback(whisper)
    },

    retireBox: async (boxlabel) => {
      await hello()
      ensureUnlocked()
      const label = await checkStandingBoxlabel(boxlabel)
      keyInHand()
      // Lands only in the vault this device holds keys for, whatever revision of the box stands:
      // a vault retired and made anew elsewhere refuses it. That is its only expectation.
      try {
        await refreshOnStale(vaultDB.retireBox(scope, label, { vault_id: currentVaultProps().vault_id }), 'retireBox')
      } catch (err) {
        // Said as what happened to the box, once caught up; a catch-up that failed says so instead.
        if (! isCaughtUpStale(err)) { throw err }
        throw new VaultError('stale_write', "That lockbox could not be retired, because the vault it was in is gone: it was deleted, or deleted and made anew, on another device. Nothing was removed, and this device has caught up with storage. If the vault was made anew and the lockbox stands in it, unlock that vault and retire it there.", { cause: err })
      }
      await refresh()
    },

    retire: async () => {
      await hello()
      // A handle that has seen no vault looks first: "delete my vault" must not report success
      // over one standing. Otherwise only the vault this handle had read when called: one
      // retired and made anew since refuses, even if a background refresh brings it in while
      // this awaits.
      if (vaultProps === null) { await refresh() }
      const doomed = vaultProps
      await shut('retire')
      if (doomed !== null && doomed !== UnreadVaultProps) {
        await refreshOnStale(vaultDB.retireVault(scope, { vault_id: doomed.vault_id }), 'retire')
      }
      // This device forgets the vault it had seen, too: one made later under this scope is
      // another. It keeps the scope's lock generation, which the shut has just raised: an unlock
      // under way in another tab must not find it back where it began.
      const kept = await keptMark('retire')
      await deviceDB.writeMark(blankMark(kept?.lock_generation ?? 0))
      await refresh()
      forgetHello()
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
   * True for a refusal as stale that the catch-up after it has caught up with: what `storeBox()` and
   * `retireBox()` say as what happened to the lockbox. One whose catch-up failed says that instead.
   */
  const isCaughtUpStale = (err: unknown) => isVaultError(err, 'stale_write') && syncing

  /** One refresh after `refusal`, a write storage refused as stale; one that fails is said as {@link refreshOnStale} says. */
  const catchUp = async (refusal: VaultError, call: VaultCall) => {
    try {
      await refresh()
    } catch (err) {
      logger.warn('A catch-up with storage, after a write it refused as stale, failed: what the vault shows may lag behind storage (syncing: false) until a read succeeds.', { call }, asError(err))
      if (UntrustedStorageKinds.some((kind) => isVaultError(err, kind))) { throw err }
      throw new VaultError('stale_write', `${refusal.message} Catching up with storage afterwards failed too, so what the vault shows may be behind it: this error's cause says why.`, { cause: err })
    }
  }

  // Watch the backend so lockboxes written elsewhere (another tab, the inspector's reset button)
  // show up without a manual refresh: by a hello, while none has succeeded or what it read no
  // longer stands, so a lease is taken up as the vault settles. A failing background read has
  // nobody to throw to, so it leaves the snapshot standing, saying `syncing: false` and its
  // trouble, and warns once for a failing streak; the next read that succeeds says so once.
  const watchRefresh = async () => {
    try {
      await (greeting === null ? hello() : refresh())
    } catch (err) {
      if (watchWarned) { return }
      watchWarned = true
      logger.warn('Storage rang with a change the vault could not read, so what it shows may lag behind storage (syncing: false). It says nothing more of this until a read succeeds; its next call meets the same trouble, and throws it.', { call: 'refresh' }, asError(err))
    }
  }
  const unsubscribeDB = vaultDB.subscribe(scope, () => { void watchRefresh() })

  // The first hello, started here so the handle settles unasked. Its refusal is the snapshot's
  // trouble, and the logger's to tell: never an unhandled rejection. A handle closed meanwhile has
  // nobody left to tell.
  void hello().catch((err: unknown) => {
    if (closed) { return }
    logger.warn("The vault could not read what storage and this device hold of it, so it is still opening: its snapshot's trouble says why. Call vault.hello() to try again; any other call on the vault tries again first.", { call: 'hello' }, asError(err))
  })
  return vault
}

/**
 * The vault's maker, beside the `Vault` type its handles have: `Vault.make(opts)` makes one, which
 * then says `hello()` to storage of itself. See {@link make}.
 *
 * @example const vault = Vault.make({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
 */
export const Vault = { make }

/** What {@link retireDamagedVault} needs of Vault.make's options: which vault, and the two stores it lives in. */
export type RetireDamagedVaultOpts = Pick<MakeVaultOpts, 'applabel' | 'userId' | 'vaultlabel' | 'vaultDB' | 'deviceDB' | 'validators'>

/**
 * Retire a vault whose `hello()` refuses it as `damaged_vault`, and only that: its stored vault props
 * and every lockbox, through the VaultDB, and this device's lease of it and its device mark,
 * through the DeviceDB -- what `retire()` does for a vault that opens, and nothing else. Vault
 * props that fail their checks cannot be opened, so no handle exists to `retire()`; this is the
 * way to clear them and start over. Whatever the vault held is gone for good, so ask the user first.
 *
 * It takes the options `Vault.make` took, and refuses a vault that is sound: kind 'bad_option' and
 * nothing removed, since a vault that opens is retired with its handle's `retire()`, which takes
 * the care of a handle that has seen the vault it deletes. With no vault stored it erases only the
 * device's lease and mark, so a call that was cut short can be made again. Kind 'damaged_vault'
 * when the record is too damaged to say which vault it is, which only the backend's own tools can
 * clear; 'stale_write' when the vault was replaced elsewhere meanwhile. Other refusals are
 * storage's: 'storage_unavailable', 'identity_revoked', 'not_permitted'. The device store failing
 * after the vault is retired is 'storage_unavailable' too, saying what failed: call again to finish
 * clearing the device -- or 'storage_blocked', which calling again cannot mend until the
 * browser lets the device keep its storage. Misuse is refused before
 * storage is touched, as `Vault.make` does: 'bad_label' for a label that fails its check, and
 * 'bad_option' for an option missing.
 *
 * A record this version cannot read may be one a newer safebyok wrote and opens, so a `format`,
 * wayinkind or number of wayins it does not know is refused too, as 'newer_format', with
 * nothing removed and a message to update the app, as `hello()` refuses it: any change to what a stored record may hold --
 * a field, a shape, or a range a check accepts -- bumps `format`, so that newer can be told from
 * damaged. There is no handle to lock, so a storage refusal such as 'identity_revoked' is thrown
 * as it comes, with no lock to make.
 *
 * @example
 *   const vault = Vault.make(opts)
 *   try { await vault.hello() } catch (err) {
 *     if (isVaultError(err, 'damaged_vault') && userConfirmedStartingOver()) { await retireDamagedVault(opts); await vault.hello() }
 *   }
 */
export const retireDamagedVault = async (opts: RetireDamagedVaultOpts): Promise<void> => {
  if (! isBag(opts)) { throw new VaultError('bad_option', 'retireDamagedVault takes one bag of options: applabel, userId, vaultlabel, vaultDB and deviceDB, as Vault.make did.') }
  const rules = Names.rulesOf(opts.validators)
  const scope = Names.checkScope(rules, { applabel: opts.applabel, user_id: opts.userId, vaultlabel: opts.vaultlabel })
  const vaultDB = parseVaultDB(opts.vaultDB)
  if (typeof vaultDB.retireDamagedVault !== 'function') {
    throw new VaultError('bad_option', "vaultDB has no retireDamagedVault: a storage adapter that hands each call on to another's must hand this one on too.")
  }
  const deviceDB = deviceTroubleAsConditions(parseDeviceDB(opts.deviceDB))
  // The vault first: a sound one refuses, and then the device keeps what it remembers of it. A
  // retry after a failure here finds the vault gone, and still clears the device.
  await vaultDB.retireDamagedVault(scope)
  await deviceDB.eraseLease(scope)
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
 * that holds until something outside the app changes (`Refusals.isStorageBlocked`), which a host
 * shows without offering a retry, and 'storage_unavailable' for any other, which it shows in
 * place and offers to retry. A VaultError passes as it came. What a vault and
 * `retireDamagedVault` call the device store through; not exported from the package.
 *
 * @param deviceDB - The device store a host handed in.
 * @returns The same verbs, each failure said as a condition.
 *
 * @example await deviceTroubleAsConditions(deviceDB).readMark(scope)  // a failing IndexedDB: 'storage_unavailable', "...failed reading its mark of this vault..."
 * @example await deviceTroubleAsConditions(deviceDB).readMark(scope)  // site data blocked (a SecurityError): 'storage_blocked', "...will not help until that changes..."
 */
export const deviceTroubleAsConditions = (deviceDB: DeviceDB): DeviceDB => ({
  readLease:  async (...args) => await asCondition('readLease', () => deviceDB.readLease(...args)),
  writeLease: async (...args) => { await asCondition('writeLease', () => deviceDB.writeLease(...args)) },
  eraseLease: async (...args) => { await asCondition('eraseLease', () => deviceDB.eraseLease(...args)) },
  readMark:   async (...args) => await asCondition('readMark', () => deviceDB.readMark(...args)),
  writeMark:  async (...args) => { await asCondition('writeMark', () => deviceDB.writeMark(...args)) },
  eraseMark:  async (...args) => { await asCondition('eraseMark', () => deviceDB.eraseMark(...args)) },
  eraseAll:   async (...args) => { await asCondition('eraseAll', () => deviceDB.eraseAll(...args)) },
})

/**
 * What failed, for each device-store verb, and what it leaves undone: the heart of the message a
 * failure of that verb is said with; and, where there is one, what the user may do instead of
 * trying again, which holds whether a retry may mend it or not. None names a scope or quotes a
 * record.
 */
const DeviceTroubleSaid: Record<keyof DeviceDB, { failed: string, instead?: string }> = {
  readLease:  { failed: "reading the lease it keeps for this vault, so the vault could not take it up", instead: "unlock with a passphrase or passkey" },
  writeLease: { failed: "writing the lease it keeps for this vault, so this device may ask for the passphrase again at the next open" },
  eraseLease: { failed: "erasing the lease it keeps for this vault, so the next vault made on this device, as at the next page load, may still take it up" },
  readMark:   { failed: "reading its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so the vault could not check storage against it" },
  writeMark:  { failed: "writing its mark of this vault (the newest copy of the vault it has seen, and how often it has locked), so it may not be kept" },
  eraseMark:  { failed: "erasing its mark of this vault, so it still holds the newest copy of the vault it had seen" },
  eraseAll:   { failed: "erasing everything it keeps for safebyok, so some of it may remain" },
}

/** What `call` to the device store's `verb` resolves to, or its failure, as {@link deviceTroubleAsConditions} says it. */
const asCondition = async <ResultT>(verb: keyof DeviceDB, call: () => Promise<ResultT>): Promise<ResultT> => {
  try {
    return await call()
  } catch (err) {
    if (isVaultError(err)) { throw err }
    const { failed, instead } = DeviceTroubleSaid[verb]
    if (isStorageBlocked(err)) {
      const meanwhile = instead === undefined ? '' : `: ${instead} instead`
      throw new VaultError('storage_blocked', `This browser does not let the app keep anything on this device -- storage blocked for this site, a private window or frame that withholds it, or no room left -- so it failed ${failed}. Trying again will not help until that changes${meanwhile}. The device store's error is this error's cause.`, { cause: err })
    }
    const retry = instead === undefined ? 'try again' : `try again, or ${instead}`
    throw new VaultError('storage_unavailable', `This device's own storage failed ${failed}: ${retry}. If it fails every time, this device may not let the app keep anything: storage blocked or full, or a private window. The device store's error is this error's cause.`, { cause: err })
  }
}

const damagedVaultProps = (opts: ErrorOptions) => new VaultError('damaged_vault', "This vault's stored record is damaged, so no passphrase or passkey can be tried against it, and it can't be opened. It was left as it is: the app's support may be able to restore it.", opts)

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
const damagedLockbox = (opts: ErrorOptions) => new VaultError('damaged_lockbox', "That lockbox is stored damaged, so it can't be read. It was left as it is; retire it, or store its whisper again over it.", opts)

const lockedError = () => new VaultError('vault_locked', 'The vault is locked: ask the user for their passphrase and call unlock().')

const closedError = () => new VaultError('vault_closed', 'This vault handle was closed: make another with Vault.make.')

/**
 * A proof as a host hands one in, checked: a blank passphrase is refused at once, as it could open
 * nothing and trying would cost a derivation per way in; a passkey's answer of the wrong shape is
 * misuse.
 */
const parseProof = (candidate: Proof): Proof => {
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

/** A new passkey's answer, checked: its salt must be a fresh one of {@link PasskeySaltBytes}, as its wayin will keep. */
const parseNewPasskey = (candidate: PasskeyProof): PasskeyProof => {
  const passkey = parsePasskey(candidate)
  if (Wayin.saltBytesOf(passkey.prfSaltB64)?.length !== PasskeySaltBytes) {
    throw new VaultError('bad_option', `A new passkey answers over a fresh salt of ${String(PasskeySaltBytes)} random bytes, as base64url text: safebyok-react's createPasskey mints one.`)
  }
  return passkey
}

/**
 * True when `box` lists as damaged already, or stands under a vaultKey `standing` holds: its own,
 * or the prior one. A lockbox under any other epoch opens under no key the vault holds.
 */
const isUnderHeldKey = (box: LockboxSummary | DamagedLockbox, standing: VaultProps): boolean => (
  box.damaged || box.vault_key_epoch === standing.vault_key_epoch || box.vault_key_epoch === standing.prior_vault_key?.vault_key_epoch
)

/** `box`, a lockbox listed sound, as damaged: under its boxlabel and revision, nothing else of it trusted. */
const asDamaged = (box: LockboxSummary | DamagedLockbox): DamagedLockbox => ({ boxlabel: box.boxlabel, damaged: true, revision_tok: box.revision_tok })

/** What an unlock notes as it starts: this handle's shut count, and the device mark's lock generation. */
type UnlockStart = { shutsThen: number, lockGeneration: number }

/** A device mark that has seen a vault: what this handle holds beside the vault props in hand. */
type SeenMark = DeviceMark & { seen: SeenVault }

/** The device mark's format, as each mark carries it. */
const MarkFormat = 'safebyok-mark-v3'

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'make' | 'hello' | 'refresh' | 'expiry' | 'unlock' | 'lock' | 'lockSoon' | 'retire' | 'untrustedStorage'
  | 'changePassphrase' | 'addPassphrase' | 'addPasskey' | 'retireWayin' | 'storeBox' | 'retireBox' | 'readBox'

/** The `wayinlabel` of the way in a vault is created with, by its first `unlock()`. */
const FirstWayinlabel = 'passphrase'

/** The `vault_key_epoch` of a vault's first vaultKey, the one it is created with. */
const FirstVaultKeyEpoch = 1

/** The lockbox's format, as each record carries it and each of its ctxs begins. */
const LockboxFormat = 'safebyok-lockbox-v5'

/**
 * The refusals that say storage cannot be trusted as it stands, each asking the caller for
 * something a stale write does not -- the user to sign in again ('identity_revoked'; the vault has
 * locked), storage to be looked at ('rolled_back'; locked too), or the app to be updated
 * ('newer_format'). A write's catch-up with storage throws each as it came, never as
 * 'stale_write'; and each, whichever call met it, has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'rolled_back', 'newer_format'] as const satisfies readonly VaultErrorKind[]

/**
 * A lockbox's public header: every field of its record but its format, which leads each ctx,
 * and the two encrypted ones. All of it is bound into both.
 */
type LockboxHeader = Omit<Lockbox, 'format' | 'lockbox_key_wrapped' | 'whisper_ciphered'>

/** The JSON of an empty sidecar: what a lockbox given none holds. */
const EmptySidecarJson = '{}'

/** What `storeBox()`'s options may hold: a sidecar, which {@link sidecarJsonOf} checks, and nothing else. */
const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, "storeBox()'s only option is `sidecar`, the lockbox's own plain data: check its spelling, and leave out any other. A note is kept in the sidecar: { sidecar: { note } }.")

/**
 * The sidecar a `storeBox()` was handed, as the JSON a lockbox keeps, keys sorted; undefined when
 * it was handed none. Kind 'bad_option' for anything JSON cannot carry, quoting none of it, and
 * for options beside it.
 */
const sidecarJsonOf = (storeOpts: { sidecar?: Sidecar | undefined } | undefined): string | undefined => {
  checkStoreOpts(storeOpts)
  if (storeOpts?.sidecar === undefined) { return undefined }
  const checked = Sidecar.safeParse(storeOpts.sidecar)
  if (! checked.success) {
    throw new VaultError('bad_option', "A lockbox's sidecar must be a JSON value: a string, number, boolean, null, array, or plain object, with nothing JSON cannot carry (undefined, a function, a Date) inside it.")
  }
  return stableJsonify(checked.data)
}

/** A wayin_id as a host hands one back: the id of one of the snapshot's `wayins`. */
const wayinIdShape = Z.string().check(Z.minLength(1))
/** The options that aim an `unlock()` or `changePassphrase()` at one way in. */
const aimShape = Z.optional(Z.object({ wayinId: Z.optional(wayinIdShape) }))

const parseAim = (candidate: { wayinId?: string | undefined } | undefined): string | undefined => {
  const checked = aimShape.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', "wayinId is the wayin_id of one of the snapshot's wayins, as text; leave it out to try every passphrase.")
  }
  return checked.data?.wayinId
}

/**
 * The passphrase wayin of `standing` that a change replaces: the one `wayinId` names, or --
 * given none, as when a passkey proves the change -- the vault's only passphrase.
 */
const passphraseToReplace = (standing: VaultProps, wayinId: string | undefined): PassphraseWayin => {
  const passphrases = standing.wayins.filter((wayin) => wayin.wayinkind === 'passphrase')
  if (wayinId !== undefined) {
    const named = passphrases.find((wayin) => wayin.wayin_id === wayinId)
    if (named !== undefined) { return named }
    throw new VaultError('absent_wayin', "None of this vault's passphrases has that wayin_id: it may have been removed on another device, or be a passkey's, which changePassphrase does not replace. Look again at the snapshot's wayins.")
  }
  const [only, ...others] = passphrases
  if (only === undefined) {
    throw new VaultError('absent_wayin', 'This vault has no passphrase to replace: add one with addPassphrase.')
  }
  if (others.length > 0) {
    throw new VaultError('bad_option', "This vault has several passphrases, and a passkey does not say which to replace: pass the wayin_id of one of the snapshot's wayins as opts.wayinId.")
  }
  return only
}

const parseWayinId = (candidate: string): string => {
  const checked = wayinIdShape.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', "retireWayin names the way in to remove by its wayin_id, from the snapshot's wayins.")
  }
  return checked.data
}

/**
 * `opts.wayinlabel`, once it passes the vault's wayinlabel check: kind 'bad_label' otherwise.
 * Never empty, whatever the check admits, as a stored way in has a label.
 */
const parseWayinlabel = (rules: Names.NameRules, candidate: { wayinlabel: string } | undefined, call: 'addPassphrase' | 'addPasskey'): string => {
  const wayinlabel: unknown = candidate?.wayinlabel
  if (typeof wayinlabel !== 'string' || wayinlabel === '') {
    throw new VaultError('bad_label', `${call} needs a wayinlabel, what the user calls this way in, as text that is not empty.`)
  }
  return Names.check(rules, 'wayinlabel', wayinlabel)
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

const anyOpt = Z.optional(Z.unknown())

/**
 * Every option Vault.make takes, each checked by a parse of its own: this check refuses any other.
 * An option quietly ignored could leave the vault less safe than the host asked -- a lease setting
 * under its retired name would leave the default seven days -- so a misspelt option, or one this
 * version no longer takes, is refused instead.
 */
const makeVaultOptsShape = Z.strictObject({
  applabel:               anyOpt,
  userId:                 anyOpt,
  vaultlabel:             anyOpt,
  vaultDB:                anyOpt,
  deviceDB:               anyOpt,
  keyDeriver:             anyOpt,
  leaseHours:             anyOpt,
  clock:                  anyOpt,
  maxWhisperBytes:        anyOpt,
  maxLockboxes:           anyOpt,
  logger:                 anyOpt,
  validators:             anyOpt,
  passphraseStrengthTest: anyOpt,
} satisfies Record<keyof MakeVaultOpts, typeof anyOpt>)

/** Each option Vault.make once took under another name, and the name it takes now (VOCABULARY.md, *Old names*). */
const RenamedMakeVaultOpts: ReadonlyMap<string, keyof MakeVaultOpts> = new Map([
  ['forcePassphraseReentryHours', 'leaseHours'],
])

/**
 * Refuse a bag of options holding one Vault.make does not take, with kind 'bad_option', naming
 * each such option, and the name a renamed one goes by now. It quotes the bag's field names, the
 * host's own code, and never a value.
 */
const ensureKnownOpts = (opts: object) => {
  const checked = makeVaultOptsShape.safeParse(opts)
  if (checked.success) { return }
  const unknownCkeys = checked.error.issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : []))
  const named = unknownCkeys.map((ckey) => {
    const renamed = RenamedMakeVaultOpts.get(ckey)
    return renamed === undefined ? ckey : `${ckey} (called ${renamed} now)`
  })
  const takes = Object.keys(makeVaultOptsShape.def.shape).join(', ')
  throw new VaultError('bad_option', `Vault.make does not take ${named.length === 1 ? 'the option' : 'the options'} ${named.join(', ')}: check the spelling. It takes ${takes}, and refuses any other rather than quietly ignore it.`)
}

/**
 * What a VaultDB must carry: its public verbs, on an instance of the `VaultDB` base class, whose
 * verbs check every record and expectation an adapter's own code sees. Checked only: Vault.make
 * keeps the adapter.
 */
const vaultDBShape = Z.object({
  readVaultProps:          Z.custom(isFunction),
  fetchOrCreateVaultProps: Z.custom(isFunction),
  updateVaultProps:        Z.custom(isFunction),
  readBox:                 Z.custom(isFunction),
  listBoxes:               Z.custom(isFunction),
  updateBox:               Z.custom(isFunction),
  retireBox:               Z.custom(isFunction),
  retireVault:             Z.custom(isFunction),
  subscribe:               Z.custom(isFunction),
})

const parseVaultDB = (candidate: VaultDB): VaultDB => {
  if (! (candidate instanceof VaultDB) || ! vaultDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "vaultDB is not a VaultDB: pass a storage adapter, such as localVaultDB({ store }), idbVaultDB() from 'safebyok-indexeddb', or your backend's own, which extends the VaultDB class.")
  }
  return candidate
}

/** What a DeviceDB must carry. Checked only: Vault.make keeps the device store it was handed. */
const deviceDBShape = Z.object({
  readLease:  Z.custom(isFunction),
  writeLease: Z.custom(isFunction),
  eraseLease: Z.custom(isFunction),
  readMark:   Z.custom(isFunction),
  writeMark:  Z.custom(isFunction),
  eraseMark:  Z.custom(isFunction),
  eraseAll:   Z.custom(isFunction),
})

const parseDeviceDB = (candidate: DeviceDB): DeviceDB => {
  if (! deviceDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "deviceDB is not a DeviceDB: in a browser, spread browserOpts() from 'safebyok/browser' into Vault.make's options; elsewhere, pass memoryDeviceDB().")
  }
  return candidate
}

/**
 * How many bytes of storage a vault reserves for each byte of whisper and sidecar: two.
 * Stored, a whisper's ciphertext is base64, a third larger than the whisper, and a sidecar's JSON,
 * written as text inside its record, at most twice its own (each quote and backslash escaped);
 * the rest is room for each backend's own way of counting bytes. So one whisper and its sidecar may
 * claim at most half of an adapter's `maxRecordBytes`.
 */
export const StoredBytesPerWhisperByte = 2

/**
 * The room Vault.make plans for a lockbox's stored fields besides its whisper and sidecar, in
 * bytes of their JSON, when it checks that `maxLockboxes` lockboxes fit the storage's
 * `maxVaultBytes`: its format, boxlabel, revision, codec, times, wrapped lockboxKey, the cipherIv
 * and tag of its whisperCiphered, and the scope a backend files it under. Under the default
 * validators, at their largest -- a forty-character boxlabel, applabel and vaultlabel and a
 * user_id of 100, each unit at three UTF-8 bytes -- they take under 1000. A host's validators may
 * admit longer names, so each store also weighs its lockbox as it is ({@link LockboxFixedBytes});
 * this is only the plan.
 */
export const LockboxFieldsBytes = 1024

/**
 * Room for the stored fields every lockbox has at the same size, in bytes of their JSON: its
 * format, revision, codec, times, wrapped lockboxKey, and the cipherIv and tag of its
 * whisperCiphered, with every field's name. A store weighs a lockbox as this, its whisper and
 * sidecar's room, and its scope and boxlabel as measured.
 */
export const LockboxFixedBytes = 512

const maxWhisperBytes = Z._default(Z.int().check(Z.positive()), MaxWhisperBytes)
const maxLockboxes = Z.optional(Z.int().check(Z.positive()))
/**
 * The largest limit in bytes the vault keeps. An adapter's `Infinity`, its way of saying it sets
 * no limit, becomes this as Vault.make reads it: past that read, no limit is infinite.
 */
const UnlimitedBytes = Number.MAX_SAFE_INTEGER

/** A limit as an adapter declares one, some bytes or `Infinity` for none, to the finite form the vault keeps. */
const someBytes = Z.union([Z.number().check(Z.positive()), Z.literal(Infinity)])
const bytesKept = Z.transform((bytes: number) => Math.min(bytes, UnlimitedBytes))
const byteLimit = Z.number().check(Z.positive(), Z.lte(UnlimitedBytes))
const declaredBytes = Z.pipe(Z.pipe(someBytes, bytesKept), byteLimit)

/**
 * The most lockboxes the vault keeps as a limit. An adapter's `Infinity`, its way of saying it
 * counts none, becomes this as Vault.make reads it: past that read, no limit is infinite.
 */
const UnlimitedLockboxes = Number.MAX_SAFE_INTEGER

/** A count of lockboxes as an adapter declares one, a whole number or `Infinity` for none, to the finite form the vault keeps. */
const someLockboxes = Z.union([Z.int().check(Z.positive()), Z.literal(Infinity)])
const declaredLockboxes = Z.pipe(someLockboxes, Z.transform((count: number) => Math.min(count, UnlimitedLockboxes)))

/** How Vault.make reads each limit an adapter declares. */
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
 * Hours, as the host thinks of them, to whole milliseconds, as every time inside is kept: a lease
 * one timer can reach ({@link MaxLeaseHours} at most), or `Infinity`, which becomes
 * {@link ForeverMillis}.
 */
const someHours = Z.union([Z.number().check(Z.positive(), Z.lte(MaxLeaseHours)), Z.literal(Infinity)])
const leaseHoursOrDefault = Z._default(someHours, LeaseHours)
const hoursToMillis = Z.transform((hours: number) => (hours === Infinity ? ForeverMillis : Math.round(hours * HourMillis)))
const someMillis = Z.number().check(Z.gte(1))
const leaseHoursAsMillis = Z.pipe(Z.pipe(leaseHoursOrDefault, hoursToMillis), someMillis)

/** The deadline for a lease granted at `nowMillis`: `leaseMillis` later, in whole ms, but never past {@link FarFuture}. */
const deadlineAfter = (nowMillis: number, leaseMillis: number): number => Math.min(Math.floor(nowMillis + leaseMillis), FarFuture)

const parseLeaseHours = (candidate: number | undefined): number => {
  const checked = leaseHoursAsMillis.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `leaseHours is a number of hours greater than zero and at most ${String(MaxLeaseHours)} (24.5 days), fractions too (0.25 is fifteen minutes), or Infinity for never: until lock(). A longer finite lease is refused, as no timer reaches past it.`)
  }
  return checked.data
}

/** What a Clock must carry. Checked only: Vault.make keeps the clock it was handed, and checks each reading. */
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
    throw new VaultError('bad_option', "The clock passed to Vault.make threw when read: its now() must return epoch milliseconds, as Date.now() does. The clock's own error is this error's cause.", { cause: err })
  }
  const checked = clockReading.safeParse(reading)
  if (! checked.success) {
    throw new VaultError('bad_option', "The clock passed to Vault.make read a time outside 1981 to 2255: its now() must return epoch milliseconds, as Date.now() does, not seconds or microseconds.")
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

/** What a KeyDeriver must carry. Checked only: Vault.make keeps the deriver it was handed, prototype and all. */
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
    throw new VaultError('bad_option', "Vault.make needs a keyDeriver: in a browser, spread browserOpts() from 'safebyok/browser' into its options.")
  }
  if (! keyDeriverShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'keyDeriver is not a KeyDeriver: it needs a key_deriver_label, a salt_bytes from 1 to 65536 and a deriveKeyBytes function.')
  }
  // A deriver declaring Argon2id must be one Argon2id can run: its refusal here, with a kind, is
  // the one it would otherwise make at the first unlock, as a plain Error from the library.
  if (candidate.algorithm === 'argon2id') { parseKeyDeriverSpec(candidate as KeyDeriverSpec) }
  ensureSuppliedSpecKept(candidate)
  if (candidate.key_deriver_label.startsWith(TestLabelPrefix)) {
    logger.warn(TestDeriverNotice, { call: 'make' })
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
 * or a vault too large for it to hold, list and retire whole.
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
