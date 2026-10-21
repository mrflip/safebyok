import * as Z from 'zod/mini'
import { isPlainBag, type Capacity, type Clock, type VaultScope, BoxSummary, type DamagedBox, type PasskeyWayinSummary, type PassphraseWayinSummary, type PasskeyAnswer, Whisper, Sidecar, VaultProps, DeviceMark, MinuteMillis, FarFuture, FarPast } from './types'
import { Box, type BoxRecord, EmptySidecarJson, checkedBoxRecord, checkedSidecar, heldListing, planSeal, sealPlanned, whisperBytesOf } from './box'
import * as Names from './names'
import { optionsCheck } from './options'
import { VaultError, isVaultError, type RefusalKind } from './errors'
import { type Outcome, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { makeVaultKey, randomId } from './crypto'
import { Wayin, checkFreshSalt, frozenRecord, type PasskeyWayin, type PassphraseWayin, type WayinStamp, type VaultKeyPair } from './wayin'
import { Proof, PassphraseProof, PasskeyProof } from './proof'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import { jsonBytes, type BoxExpectation } from './vault-db'
import { type VaultLogger, asError } from './logger'
import * as RefusalPolicy from './refusal-policy'
import { type StrengthChecker, UnchosenCheckerSaid, UnchosenStrengthChecker, checkStrongEnough } from './passphrase-strength'
import { type BadNewsHandler, type MakeVaultOpts, parseMakeVaultOpts, parseRenewMinutes, parseStaleMinutes, readClock, StoredBytesPerWhisperByte, BoxFixedBytes } from './vault-opts'
import { reportToPlatform } from './report-error'
import { type DeviceDB, deviceTroubleAsConditions } from './device-db'
import type { KeyDeriver } from './key-deriver'
import { Lease } from './lease'
import { Ask, type AskWhy, type GetProof, type RaisedAsk, raiseAsk } from './ask'

// == [Public types]: VaultState, VaultSnapshot

/**
 * Where the vault stands, as the UI branches on it:
 *  * `opening`  -- no hello has read storage yet; show nothing yet. Also after a read refused
 *                  `rolled_back`, which forgets the vault props in hand: the snapshot's `trouble`
 *                  says so, until the host accepts the older copy (see the `Vault`'s doc)
 *  * `absent`   -- never created; the first proof, through getProof or unlock(), chooses its passphrase
 *  * `locked`   -- exists, summaries readable, whispers not; a proof opens it
 *  * `unlocked` -- whispers readable until askPassphraseAt or lock()
 */
export type VaultState = 'opening' | 'absent' | 'locked' | 'unlocked'

/**
 * The vault's picture, frozen: one plain object holding each field the vault shows, under the
 * same name and with the same value as the vault's own field, shaped for `useSyncExternalStore`.
 * It holds nothing an offline guess at a passphrase could start from: the ways in are their
 * summaries, never a passphrase's salt or a wrapped vaultKey (a passkey's shows its PRF salt,
 * which the authenticator is asked with), and the stored vault props are the vault's alone.
 * It is replaced, whole, whenever any field changes, and is otherwise the same object, so a render
 * from it re-runs only when something did change. Box summaries (labels and other visible fields,
 * no whispers) are present even while locked -- that is the point of leaving them unencrypted.
 */
export type VaultSnapshot = Readonly<{
  /** The scope's app: where the vault is found. Fixed for the vault's life. */
  applabel:        string
  /** The signed-in user the vault is found under, as Vault.make was given it. Fixed for the vault's life. */
  user_id:         string
  /** The vault's own label within the app. Fixed for the vault's life. */
  vaultlabel:      string
  /** The stored vault's id, minted when it was made; null until a read finds a vault. */
  vault_id:        string | null
  /** When the stored vault was made, in epoch milliseconds; null until a read finds a vault. */
  registered_at:   number | null
  /**
   * The stored vault's unlock epoch: up by one on every change to its ways in, which sends every
   * other device back to `locked`. Null until a read finds a vault.
   */
  unlock_epoch:    number | null
  /** Which vaultKey the stored vault's ways in wrap: 1, reserved; null until a read finds a vault. */
  vault_key_epoch: VaultProps['vault_key_epoch'] | null
  /**
   * The vault's passphrase, visible fields only ({@link PassphraseWayinSummary}): when it was set,
   * and from which device. Never its salt, never its wrap. Null until a read finds a vault. The
   * `summary` of the vault's own passphrase {@link Wayin}.
   */
  passphrase:      PassphraseWayinSummary | null
  /**
   * The vault's passkey, visible fields only ({@link PasskeyWayinSummary}), readable while locked,
   * so a host can offer it and ask its authenticator for an answer (`safebyok-react`'s
   * `askPasskey` takes it), and say which passkey a new one would replace. Null while the vault
   * has none, or until a read finds a vault.
   */
  passkey:         PasskeyWayinSummary | null
  /** Where the vault stands: see {@link VaultState}. `opening` until a hello has read storage. */
  state:           VaultState
  /**
   * Every box in the vault, sorted by boxlabel: a {@link BoxSummary} for each, or a
   * {@link DamagedBox} (`damaged: true`, its boxlabel and revision and nothing else) for one
   * whose stored record does not read back, or is sealed under a vaultKey the vault does not hold
   * -- which `delBox()` removes, and `putBox()` overwrites while it names its revision. The listing reads each record's shape and
   * never opens its ciphertext: ciphertext altered in storage shows only when it is read.
   */
  boxes:           readonly (BoxSummary | DamagedBox)[]
  /**
   * How much room the vault has, as this device reckons it from its last read: its boxes against
   * its `maxBoxes`, and the bytes they reserve -- each box room for a whisper and sidecar of
   * `maxWhisperBytes`, its fixed fields, and its names as they are -- against what its storage
   * holds of one vault. Storage checks again on every write, and its `vault_full` or
   * `box_too_large` is the truth: read this only to warn the user ahead of time.
   *
   * @example const { boxes } = vault.capacity; if (boxes.used >= boxes.max - 1) { warn('Your vault is nearly full.') }
   */
  capacity:        Readonly<{ boxes: Readonly<Capacity['boxes']>, bytes: Readonly<Capacity['bytes']> }>
  /**
   * Epoch ms from which the vault asks for the passphrase again, while unlocked; null otherwise.
   * `leaseHours` after a proof last unlocked the vault, by passphrase or passkey, or a passphrase
   * last proved a change to its ways in (see `Vault.unlock`); never later than {@link FarFuture}
   * (in 2255): with `Infinity` hours, a vault that asks again only after `lock()` reads as that
   * instant. Compare with `>= FarFuture - MinuteMillis`, never for equality.
   */
  askPassphraseAt: number | null
  /**
   * The latest bad news the vault has learned -- a refusal of the `bad_news` family, such as
   * `damaged_vault` or `rolled_back`, or a box a listing shows damaged (`damaged_box`, its
   * `meta.box_listed` the box), or a way in stored damaged (`damaged_wayin`, its
   * `meta.wayin_listed` the way in's summary) -- or, when the `onBadNews` handler threw as it was told, what it
   * threw, as kind 'bad_option' with the throw as its cause. Null until there is any, and again
   * once a read of storage finds nothing amiss. Conditions -- storage unreachable, a stale write --
   * are their caller's alone, and never land here: a hello refused reaches whoever called it.
   * A lock badge needs none of this: it renders from `state`.
   *
   * @example
   *   const { trouble } = vault.getSnapshot()
   *   if (trouble?.refusalkind === 'damaged_box') { offerToRemove(trouble.meta?.box_listed?.boxlabel) }
   */
  trouble:         VaultError | null
  /**
   * False when the vault's last read of storage failed -- a change pushed from storage it could
   * not read, or a catch-up after a write storage refused -- so what it shows may be behind
   * storage until a read succeeds; true otherwise. A UI may say "not syncing" while it is false.
   * The vault keeps working either way: every write still lands only where storage stands as
   * this device last read it.
   */
  syncing:         boolean
}>
// --

/**
 * What `vaultProps` holds before the backend's first answer arrives: distinct from null, which is
 * the backend's own answer ("no vault props: this vault was never created"). Symbol.for, not Symbol, so
 * the sentinel stays one value even when the ESM and CJS builds load side by side.
 */
const UnreadVaultProps = Symbol.for('safebyok.unread_vault_props')

/** The ways in of vault props, as the vault holds them: the passphrase's, and the passkey's or null. */
type HeldWayins = Readonly<{ passphrase: PassphraseWayin, passkey: PasskeyWayin | null }>

/**
 * A user's vault of boxes. All reading and writing of whispers goes through here. One instance
 * stands for one vault for as long as the app holds it: `Vault.make` returns it, touching nothing,
 * and its first `hello()` reads storage. Its fields -- `state`, `boxes`, `passkey`, `capacity`,
 * `trouble` and the rest -- are live and read-only: read `vault.state` in an event handler and it
 * is current. A UI renders from `getSnapshot()`, the same fields frozen in one object, and
 * re-renders on `subscribe()`.
 *
 * Operations that touch a whisper -- `putBox`, `getBox`, `useBox`, `delBox` -- need the vault
 * unlocked, and go through `ensureLease()` for it: a vault that is not asks the host's `getProof`
 * (Vault.make's option) for a proof, one prompt at a time, and refuses with kind 'vault_locked'
 * when it is declined, or when there is no `getProof` to ask. Nothing prompts on open.
 *
 * This device keeps a mark of the newest copy of the vault props it has seen (a device mark, in
 * the deviceDB, which `lock()` leaves and `del()` empties). A call that reads the vault props
 * afresh -- `hello()`, `unlock()`, a change to the ways in, a store that catches up with storage, a
 * background refresh -- refuses an older copy of that same vault, one at a lower unlock epoch or
 * vaultKey epoch than this device has seen, with kind 'rolled_back', taking nothing from it and
 * writing nothing: storage handing back older vault props could otherwise bring back a way in
 * that was removed. Storage so little to be trusted locks the vault, as `lock()` does, as a storage
 * refusal of kind 'identity_revoked' does. A host that knows its storage was restored from an
 * older copy on purpose accepts it on this device by erasing the device's mark of the vault
 * (`valOf(await deviceDB.delMark(scope))`, which throws should the erase fail) and calling
 * `hello()` again: a handle refused as 'rolled_back' holds no vault props until then, its state
 * `opening`. A handle that goes on refusing changes to the ways in as 'stale_write' after a restore
 * -- as one may whose device mark could not be written -- is to be closed, and a new one opened.
 *
 * Storage alone settles a race. When it refuses a write as stale, or a box will not open, the
 * vault catches up with storage once before it names the refusal: a vault deleted and made
 * anew, or its ways in changed, elsewhere relocks this device. A catch-up that fails leaves the
 * snapshot saying `syncing: false` until a read succeeds; a write whose catch-up fails throws
 * 'stale_write', the catch-up's failure its cause -- unless that failure is 'identity_revoked',
 * 'rolled_back' or 'newer_format', which the write throws as it came.
 *
 * Every call comes in two forms. `tryUnlock()`, `tryPutBox()` and the rest resolve to an
 * {@link Outcome}: `{ ok: true, val }`, or `{ ok: false, err }` with the refusal as `err`, never
 * thrown -- the form for code that branches on `refusalkind`. `unlock()`, `putBox()` and the rest
 * resolve to that `val` or throw that `err`, the same VaultError -- the form for code that reports
 * failure by throwing, as a TanStack `queryFn` does. Where a call's own doc says it throws or
 * refuses with a kind, its `try` form resolves that refusal as `err`. Bad news is told to
 * `onBadNews` once, whichever form met it. A throw that is no refusal -- a bug, in safebyok or in a
 * function handed to it -- is kind 'unexpected_error' (misuse), what was thrown its cause, and is
 * never logged. `subscribe()`, which answers at once with its unsubscribe, and `Vault.make`
 * throw their misuse; `getWhisper()` and `useBox()` come in the throwing form alone.
 *
 * Every method is bound to its vault, so each may be handed on alone: to `useSyncExternalStore`,
 * as an event handler, or taken out of the vault by name. `hello` and `ensureLease`, which take
 * options, refuse the event a handler is handed: wrap them, `() => { void vault.tryHello() }`.
 *
 * @example const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
 * @example if (vault.state === 'locked') { askForProof(vault.passkey) }
 * @example
 *   const { unlock, getBox } = vault
 *   await unlock(passphrase)
 *   const whisper = await getBox('anthropic_api_key')
 * @example
 *   const { ok, err } = await vault.tryUnlock(passphrase)
 *   if (! ok && err.refusalkind === 'wrong_passphrase') { askAgain(err.message) }
 */
export class Vault {
  // == [Vault: fields]: applabel, user_id, vaultlabel, vault_id, registered_at, unlock_epoch, vault_key_epoch, passphrase, passkey, state, boxes, capacity, askPassphraseAt, trouble, syncing, snapshot, getSnapshot, subscribe, leaseMillis, logger, clock, keyDeriver

  // Each field reads the snapshot `#settle()` last published, so the fields and the snapshot always
  // agree. A getter with no setter: a host cannot write over one, and the vault never reads one back:
  // nor do its boxes, which read only the scope, fixed for the handle's life, and take the vault
  // props they lie under from the vault at each call.

  /** The scope's app: where the vault is found. Fixed for the handle's life. */
  get applabel(): string { return this.#snapshot.applabel }
  /** The signed-in user the vault is found under. Fixed for the handle's life. */
  get user_id(): string { return this.#snapshot.user_id }
  /** The vault's own label within the app. Fixed for the handle's life. */
  get vaultlabel(): string { return this.#snapshot.vaultlabel }
  /** The stored vault's id; null until a read finds a vault. See {@link VaultSnapshot}. */
  get vault_id(): string | null { return this.#snapshot.vault_id }
  /** When the stored vault was made, in epoch milliseconds; null until a read finds a vault. */
  get registered_at(): number | null { return this.#snapshot.registered_at }
  /** Up by one on every change to the ways in, which sends every other device back to `locked`; null until a read finds a vault. */
  get unlock_epoch(): number | null { return this.#snapshot.unlock_epoch }
  /** Which vaultKey the ways in wrap: 1, reserved; null until a read finds a vault. */
  get vault_key_epoch(): VaultProps['vault_key_epoch'] | null { return this.#snapshot.vault_key_epoch }
  /** The vault's passphrase, its summary: no salt, no wrapped vaultKey; null until a read finds a vault. See {@link VaultSnapshot}. */
  get passphrase(): PassphraseWayinSummary | null { return this.#snapshot.passphrase }
  /** The vault's passkey, its summary: no wrapped vaultKey; null while it has none. See {@link VaultSnapshot}. */
  get passkey(): PasskeyWayinSummary | null { return this.#snapshot.passkey }
  /** Where the vault stands: `opening` until a hello has read storage, then `absent`, `locked` or `unlocked`. */
  get state(): VaultState { return this.#snapshot.state }
  /** Every box, sound or damaged, sorted by boxlabel, no whisper among them. See {@link VaultSnapshot}. */
  get boxes(): readonly (BoxSummary | DamagedBox)[] { return this.#snapshot.boxes }
  /** How much room the vault has, as this device reckons it from its last read. See {@link VaultSnapshot}. */
  get capacity(): VaultSnapshot['capacity'] { return this.#snapshot.capacity }
  /** When this device's lease ends, while unlocked; null otherwise. See {@link VaultSnapshot}. */
  get askPassphraseAt(): number | null { return this.#snapshot.askPassphraseAt }
  /** The latest bad news, or what the `onBadNews` handler threw; null when there is none. See {@link VaultSnapshot}. */
  get trouble(): VaultError | null { return this.#snapshot.trouble }
  /** False while the vault's last read of storage failed. See {@link VaultSnapshot}. */
  get syncing(): boolean { return this.#snapshot.syncing }
  /** Every field above, frozen in one plain object, replaced only when one of them changes. */
  get snapshot(): VaultSnapshot { return this.#snapshot }

  /** Current snapshot; same object until something changes (useSyncExternalStore-ready). */
  getSnapshot = (): VaultSnapshot => this.#snapshot
  /**
   * Calls `listener` after every snapshot change; returns the unsubscribe. Throws, at once, kind
   * 'bad_option' for a listener that is not a function: it answers at once, with the unsubscribe
   * `useSyncExternalStore` wants, and so has no `try` form.
   */
  subscribe = (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  /**
   * How long a lease lasts on this device, in whole milliseconds: the `leaseHours` the vault was
   * opened with, its default (168 hours) when none was given. A vault that stays unlocked until
   * `lock()` (`Infinity` hours) reads {@link ForeverMillis}. Fixed for the handle's life, so a UI
   * can say how long an unlock lasts without being told the option again.
   *
   * @example vault.leaseMillis >= ForeverMillis - MinuteMillis ? 'until you lock it' : `for ${String(Math.round(vault.leaseMillis / MinuteMillis))} minutes`
   */
  get leaseMillis(): number { return this.#leaseMillis }
  /** The logger the vault was made with, which the vault's boxes and ways in log through. */
  get logger(): VaultLogger { return this.#logger }
  /**
   * The vault's clock, checked: each reading is the host's clock's, held to epoch milliseconds,
   * and one that fails drops the vaultKey before it throws, as the vault's own readings do. The
   * vault's boxes stamp their times by it.
   */
  get clock(): Clock { return this.#checkedClock }
  /** The key deriver the vault was made with, which its ways in derive through. */
  get keyDeriver(): KeyDeriver { return this.#keyDeriver }
  // --

  // == [Vault: opening]: hello, ensureLease

  readonly #tryHello = this.#trying(async (given?: { staleMinutes?: number | undefined }): Promise<Vault> => {
    this.#checkOpen()
    const helloOpts = checkHelloOpts(checkBagOrNone(given, 'hello'))
    const staleMillis = helloOpts?.staleMinutes === undefined ? this.#staleMillis : parseStaleMinutes(helloOpts.staleMinutes, 'hello')
    await this.#helloWithin(staleMillis)
    return this
  })
  /**
   * {@link Vault.hello}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryHello = this.#tryHello
  /**
   * Read storage and settle the vault: one read of the vault props, their ways in and the box
   * listing, then this device's lease, taken up when it still fits and still opens, and the vault
   * settled from those into `absent`, `locked` or `unlocked`, its snapshot published -- never
   * prompting: asking for a passphrase is the host's job, and only when a whisper is actually
   * wanted. `Vault.make` reads nothing, so the first hello is the first read, and starts the
   * vault's watch on storage; every call on the vault but `lock()` and `close()` waits for a first
   * hello to succeed, starting one if none has, so a host that never calls it still gets a settled
   * vault. Resolves the vault itself, settled, in any of the three states.
   *
   * Calls under way share one read. Once a hello has read storage, a later one within
   * `opts.staleMinutes` of the vault's last read -- by default the `staleMinutes` the vault was
   * made with, five minutes unless it said otherwise -- reads nothing, and only settles the picture it
   * has (a lease run out shows as `locked`); `staleMinutes: 0` has it read. It reads afresh,
   * whatever the minutes, when what was read may no longer stand: a read of storage that failed,
   * storage the vault cannot trust (`identity_revoked`, `rolled_back`, `newer_format`), or the
   * vault deleted. A hello that fails may be called again at once. After `close()` it refuses with
   * kind 'vault_closed'; `opts` other than `staleMinutes`, or minutes that are not zero or more, are
   * kind 'bad_option'. So is anything in place of `opts` that is no plain bag of options: an
   * event, above all, when `hello` itself is handed to `addEventListener` or `onClick` as the
   * handler. Wrap it, as the fourth example does.
   *
   * It refuses with storage's own error -- storage unreachable (`storage_unavailable`), a user
   * storage does not serve (`not_permitted`, `identity_revoked`) -- and leaves the vault as it last
   * settled: `opening` while the vault props were never read, and `locked` for a first hello that
   * fails after them, as this device's store refusing its lease. Stored vault props that fail their
   * checks are kind 'damaged_vault', which no retry mends (`delDamagedVault` clears them); those a
   * newer safebyok may have written, kind 'newer_format': update the app; those older than this
   * device has already seen the vault at, kind 'rolled_back', which also revokes this device's lease
   * (see the `Vault`'s own doc). Each of those three is bad news, told to `onBadNews` before the
   * hello settles. A box the listing shows damaged fails nothing: it lists flagged, and is told.
   *
   * @example await vault.hello()   // vault.state: 'absent' | 'locked' | 'unlocked'
   * @example
   *   try { await vault.hello() } catch (err) {
   *     if (isVaultError(err, 'damaged_vault') && userConfirmedStartingOver()) { await delDamagedVault(opts) }
   *   }
   * @example document.addEventListener('visibilitychange', () => { if (! document.hidden) { void vault.tryHello() } })
   * @example window.addEventListener('focus', () => { void vault.tryHello() })   // never vault.hello itself: it refuses the event
   * @example await vault.hello({ staleMinutes: 0 })   // read now, whatever was read a moment ago
   */
  hello = this.#throwing(this.#tryHello)

  readonly #tryEnsureLease = this.#trying(async (given?: { renewMinutes?: number | undefined }): Promise<Vault> => {
    this.#checkOpen()
    const leaseOpts = checkEnsureLeaseOpts(checkBagOrNone(given, 'ensureLease'))
    return await this.#ensureLease(parseRenewMinutes(leaseOpts?.renewMinutes))
  })
  /**
   * {@link Vault.ensureLease}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryEnsureLease = this.#tryEnsureLease
  /**
   * Have the vault unlocked, asking for a proof only when it must: what every call that needs a
   * whisper goes through, so an app rarely calls it itself -- call it to unlock ahead of time, on a
   * button. It says `hello()` first, whose refusal is its own, as it came. Then, unlocked, with
   * the lease not ending within `opts.renewMinutes` minutes (0 by default), it resolves the vault at
   * once: no prompt, no write. Otherwise it hands an {@link Ask} to the `getProof` Vault.make was
   * given -- `why` `absent` (this proof makes the vault), `locked`, or `lease_ending` -- and waits
   * for its answer. One prompt at a time: a call that finds a prompt up waits on the same answer.
   * On `unlocked` it says hello again and resolves the vault; on `carry_on`, which only
   * `lease_ending` allows, it resolves the vault under the lease that stands.
   *
   * Refuses with kind 'vault_locked' when the answer is `declined`, when there is no `getProof`,
   * when a `lock()`, `close()` or `del()` lands while the prompt is up (every caller waiting on it
   * at once), or when the lease is gone by the time the answer comes. Kind 'bad_option' when
   * `getProof` answers `carry_on` outside `lease_ending`, or anything but the three, or for a
   * `renewMinutes` that is not zero or more minutes; 'unexpected_error' when it throws, what it
   * threw the cause, never logged. A wrong passphrase never reaches here: it goes to the dialog,
   * through `ask.attempt`. An event in place of `opts`, or anything else that is no plain bag of
   * options, is kind 'bad_option', as for `hello`: wrap it, as the second example does.
   *
   * @example await vault.ensureLease()   // unlocked, or refused 'vault_locked'
   * @example <button onClick={() => { void vault.tryEnsureLease() }}>Unlock</button>
   * @example await vault.ensureLease({ renewMinutes: 60 })   // ask now if the lease ends within the hour
   */
  ensureLease = this.#throwing(this.#tryEnsureLease)
  // --

  // == [Vault: locking]: unlock, lock

  readonly #tryUnlock = this.#trying((givenProof: string | PasskeyAnswer): Promise<void> => this.#unlockWith(givenProof))
  /**
   * {@link Vault.unlock}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryUnlock = this.#tryUnlock
  /**
   * Open the vault with its passphrase, granting this device a lease for `leaseHours`: the proof
   * an ask's `attempt` tries, called outside any prompt -- how an app with no `getProof` unlocks
   * once it has asked the user itself. On an
   * `absent` vault this first unlock creates it, with this passphrase as its way in -- once the
   * vault's `strengthChecker` passes it: kind 'weak_passphrase' otherwise, the checker's
   * reason its message, and nothing is created. A vault that stands is never refused its
   * passphrase for weakness. A wrong passphrase throws kind 'wrong_passphrase' and changes nothing
   * -- learned from the vaultKey wayin refusing to decrypt, never from a comparison: one key
   * derivation (with the browser's deriver, about half a second). A passphrase that is not text
   * is misuse: kind 'bad_option'.
   *
   * A passphrase stored in a form this package never writes is damaged, and not tried: kind
   * 'damaged_wayin'. A passphrase wayin altered in storage refuses its passphrase just as a typo
   * does, so 'wrong_passphrase' is all the vault can say of it; its message names both.
   *
   * The first unlock of an `absent` vault can lose a race: another device creates the vault
   * between this one's look at storage and its write. Storage then hands back that device's vault,
   * and the passphrase given must open it like any other. If it does, the unlock goes ahead. If it
   * does not, the refusal is kind 'created_elsewhere', not 'wrong_passphrase': nothing was
   * created here, the vault now shows `locked` as the other device made it, and the user is to
   * enter the passphrase chosen there.
   *
   * The lease lasts until `askPassphraseAt`, `leaseHours` from now: then the vaultKey is dropped
   * and the vault locks, work in hand or not, by a timer and at the next look alike. Every later
   * call in which the user types the passphrase and it proves -- `putWayin()` or `delWayin()` --
   * starts the lease again from then; nothing else moves it.
   *
   * A vault deleted, made anew, or with its ways in changed, here or on another device, while the
   * unlock is under way is not unlocked: the passphrase was proven against a vault that no longer
   * stands as it was. This device is granted no lease, and the call throws kind 'vault_locked'.
   * A vault the unlock was creating stays created, locked, under this passphrase. A `lock()`
   * called while the unlock is under way does not stop it: the unlock finishes, and the vault ends
   * unlocked, with a lease. A wrong passphrase is still told as 'wrong_passphrase'.
   *
   * `proof` may instead be a passkey's answer, a {@link PasskeyAnswer} (`safebyok-react`'s
   * `askPasskey` gets one): it opens the vault's passkey, with no key derivation to wait for, and
   * grants this device a lease for `leaseHours` as a passphrase does. It refuses with kind
   * 'absent_wayin' when the vault has no passkey, 'wrong_passkey' when the answer is another
   * credential's, or does not open the vault (its message saying that the way in may be damaged),
   * 'damaged_wayin' when its wayin is stored damaged, and 'absent_vault' on an `absent` vault: a
   * vault is created with a passphrase.
   *
   * @example await vault.unlock(passphrase)
   * @example await vault.unlock(passkey)  // from askPasskey(vault.getSnapshot().passkey)
   * @example
   *   try { await vault.unlock(passphrase) } catch (err) {
   *     if (isVaultError(err, 'created_elsewhere')) { showAdvice(err.message) }  // the vault now shows `locked`: ask again
   *   }
   */
  unlock = this.#throwing(this.#tryUnlock)

  // lock() does not wait for hello(): it locks at once, storage reachable or not.
  readonly #tryLock = this.#trying(async (): Promise<void> => {
    this.#checkOpen()
    this.#landLock()
    await this.#shutAndSay()
  })
  /**
   * {@link Vault.lock}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryLock = this.#tryLock
  /**
   * Forget the unlock, in memory and on this device: back to `locked`, at once. A `getBox()` or
   * `useBox()` whose read of storage is under way refuses with kind 'vault_locked' once storage
   * answers, handing back nothing, unless an unlock has put a key back in hand meanwhile. An
   * `unlock()` or `putWayin()` under way is not stopped: it finishes, and leaves the vault
   * unlocked. A prompt up for a proof is: every call waiting on it refuses with kind
   * 'vault_locked' at once, its ask's `lockLanded` settles so the dialog can close, and an
   * `attempt` under way, or tried after, takes nothing up and refuses 'vault_locked'. A write already sent to storage lands. Kind 'storage_unavailable' when this device's
   * store fails to erase its lease ('storage_blocked' when the browser withholds that store); the
   * vault is locked all the same.
   *
   * The vault also locks of itself: when the lease ends at `askPassphraseAt`, at `del()`, for
   * storage it cannot trust (a user signed out, an older copy of the vault), at a refresh that
   * finds the vault's ways in changed or the vault gone, and when its clock cannot be read.
   *
   * @example document.addEventListener('visibilitychange', () => { if (document.hidden) { void vault.lock() } })
   */
  lock = this.#throwing(this.#tryLock)
  // --

  // == [Vault: ways in]: putWayin, delWayin

  readonly #tryPutWayin = this.#trying(async (passphrase: string, newProof: string | PasskeyAnswer): Promise<Vault> => {
    this.#checkOpen()
    const proof = standingPassphraseOf(this, passphrase, 'putWayin')
    const putting = newProofOf(this, newProof)
    if (putting instanceof PassphraseProof) { await this.#checkStrongEnough(putting.passphrase, 'putWayin') }
    await this.#reviseWayins(proof, {
      call:   'putWayin',
      // The new way in is stamped afresh: this device, now. The other slot stands as it was.
      revise: async (standing, proven, deviceId) => {
        const { wayin } = await Wayin.seal(this, putting, standing, this.#newStamp(standing, deviceId), proven.transientKey)
        return wayin.wayinkind === 'passphrase' ? { passphrase: wayin.props, passkey: standing.passkey } : { passphrase: standing.passphrase, passkey: wayin.props }
      },
    })
    return this
  })
  /**
   * {@link Vault.putWayin}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryPutWayin = this.#tryPutWayin
  /**
   * Put a new way into the vault: a new passphrase replaces the passphrase; a passkey's answer
   * puts the vault's passkey, replacing the one it had, if any (the snapshot's `passkey` says
   * which, and when and from which device it was added, for a host to warn the user first).
   * `passphrase`, the vault's passphrase as it stands, proves the user may: only it proves a
   * change to the vault's ways in, never a passkey, as is done everywhere else. Boxes are
   * untouched -- their boxKeys stay wrapped under the unchanged vaultKey -- so this is cheap no
   * matter how many there are.
   *
   * A passkey is made before the call, and its answer handed in: `safebyok-react`'s
   * `createPasskey` makes one over a fresh salt, and the core never calls WebAuthn itself. The
   * passkey then unlocks the vault on any device where its authenticator can answer: the one it
   * was made on, or, for a passkey synced by the platform (iCloud Keychain, Google Password
   * Manager), any device signed in to that account; a security key, wherever it is plugged in.
   *
   * Works locked or unlocked, since the proof is proof enough, and leaves the vault unlocked, the
   * lease starting again from now. The vault props' unlockEpoch moves, so every other device's
   * unlock lapses, and each asks again at its next look. Once the change has landed in storage,
   * the call resolves: should this device then fail to keep its own records of it, the logger says
   * so, and the vault asks for the passphrase at its next open.
   *
   * Refuses, changing nothing: with kind 'bad_option' for a `passphrase` that is not text (a
   * passkey's answer among it), or a `newProof` that is neither text nor a passkey's answer over a
   * fresh salt of `PasskeySaltBytes` bytes; 'weak_passphrase' for a new passphrase the vault's
   * `strengthChecker` finds weak, or a blank one, before any key derivation, the checker's reason
   * its message; 'wrong_passphrase' for a `passphrase` that does not open the vault, or is blank;
   * 'damaged_wayin' when the vault's passphrase is stored damaged, so that nothing can prove a
   * change; 'absent_vault' before the vault is made; and 'stale_write' when another device changed
   * the vault between this device's look and its write (a passkey made for the call then stays on
   * its authenticator, a way into nothing: make another to try again).
   *
   * Replacing is not revoking: whoever holds the old passphrase or passkey, and kept a copy of the
   * vault props from before, can still open that copy, and the vaultKey inside it is the one the
   * vault still uses.
   *
   * @returns The vault, unlocked under its new way in.
   *
   * @example await vault.putWayin(passphrase, newPassphrase)   // the passphrase is replaced
   * @example
   *   const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } })
   *   if (answer !== null) { await vault.putWayin(passphrase, answer) }   // the vault's passkey, replacing any
   */
  putWayin = this.#throwing(this.#tryPutWayin)

  readonly #tryDelWayin = this.#trying(async (passphrase: string): Promise<Vault> => {
    this.#checkOpen()
    const proof = standingPassphraseOf(this, passphrase, 'delWayin')
    await this.#reviseWayins(proof, {
      call:   'delWayin',
      check:  (standing) => {
        if (standing.passkey === null) {
          throw new VaultError('absent_wayin', "This vault has no passkey to remove: it may have been removed on another device. Nothing was changed.")
        }
      },
      revise: (standing) => ({ passphrase: standing.passphrase, passkey: null }),
    })
    return this
  })
  /**
   * {@link Vault.delWayin}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryDelWayin = this.#tryDelWayin
  /**
   * Take away the vault's passkey. `passphrase`, the vault's passphrase as it stands, proves the
   * user may; the passphrase itself is never removed, as a vault always keeps it. Refuses with kind
   * 'absent_wayin' when the vault has no passkey, before any key derivation, and as `putWayin()`
   * does for the proof. Like `putWayin()`, it moves the unlockEpoch, so every other device locks
   * and must unlock again with the passphrase; it leaves this one unlocked, the lease starting
   * again from now.
   *
   * Removal is not revocation: whoever holds the removed passkey, and kept a copy of the vault as
   * it was, can still open that copy, and the vaultKey inside it is the one the vault still uses.
   * Removing the passkey stops it opening the vault from here on; it cannot take back what it
   * opened before.
   *
   * @returns The vault, unlocked, with no passkey.
   *
   * @example await vault.delWayin(passphrase)   // the passkey is gone
   */
  delWayin = this.#throwing(this.#tryDelWayin)
  // --

  // == [Vault: boxes]: putBox, getBox, useBox, openBox, delBox

  readonly #tryPutBox = this.#trying(async (boxlabel: string, whisper: Whisper, storeOpts?: { sidecar?: Sidecar | undefined }): Promise<void> => {
    this.#checkOpen()
    // A name the check refuses is never written anew, even where a box stored under other
    // checks stands under it: reading and deleting reach that one.
    const label = Names.check(this.#rules, 'boxlabel', boxlabel)
    const givenSidecarJson = sidecarJsonOf(storeOpts)
    // The refusal never quotes its input: a whisper stays out of error messages.
    const whisperBytes = whisperBytesOf(whisper)
    this.#checkWhisperFits(whisperBytes, givenSidecarJson ?? EmptySidecarJson)
    // Checked before the user is asked for anything: a call that cannot land never prompts.
    await this.#ensureLease(0)
    const standing = await this.#getBoxOrDamaged(label)
    // A store is one write, over a revision storage arbitrates. A box listed damaged naming none
    // could be cleared only by a delete before it, a second call another device's write could
    // fall between and be lost: the user deletes it, then stores.
    if (standing === 'damaged' && this.#isListedDamaged(label) && this.#listedRevisionOf(label) === null) { throw damagedBeyondNaming() }
    // A damaged box is overwritten as a fresh store: nothing in it can be carried forward.
    const prev = standing === 'damaged' ? null : standing
    await this.#checkRoomFor(label, prev)
    // The key and the vault it belongs to, taken together after the last look at storage.
    const unlockedKey = this.#checkUnlocked()
    // The vault props the box is sealed under are the ones its write names: one object, read once.
    const standingVaultProps = this.#currentVaultProps()
    const { vault_id: vaultId, vault_key_epoch: vaultKeyEpoch } = standingVaultProps
    // Lands only in the vault this whisper is sealed for, under the vaultKey that seals it, over
    // the revision just read -- for a damaged box, the one the listing names -- : a vault reborn
    // elsewhere, a vaultKey replaced, or a box written meanwhile by another device, refuses it.
    const overRevision = standing === 'damaged' ? this.#listedRevisionOf(label) : prev?.revision_tok ?? null
    // A damaged box the listing does not show yet is written as over none, which storage refuses
    // while it stands; the catch-up lists it, with its revision for the next store.
    const expected = { vault_id: vaultId, revision_tok: overRevision, vault_key_epoch: vaultKeyEpoch }
    // The sidecar a store keeps from the box it replaces, when none is given, counts toward the
    // limit too: known once the plan has vouched for that box, and weighed before any key is made.
    const plan = await planSeal(this, standingVaultProps, unlockedKey, { boxlabel: label, whisperBytes, sidecarJson: givenSidecarJson, over: prev })
    this.#checkWhisperFits(plan.whisperBytes, plan.sidecarJson)
    const box = await sealPlanned(this, standingVaultProps, unlockedKey, plan)
    await this.#writeOver(box, expected)
    await this.#refresh()
  })
  /**
   * {@link Vault.putBox}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryPutBox = this.#tryPutBox
  /**
   * Write a whisper into the box `boxlabel`, creating or replacing it. Needs the vault unlocked,
   * through `ensureLease()`, which asks `getProof` when it is not -- once the whisper, the
   * boxlabel and the sidecar have passed their checks, so a store that cannot land never prompts;
   * kind 'whisper_too_large' when its JSON and the box's sidecar's together are over the
   * vault's `maxWhisperBytes`, and kind 'vault_full' when `boxlabel` is new and the vault already
   * holds its `maxBoxes` -- delete one first. A sidecar left out, and so kept from the box,
   * counts toward `maxWhisperBytes` as one given does. Replacing a box is never refused as
   * 'vault_full' by the vault's own limits, though a backend holding a limit of its own may refuse
   * a heavier replacement in a full vault as kind 'vault_full'.
   *
   * The write lands only if storage still holds what this device last read: the same vault, under
   * the same vaultKey, and the same revision of this box (or still none). The store makes one
   * attempt. When another device or tab got in first -- writing this box, creating it, or
   * deleting it -- storage refuses the write, and the call catches up with storage once and throws
   * kind 'stale_write' at once, without waiting: nothing was written, and the snapshot now shows
   * the box as storage holds it. The vault merges nothing and decides nothing for the user: the
   * app shows what is there now, and calls `putBox()` again if this whisper should still replace
   * it. A catch-up that finds the vault deleted or made anew elsewhere, or its ways in changed,
   * relocks this device instead, and the call throws kind 'vault_locked' without writing: a stale
   * session never writes into a vault reborn under new keys.
   *
   * Should the catch-up after a refusal fail itself, the call throws kind 'stale_write', the
   * catch-up's failure its cause, and the snapshot says `syncing: false` -- or, for a catch-up
   * refused as 'identity_revoked', 'rolled_back' or 'newer_format', that refusal as it came.
   *
   * A store can also throw after its write has landed. Once storage takes the write, the call reads
   * storage again to show the new revision, and that read can fail as any read does: kind
   * 'storage_unavailable', 'identity_revoked', 'rolled_back', 'newer_format' or 'damaged_vault'. A
   * storage adapter that hands back a record it cannot read throws kind 'corrupt_record' the same
   * way. Either way the box may already hold this whisper, and calling `putBox()` again
   * writes the same whisper over itself, harmlessly.
   *
   * The box keeps the time it was first stored as `registered_at`, and stamps `written_at`
   * with the time of this write: every store moves it, the same whisper stored again included, so
   * it says when the box was last written, never whether its whisper changed.
   *
   * A box whose stored record cannot be read as one -- every box the snapshot lists as
   * damaged, and also one that lists as sound but whose ciphered fields are missing or malformed
   * -- is overwritten as though it were new, with nothing carried from it, neither its sidecar
   * nor its `registered_at`: in one write over the revision the listing names, which another
   * device's write meanwhile refuses, as for any box. A store is that one write, always. A
   * box the snapshot lists as damaged naming no revision -- damaged beyond naming, as a record
   * that is not JSON is -- has no revision to write over, so the store refuses it with kind
   * 'damaged_box', writing nothing: `delBox()` it first, then store. A record that reads but will not decipher --
   * its ciphertext, its sidecar or a time altered in storage -- is written over its revision, but
   * carries nothing forward either: nothing vouches for its visible fields, so its sidecar becomes `{}`
   * unless one is given, and its `registered_at` is now. A boxlabel the vault's check refuses is
   * kind 'bad_label', writing nothing, even where a box stored under other checks stands under
   * it: that one reads and deletes by its name, but is never written anew under it.
   *
   * `opts.sidecar` is the box's sidecar ({@link Sidecar}): your app's own data, riding
   * beside the whisper, visible in storage -- authenticated, but never encrypted, so anyone who can
   * read the database can read it. Any JSON value, shown in the snapshot while locked, never interpreted by the vault -- kind 'bad_option' for anything JSON
   * cannot carry. Check its shape yourself before storing it. It is the only option: any other
   * (a misspelt `sidcar`, or a `note` beside it) is kind 'bad_option', writing nothing. Left out, the box keeps the sidecar
   * it has (when its record opens: see above), and a new box gets `{}`; `{}` empties it. The sidecar is stored in the clear and
   * bound into the box's encryption, so a sidecar altered in storage makes the box refuse to
   * open. Put in it what your app wants searchable server-side (a team, a rotation reminder,
   * a count of the calls the app made to OpenRouter with this whisper), never secret material. A box heavier, whisper and names and sidecar together,
   * than storage holds in one record is refused with kind 'box_too_large'; one that would take
   * the vault past what its storage holds of one vault, with kind 'vault_full'.
   *
   * @example await vault.putBox('anthropic_api_key', 'sk-ant-...', { sidecar: { note: 'work account' } })
   * @example await vault.putBox('anthropic_api_key', 'sk-ant-...')              // keeps the sidecar it has
   * @example await vault.putBox('anthropic_api_key', 'sk-ant-...', { sidecar: {} }) // and empties it
   */
  putBox = this.#throwing(this.#tryPutBox)
  readonly #tryGetBox = this.#trying((boxlabel: string) => this.#openBox(boxlabel))
  /**
   * {@link Vault.getBox}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryGetBox = this.#tryGetBox
  /**
   * The whisper in `boxlabel`. Needs the vault unlocked, through `ensureLease()`, which asks
   * `getProof` when it is not, and refuses 'vault_locked' when that is declined -- asked only once
   * the listing in hand shows a box under `boxlabel`, so a call that cannot land never prompts: a
   * locked vault refuses a name its listing shows nothing under, reading nothing more (the listing
   * is as fresh as `staleMinutes` keeps it). Kind 'absent_box' when there is none, and
   * 'damaged_box' when its stored record fails its checks, or will not open under the vault's
   * key: `delBox()` it, or `putBox()` over it. A box that will not open is named so only
   * after one catch-up with storage: one a vault deleted and made anew elsewhere wrote relocks this
   * device, and the call throws kind 'vault_locked'; a catch-up that fails throws its own
   * refusal. A lock landing while storage is read refuses the call once storage answers, handing
   * nothing back -- kind 'vault_locked' for a `lock()`, a `del()`, the lease ending, or a
   * refresh that finds the vault's ways in changed or the vault gone -- unless an unlock has put a
   * key back in hand meanwhile; 'vault_closed' for a `close()`.
   * A box stored under a boxlabel the vault's check refuses -- by another client, or under
   * other checks -- reads as any other, by the name it was stored under. With nothing under it, a
   * name the check refuses is kind 'bad_label', and one below the floor every name is held to is
   * 'bad_label' always.
   */
  getBox = this.#throwing(this.#tryGetBox)
  /**
   * The whisper in `boxlabel`, or its refusal thrown, as {@link Vault.getBox} answers and refuses.
   * The throwing form only: where code branches on the refusal, `tryGetBox()` is the call.
   *
   * @example const apiKey = await vault.getWhisper('anthropic_api_key')
   */
  getWhisper = async (boxlabel: string): Promise<Whisper> => valOf(await this.#tryGetBox(boxlabel))
  /**
   * Hand the whisper to `callback` and return its result: the shape that discourages parking a
   * secret in state. Needs the vault unlocked, as `getBox()` does; kind 'bad_option', before anything is read, for a
   * `callback` that is not a function. Refuses `boxlabel` as `getBox()` does: 'absent_box',
   * 'damaged_box', and 'bad_label' for a name the vault's check refuses with nothing under it.
   * The throwing form only, as the callback's own throw is the host's: it rejects with it as it
   * came.
   *
   * @example await vault.useBox('anthropic_api_key', (whisper) => callAnthropic(whisper))
   */
  useBox = async <ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT> => {
    if (typeof callback !== 'function') { throw new VaultError('bad_option', 'use needs a callback function to hand the whisper to.') }
    // The callback's own throw is the host's, and is never told as the vault's bad news.
    const whisper = valOf(await this.#tryGetBox(boxlabel))
    return await callback(whisper)
  }

  readonly #tryOpenBox = this.#trying(async (box: Box | BoxRecord): Promise<Whisper> => {
    this.#checkOpen()
    const record = box instanceof Box ? box.props : checkedBoxRecord(box, 'openBox()')
    const unlockedKey = this.#checkUnlocked()
    // Made anew for this vault: a box opens under this vault's scope and the props it holds, whichever it came from.
    const held = Box.make(this, record, this.#currentVaultProps())
    const whisper = valOf(await held.tryOpen(unlockedKey))
    this.#checkUnlocked()
    return whisper
  })
  /**
   * {@link Vault.openBox}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryOpenBox = this.#tryOpenBox
  /**
   * The whisper `box` holds, opened under the vaultKey in hand: a box already in hand, or its
   * stored record, is deciphered and checked, and nothing is read from storage and nobody is
   * asked for a proof. Refuses kind 'vault_locked' when no key is in hand -- `ensureLease()`
   * first -- or when a lock lands while the box opens; 'damaged_box' for a box that will not open
   * under this vault's key, as `box.tryOpen` says, told to `onBadNews` as well; 'bad_record' for a
   * record this package does not write; 'vault_closed' after `close()`.
   *
   * @example const whisper = await vault.openBox(box)
   */
  openBox = this.#throwing(this.#tryOpenBox)

  readonly #tryDelBox = this.#trying(async (boxlabel: string): Promise<void> => {
    this.#checkOpen()
    const floored = Names.checkFloor('boxlabel', boxlabel)
    // Checked before the user is asked for anything: a call that cannot land never prompts.
    await this.#ensureLease(0, () => { this.#checkListed(floored) })
    const label = await this.#checkStandingBoxlabel(floored)
    this.#checkUnlocked()
    // Lands only in the vault this device holds keys for, whatever revision of the box stands:
    // a vault deleted and made anew elsewhere refuses it. The revision the listing shows only
    // lets storage say whether it removed that one or another.
    const expected = { vault_id: this.#currentVaultProps().vault_id, revision_tok: this.#listedRevisionOf(label) }
    // Asked before the call: a catch-up on a stale answer re-lists, and what was shown is what counts.
    const showedDamaged = this.#isListedDamaged(label)
    try {
      const { outcome } = await this.#refreshOnStale(this.#vaultDB.delBox(this.#scope, label, expected), 'delBox')
      if (outcome === 'deleted_other') {
        if (showedDamaged) {
          this.#logger.warn("The box this device showed was a damaged one, and the box deleted was not that record: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox', damaged: true })
        } else {
          this.#logger.warn("The box deleted was not the revision this device showed: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox' })
        }
      }
    } catch (err) {
      // Said as what happened to the box, once caught up; a catch-up that failed says so instead.
      if (! this.#isCaughtUpStale(err)) { throw err }
      throw new VaultError('stale_write', "That box could not be removed, because the vault it was in is gone: it was deleted, or deleted and made anew, on another device. Nothing was removed, and this device has caught up with storage. If the vault was made anew and the box stands in it, unlock that vault and remove it there.", { cause: err })
    }
    await this.#refresh()
  })
  /**
   * {@link Vault.delBox}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryDelBox = this.#tryDelBox
  /**
   * Remove the box `boxlabel` entirely, whatever revision of it stands -- even one whose
   * stored record fails verification, which the snapshot lists as damaged and reading refuses as
   * 'damaged_box': deleting it needs nothing from it, and is the remedy for it. A box
   * stored under a boxlabel the vault's check refuses is reached by that name too. Needs the vault
   * unlocked, as `getBox()` does; kind 'absent_box' when absent, and 'bad_label' for a refused name with nothing
   * under it. The deletion lands only in the vault this device last read: if it was deleted, or
   * deleted and made anew, elsewhere, nothing is removed and the call throws kind
   * 'stale_write', after catching up with storage -- which relocks this device -- its message
   * saying the box could not be deleted because the vault it was in is gone, and the
   * adapter's refusal its cause. Within that vault the deletion wins: when what stood was not the
   * revision the snapshot shows -- another device or tab wrote over it meanwhile -- it is deleted
   * all the same, and the vault warns through its logger, naming neither revision. When the box
   * the snapshot showed was a damaged one, the warning says so and its story carries
   * `damaged: true` beside `call`. Deleted is gone: nothing of the box is kept, and a put from a
   * device that never saw the delete names a revision that no longer stands, so it is refused as
   * stale.
   */
  delBox = this.#throwing(this.#tryDelBox)
  // --

  // == [Vault: deleting and closing]: del, close

  readonly #tryDel = this.#trying(async (): Promise<void> => {
    await this.#hello()
    // A handle that holds no vault -- it has seen none, or forgot one refused as an older copy
    // while the hello ran -- looks first: "delete my vault" must not report success over one
    // standing. Otherwise only the vault this handle had read when called: one deleted and made
    // anew since refuses, even if a background refresh brings it in while this awaits.
    if (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps) { await this.#refresh() }
    const doomed = this.#vaultProps
    this.#landLock()
    await this.#shut()
    if (doomed !== null && doomed !== UnreadVaultProps) {
      await this.#refreshOnStale(this.#vaultDB.delVault(this.#scope, { vault_id: doomed.vault_id }), 'del')
    }
    // This device forgets the vault it had seen, too: one made later under this scope is another.
    valOf(await this.#deviceDB.delMark(this.#scope))
    await this.#refresh()
    this.#forgetHello()
  })
  /**
   * {@link Vault.del}, resolving to an {@link Outcome}: what it answers as `val`, what it refuses
   * with as `err`, never thrown.
   */
  tryDel = this.#tryDel
  /**
   * Delete the vault: delete its every stored record, remote and device-local, the vault half of
   * deleting an account. No tombstone is kept. Deliberately does NOT require unlock -- an authenticated owner can always delete
   * their own rows server-side, and requiring unlock here would only look like protection.
   *
   * Deletes the vault this handle last read, and only that one: if it was deleted, or
   * deleted and made anew, elsewhere since, storage keeps what stands there now and the call
   * throws kind 'stale_write', after catching up -- so a second del(), the user asking again,
   * deletes the vault that then stands, the one the snapshot shows. A handle that has seen no
   * vault reads storage first, and deletes whatever vault stands there: "delete my vault" never
   * reports success over one standing. Locks as `lock()` does -- a prompt up for a proof ends as a
   * `lock()` ends it -- and this device forgets its mark of the vault.
   */
  del = this.#throwing(this.#tryDel)
  // Answers at once, as there is nothing to wait for: its outcome, not a promise of one.
  readonly #tryClose = (): Outcome<void> => {
    // A second close does nothing: an adapter's unsubscribe may count down a watch it shares.
    if (this.#closed) { return good(undefined) }
    this.#closed = true
    this.#landLock()
    // Not a lock of the vault: an unlock under way takes nothing up, but nothing this device
    // remembers is erased.
    this.#dropKey()
    this.#unsubscribeDB?.()
    this.#listeners.clear()
    return good(undefined)
  }
  /**
   * {@link Vault.close}, answering with an {@link Outcome} at once: it is never refused, and waits
   * for nothing.
   */
  tryClose = this.#tryClose
  /**
   * Release subscriptions and refuse further calls, dropping the vaultKey from memory. It is not
   * a lock of the vault, and forgets nothing stored: this device's lease stays, and the next
   * vault made takes it up. An `unlock()` still under way takes nothing up and throws kind 'vault_closed';
   * any lease it granted on the device before the close stays too. A `getBox()` or
   * `useBox()` still under way hands back nothing and throws kind 'vault_closed', as after a lock.
   * A prompt up for a proof ends as a `lock()` ends it: its waiters refuse 'vault_locked', and its
   * ask's `lockLanded` settles. A second `close()` does nothing.
   */
  close = (): void => { valOf(this.#tryClose()) }
  // --

  // == [Options and setup]: make, the constructor, scope, parsed options, limits, vaultDB, onBadNews, getProof, clockNow

  readonly #scope: VaultScope
  readonly #rules: Names.NameRules
  // Every storage refusal, whichever call met it, passes by the refusal policy on its way out.
  readonly #vaultDB: RefusalPolicy.HeededVaultDB
  // Every failure of the device's own storage reaches the vault's callers as a condition, with a kind.
  readonly #deviceDB: DeviceDB
  // The vault reads its own lease length, and calls its own hello: a host writing over the public
  // `hello` on the handle changes nothing inside the vault.
  readonly #leaseMillis: number
  // How long a hello trusts the last read when its call says nothing: see hello().
  readonly #staleMillis: number
  readonly #onBadNews: BadNewsHandler | null
  readonly #getProof: GetProof | null
  readonly #logger: VaultLogger
  readonly #clock: Clock
  readonly #keyDeriver: KeyDeriver
  readonly #strengthChecker: StrengthChecker
  // Whether the vault has said, once, that its host chose no strength checker.
  #unchosenCheckerSaid = false
  readonly #whisperByteLimit: number
  readonly #boxLimit: number
  readonly #vaultByteLimit: number
  // Frozen: `vault.clock` hands it out, and the vault's boxes stamp their times by it.
  readonly #checkedClock: Clock = Object.freeze({ now: () => this.#clockNow() })

  /**
   * A handle on one user's vault, made at once, in state `opening`: its options checked, and
   * nothing else done. It reads no storage and no device store, starts no timer and no watch, and
   * prompts nobody, until a call asks: the first `hello()` -- the host's own, or the one any other
   * call but `lock()` and `close()` starts and waits for -- reads storage, starts the vault's watch on
   * it, and settles the vault into `absent`, `locked` or `unlocked`. So the handle may be used at
   * once, and making one the app then drops costs nothing.
   *
   * Misuse throws here, synchronously, the one refusal thrown rather than returned, since there is
   * no vault yet to return it from: kind 'bad_label' for a label or a `userId` that
   * fails its check (`validators`), and 'bad_option' for any other option -- an option it does not
   * take (a misspelling, or a name it no longer uses, which it names), or a `vaultDB` or `deviceDB`
   * short of a verb, or a `vaultDB` that is no instance of the `VaultDB` class. Kind
   * 'insecure_context', first of all, in a page the browser says is not a secure context
   * (`isSecureContext` false: plain http, anywhere but localhost), where it withholds WebCrypto:
   * serve the app over https.
   *
   * @example
   *   const vault = Vault.make({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
   *   vault.state                // 'opening': nothing read yet
   *   await vault.hello()
   *   vault.state                // 'absent' | 'locked' | 'unlocked'
   * @example
   *   const vault = Vault.make({ applabel: 'acme', userId: session.userId, vaultlabel: 'main', vaultDB, deviceDB, keyDeriver, strengthChecker })
   * @example Vault.make({ ...opts, forcePassphraseReentryHours: 1 })  // throws 'bad_option': it is called leaseHours now
   */
  static make(opts: MakeVaultOpts): Vault {
    return new Vault(opts)
  }

  /** The handle {@link Vault.make} makes: its options checked, its first snapshot `opening`, and nothing else done. */
  private constructor(opts: MakeVaultOpts) {
    const parsed = parseMakeVaultOpts(opts)
    this.#scope = parsed.scope
    this.#rules = parsed.rules
    this.#vaultDB = RefusalPolicy.heed(parsed.vaultDB, async (refusal) => { await this.#heedRefusal(refusal) })
    this.#deviceDB = deviceTroubleAsConditions(parsed.deviceDB)
    this.#leaseMillis = parsed.leaseMillis
    this.#staleMillis = parsed.staleMillis
    this.#onBadNews = parsed.onBadNews
    this.#getProof = parsed.getProof
    this.#logger = parsed.logger
    this.#clock = parsed.clock
    this.#keyDeriver = parsed.keyDeriver
    this.#strengthChecker = parsed.strengthChecker
    this.#whisperByteLimit = parsed.whisperByteLimit
    this.#boxLimit = parsed.boxLimit
    this.#vaultByteLimit = parsed.vaultByteLimit
    this.#snapshot = this.#picture()
  }

  /** A checked reading of the host's clock. One that fails drops the vaultKey first: no deadline can be trusted now. */
  #clockNow() {
    try {
      return readClock(this.#clock)
    } catch (err) {
      this.#dropKey()
      this.#settle()
      throw err
    }
  }
  // --

  // == [State and snapshot]: vaultProps, vaultKey, lease, unlockStands, listeners, snapshot, picture, settle

  #vaultProps: VaultProps | null | typeof UnreadVaultProps = UnreadVaultProps
  // This device's mark for the vault props in hand, set with them, so the two always name one vault.
  #deviceMark: DeviceMark | null = null
  // The vault this handle last drafted, and the device_id its first way in carries: whichever of
  // this handle's reads starts the vault's mark -- the unlock making it, or a refresh its write
  // set off -- starts it under that id.
  #drafted: { vault_id: string, device_id: string } | null = null
  #boxes: readonly (BoxSummary | DamagedBox)[] = []
  // The vaultKey this handle holds, and the lease it holds it under: set together, dropped together.
  #vaultKey: CryptoKey | null = null
  #lease: Lease | null = null
  #closed = false
  // The timer that drops the vaultKey at askPassphraseAt. Null when no key is held, or the one
  // held lasts until lock().
  #pendingShut: ReturnType<typeof setTimeout> | null = null

  readonly #listeners = new Set<() => void>()
  #vaultState(): VaultState {
    if (this.#vaultProps === UnreadVaultProps) { return 'opening' }
    if (this.#vaultProps === null) { return 'absent' }
    return this.#unlockStands() ? 'unlocked' : 'locked'
  }
  /** True while a vaultKey is held under a lease that has not ended, by the clock read now. */
  #unlockStands(): boolean {
    return this.#vaultKey !== null && this.#lease !== null && ! this.#lease.endsWithin(0)
  }
  // The ways in of each vault props record the vault has held, made once per record. Every record
  // the vault holds is frozen as it takes it up (see frozenVaultProps), so a way in's holder, a
  // box's and the record the vault works from are one object, which nothing can change.
  readonly #modelled = new WeakMap<VaultProps, HeldWayins>()
  #wayinsOf(standing: VaultProps): HeldWayins {
    const known = this.#modelled.get(standing)
    if (known !== undefined) { return known }
    const wayins = Object.freeze({
      passphrase: Wayin.make(this, standing.passphrase, standing),
      passkey:    standing.passkey === null ? null : Wayin.make(this, standing.passkey, standing),
    })
    this.#modelled.set(standing, wayins)
    return wayins
  }
  /** The ways in of `standing`, the passphrase's first, as a list: none for no vault props. */
  #wayinListOf(standing: VaultProps | null): readonly (PassphraseWayin | PasskeyWayin)[] {
    if (standing === null) { return [] }
    const { passphrase, passkey } = this.#wayinsOf(standing)
    return passkey === null ? [passphrase] : [passphrase, passkey]
  }
  // Whether the last read of storage succeeded, as the snapshot says; and whether the storage
  // watch has warned of a failing streak it has not yet seen end.
  #syncing = true
  #watchWarned = false
  // The latest bad news, or what the handler threw at it: the snapshot's trouble. See [Bad news].
  #trouble: VaultError | null = null
  // The hello under way, or the last to succeed while what it read still stands (`greeted`); null
  // when the next hello must read afresh. See hello().
  #greeting: Promise<void> | null = null
  #greeted = false
  #snapshot: VaultSnapshot
  // The vault props the snapshot was last settled from, whose ways in it shows as summaries: the
  // vault's alone, as their salts and wraps are what an offline guess at a passphrase needs.
  #shownProps: VaultProps | null = null

  /** The picture the private state makes now, frozen, as the snapshot and every public field show it. */
  #picture(): VaultSnapshot {
    const state = this.#vaultState()
    const standing = this.#vaultProps === UnreadVaultProps ? null : this.#vaultProps
    const wayins = standing === null ? null : this.#wayinsOf(standing)
    const { boxes, bytes } = this.#capacity()
    return Object.freeze({
      ...this.#scope,
      vault_id:        standing?.vault_id ?? null,
      registered_at:   standing?.registered_at ?? null,
      unlock_epoch:    standing?.unlock_epoch ?? null,
      vault_key_epoch: standing?.vault_key_epoch ?? null,
      passphrase:      wayins === null ? null : Object.freeze(wayins.passphrase.summary),
      passkey:         wayins?.passkey ? Object.freeze(wayins.passkey.summary) : null,
      state,
      boxes:           Object.freeze(this.#boxes.map((box) => Object.freeze(box))),
      capacity:        Object.freeze({ boxes: Object.freeze(boxes), bytes: Object.freeze(bytes) }),
      askPassphraseAt: state === 'unlocked' ? this.#lease?.ask_passphrase_at ?? null : null,
      trouble:         this.#trouble,
      syncing:         this.#syncing,
    })
  }

  /**
   * Publish the picture the private state makes now: the one place the snapshot, and so every
   * public field, is written. It keeps its identity until something really changed --
   * useSyncExternalStore's contract, and what spares React a render when a background refresh
   * found nothing new -- and only then is every listener told. Its trouble is told apart by
   * identity, as two refusals of one kind read alike as JSON.
   */
  #settle() {
    this.#shownProps = this.#vaultProps === UnreadVaultProps ? null : this.#vaultProps
    const next = this.#picture()
    if (next.trouble === this.#snapshot.trouble && stableJsonify({ ...next, trouble: null }) === stableJsonify({ ...this.#snapshot, trouble: null })) { return }
    this.#snapshot = next
    this.#listeners.forEach((listener) => { listener() })
  }
  // --

  // == [Reading storage]: refresh, readStorage, takeStorage, heedRevocation, readAt, hello, helloWithin, greet, watchStorage

  /**
   * Bring the snapshot up to what storage holds now, one read at a time: a refresh asked for while
   * one runs is served by one more run once that ends, shared by every request made meanwhile, so
   * each caller sees storage as it stood after it asked, and no two reads interleave.
   */
  readonly #refresh = oneAtATime(() => this.#readStorage())

  /**
   * One read of storage into the snapshot. One that fails leaves the snapshot as it stood, but for
   * its `syncing`, and has the next hello read afresh.
   */
  async #readStorage() {
    try {
      await this.#takeStorage()
    } catch (err) {
      this.#syncing = false
      this.#forgetHello()
      this.#settle()
      throw err
    }
    if (! this.#watchWarned) { return }
    this.#watchWarned = false
    this.#logger.log('Storage reads again after the failures the vault warned of: what it shows has caught up with storage.', { call: 'refresh' })
  }

  async #takeStorage() {
    const readAt = this.#clockNow()
    // The mark the vault props are held to is read before them (see heedMark), and an older copy of a vault
    // this device has seen newer is refused before anything is taken from it.
    const seenBefore = this.#checkedMark(valOf(await this.#deviceDB.getMark(this.#scope)))
    const read = await damagedAs(this.#vaultDB.getVaultProps(this.#scope), damagedVaultProps)
    const fresh = read === null ? null : frozenVaultProps(read)
    const mark = fresh === null ? null : await this.#heedMark(fresh, { seenBefore, call: 'refresh' })
    await this.#heedRevocation(fresh, mark)
    const listed = fresh === null ? [] : await this.#vaultDB.listBoxes(this.#scope)
    // Taken up together once all is read, so a read that fails partway leaves the snapshot's
    // vault, mark and boxes as they stood (but for a revocation, taken up above): never a vault
    // beside another's boxes. Vault props newer than these, which this device's own write put in
    // hand while they were read, stand.
    const inHand = this.#vaultProps
    const standing = inHand !== UnreadVaultProps && isNewerCopy(inHand, fresh) ? inHand : fresh
    if (standing === fresh) {
      this.#vaultProps = fresh
      this.#deviceMark = mark
    }
    const shown = this.#boxes
    const shownWayins = this.#wayinListOf(this.#shownProps)
    // A box under a vaultKey the vault does not hold lists as damaged from its epoch alone.
    this.#boxes = standing === null ? [] : listed.map((box) => heldListing(isUnderHeldKey(box, standing) ? box : asDamaged(box)))
    this.#syncing = true
    this.#readAt = readAt
    // A read with no damaged box or way in clears the trouble: nothing amiss stands. The listing is
    // published before its news is told, so a handler reading the vault sees what it lists.
    const damagedWayins = this.#wayinListOf(standing).filter((wayin) => wayin.isDamaged())
    if (this.#boxes.every((box) => ! box.damaged) && damagedWayins.length === 0) { this.#trouble = null }
    this.#settle()
    this.#tellListingNews(shown)
    this.#tellWayinNews(damagedWayins, shownWayins)
  }

  /**
   * Take up `fresh`, vault props just read, at once when they revoke the ones in hand: a change to
   * the wayins (new epoch) or a deletion or remaking, here or elsewhere, ends this device's unlock,
   * and wins by construction. They are taken up with `mark` before any further wait, with the key
   * dropped, any take-up and any first unlock's create stood down. A take-up or an unlock finishing
   * during the read asks whether its vault props were outrun, and finds these. The lease, outdated
   * by the same change, is discarded when a key was held. An older copy of the vault in hand is no
   * change: see isNewerCopy.
   */
  async #heedRevocation(fresh: VaultProps | null, mark: DeviceMark | null) {
    const held = this.#vaultProps
    if (held === UnreadVaultProps || held === null || isNewerCopy(held, fresh)) { return }
    if (fresh?.unlock_epoch === held.unlock_epoch && fresh.vault_id === held.vault_id) { return }
    const wasUnlocked = this.#vaultKey !== null
    this.#vaultProps = fresh
    this.#deviceMark = mark
    // Never another vault's boxes beside these vault props, should the listing that follows fail.
    if (fresh?.vault_id !== held.vault_id) { this.#boxes = [] }
    this.#dropKey()
    this.#standDownCreates()
    if (wasUnlocked) { valOf(await this.#deviceDB.delLease(this.#scope)) }
  }

  // When the last read of storage to succeed began, by the vault's clock: what a hello's
  // staleMinutes are counted from.
  #readAt = FarPast

  /**
   * Have the next hello read afresh, once one has succeeded: what it read may no longer stand. A
   * hello under way is left to finish, every caller sharing it; one that fails forgets itself.
   */
  #forgetHello() {
    if (! this.#greeted) { return }
    this.#greeting = null
    this.#greeted = false
  }

  /**
   * The hello every call waits for, shared while it runs and kept once it succeeds, while what it
   * read still stands: the first one reads storage and starts the watch on it. See `Vault.hello`.
   */
  #hello(): Promise<void> {
    if (this.#closed) { return Promise.reject(closedError()) }
    this.#watchStorage()
    this.#greeting ??= this.#greet()
    return this.#greeting
  }

  /**
   * The host's hello: {@link hello}, reading afresh once the last read began `staleMillis` ago or
   * more, and settling the picture either way, so a lease run out meanwhile shows.
   */
  async #helloWithin(staleMillis: number): Promise<void> {
    if (this.#greeted && this.#clockNow() - this.#readAt >= staleMillis) { this.#forgetHello() }
    await this.#hello()
    this.#settle()
  }

  /**
   * One hello: storage read, then this device's lease taken up. One that fails says so in the
   * snapshot and forgets itself, so the next hello reads afresh; so does one whose vault props a
   * refusal of an older copy forgot while it ran (see forgetVaultProps). No other hello can start
   * while one runs (see forgetHello), so the one this ends is always the one in `greeting`.
   */
  async #greet(): Promise<void> {
    try {
      await this.#refresh()
      await this.#fetchLease()
    } catch (err) {
      this.#greeting = null
      this.#settle()
      throw err
    }
    if (this.#vaultProps === UnreadVaultProps) {
      this.#greeting = null
    } else {
      this.#greeted = true
    }
    this.#settle()
  }

  /** Start the vault's watch on storage, once: the first hello does. `close()` ends it. */
  #watchStorage() {
    if (this.#watching) { return }
    // Marked before the adapter is asked: one that rings as it subscribes has that ring's hello
    // find the watch begun, rather than subscribe again, and again. One that throws is asked anew.
    this.#watching = true
    try {
      this.#unsubscribeDB = this.#vaultDB.subscribe(this.#scope, () => { void this.#watchRefresh() })
    } catch (err) {
      this.#watching = false
      throw err
    }
  }
  // --

  // == [Mark]: checkedMark, keptMark, heedMark, raiseMark, markSeeing, deviceIdFor

  /** `kept`, a mark the deviceDB handed back, when it passes its check and is of this scope; null otherwise. */
  #checkedMark(kept: unknown): DeviceMark | null {
    const checked = DeviceMark.safeParse(kept)
    return checked.success && Names.sameScope(checked.data, this.#scope) ? checked.data : null
  }

  /**
   * This device's mark for the vault, as kept: one that does not pass its check, or names some
   * other scope, reads as none, as on a device that never saw the vault -- and is said so once,
   * since the rollback check starts again from what storage holds now.
   */
  async #keptMark(call: VaultCall): Promise<DeviceMark | null> {
    const kept = valOf(await this.#deviceDB.getMark(this.#scope))
    if (kept === null) { return null }
    const checked = this.#checkedMark(kept)
    if (checked !== null) { return checked }
    this.#logger.warn("This device's mark of the newest copy of the vault it had seen could not be read, so it starts again from the copy storage holds now.", { call })
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
  async #heedMark(fresh: VaultProps, opts: { seenBefore?: DeviceMark | null, call: VaultCall }): Promise<DeviceMark> {
    const kept = await this.#keptMark(opts.call)
    const held = (opts.seenBefore === undefined ? kept : opts.seenBefore)?.seen ?? null
    const older = held !== null && held.vault_id === fresh.vault_id
      && (fresh.unlock_epoch < held.unlock_epoch || fresh.vault_key_epoch < held.vault_key_epoch)
    if (older) {
      const refusal = new VaultError('rolled_back', "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it by forgetting what it saw of the vault (its deviceDB's delMark) and opening the vault again; otherwise the app's support should look at its storage.")
      // Storage that hands back an older copy is not to be trusted with an unlocked vault.
      await this.#heedRefusal(refusal)
      throw refusal
    }
    return await this.#raiseMark(kept, fresh)
  }

  /**
   * The mark this device keeps once it has seen `fresh`: `kept` itself when it has already seen
   * that vault at that `unlock_epoch` and `vault_key_epoch` or past both, and otherwise a new mark
   * at the higher of each, written before it is returned -- under the `device_id` `kept` has seen
   * that vault under, and for a vault not seen, the one this handle drafted it under, or a new one.
   */
  async #raiseMark(kept: DeviceMark | null, fresh: VaultProps): Promise<DeviceMark> {
    const mark = this.#markSeeing(kept, fresh)
    if (mark.seen !== kept?.seen) { valOf(await this.#deviceDB.putMark(mark)) }
    return mark
  }

  /** The mark {@link raiseMark} keeps, `kept` itself (whose `seen` it keeps) when nothing is raised. */
  #markSeeing(kept: DeviceMark | null, fresh: VaultProps): DeviceMark {
    const seen = kept?.seen.vault_id === fresh.vault_id ? kept.seen : null
    if (kept !== null && seen !== null && seen.unlock_epoch >= fresh.unlock_epoch && seen.vault_key_epoch >= fresh.vault_key_epoch) { return kept }
    return {
      format: MarkFormat,
      ...this.#scope,
      seen:   {
        device_id:       seen?.device_id ?? this.#newDeviceIdFor(fresh.vault_id),
        vault_id:        fresh.vault_id,
        unlock_epoch:    Math.max(seen?.unlock_epoch ?? 0, fresh.unlock_epoch),
        vault_key_epoch: Math.max(seen?.vault_key_epoch ?? 0, fresh.vault_key_epoch),
      },
    }
  }

  /** The `device_id` a mark of `vaultId` starts under: the one this handle drafted it under, or a new one. */
  #newDeviceIdFor(vaultId: string): string { return this.#drafted?.vault_id === vaultId ? this.#drafted.device_id : randomId() }

  /**
   * This device's id for the vault `standing` is, which every way in it adds carries: the one its
   * mark holds, set with the vault props in hand. Vault props in hand that have moved on to another
   * vault meanwhile are said as the stale write they would make.
   */
  #deviceIdFor(standing: VaultProps): string {
    if (this.#deviceMark?.seen.vault_id === standing.vault_id) { return this.#deviceMark.seen.device_id }
    throw new VaultError('stale_write', 'The vault changed in storage while this device was reading it -- it was deleted or made anew elsewhere -- so nothing was written. Read the vault again before retrying.')
  }
  // --

  // == [Guards]: checkOpen, checkUnlocked, currentVaultProps

  #checkOpen() {
    if (this.#closed) { throw closedError() }
  }
  /**
   * The vaultKey, for an operation that touches a secret, which calls this first and again after
   * each wait on storage. The threshold is the truth: past `askPassphraseAt` the key is gone,
   * whatever any timer has done, and this look drops it should its timer run late.
   */
  #checkUnlocked(): CryptoKey {
    this.#checkOpen()
    if (this.#vaultKey !== null && this.#unlockStands()) { return this.#vaultKey }
    this.#dropKey()
    this.#settle()
    throw lockedError()
  }

  #currentVaultProps(): VaultProps {
    if (this.#vaultProps === UnreadVaultProps || this.#vaultProps === null) {
      throw new VaultError('absent_vault', 'This vault has not been created yet: the first unlock() creates it.')
    }
    return this.#vaultProps
  }
  // --

  // == [Asking for a proof]: asking, ensureLease, whyAsk, raiseAsk, landLock, tryAttempt, unlockWith

  // The prompt up now, if any: every call that needs the vault unlocked while it is up waits on its
  // one answer. See ensureLease().
  #asking: RaisedAsk | null = null

  /**
   * The vault, unlocked: at once while the lease stands past `renewMillis` from now, and
   * otherwise once the prompt -- the one up, or one raised now -- answers. See `Vault.ensureLease`.
   * `beforeAsking` runs only when the vault must ask, once storage is read and before any prompt:
   * a call checks there what it can know without the key, so a call that cannot land never prompts.
   */
  async #ensureLease(renewMillis: number, beforeAsking?: () => void): Promise<Vault> {
    await this.#helloWithin(this.#staleMillis)
    // A close() during the hello: no ask is raised over a closed handle.
    this.#checkOpen()
    const why = this.#whyAsk(renewMillis)
    if (why === null) { return this }
    beforeAsking?.()
    const answer = valOf(await (this.#asking ?? this.#raiseAsk(why)).answer)
    if (answer === 'declined') { throw declinedError(this.#getProof !== null) }
    if (answer === 'unlocked') { await this.#helloWithin(this.#staleMillis) }
    // Unlocked, or carrying on under the lease: either way a lease must stand now.
    this.#checkUnlocked()
    return this
  }

  /** Why the vault must ask for a proof now: null while it is unlocked past `renewMillis` from now. */
  #whyAsk(renewMillis: number): AskWhy | null {
    if (this.#vaultProps === null) { return 'absent' }
    if (this.#lease === null || ! this.#unlockStands()) {
      // The threshold is the truth: a key past its deadline goes now, should its timer run late.
      if (this.#vaultKey !== null) { this.#dropNow() }
      return 'locked'
    }
    return this.#lease.endsWithin(renewMillis) ? 'lease_ending' : null
  }

  /** Raise a prompt for `why`, up until it is answered or a lock lands. */
  #raiseAsk(why: AskWhy): RaisedAsk {
    const raised = Ask[raiseAsk](why, this, this.#tryAttempt, this.#getProof)
    this.#asking = raised
    // Answered or refused, the prompt is down: the next call that needs a proof raises another.
    void raised.answer.then(() => { if (this.#asking === raised) { this.#asking = null } })
    return raised
  }

  /** A `lock()`, `close()` or `del()` has landed: the prompt up, if any, refuses its waiters and settles `lockLanded`. */
  #landLock() {
    this.#asking?.landLock()
    this.#asking = null
  }

  /** An ask's `attempt`: one proof's unlock, standing down once `overtaken` is aborted: the prompt over, by a lock or an answer. */
  readonly #tryAttempt = this.#trying(async (givenProof: string | PasskeyAnswer, overtaken: AbortSignal): Promise<Vault> => {
    await this.#unlockWith(givenProof, overtaken)
    return this
  })

  /**
   * Unlock with one proof, as `unlock()` and an ask's `attempt` do: proven against the vault props
   * as storage holds them now, creating the vault when absent, and a lease granted. One that the
   * vault outruns -- closed, removed, its ways in changed, or `overtaken` aborted as its prompt ends -- takes
   * nothing up and refuses.
   */
  async #unlockWith(givenProof: string | PasskeyAnswer, overtaken?: AbortSignal): Promise<void> {
    this.#checkOpen()
    const proof = Proof.parse(this, givenProof)
    await this.#hello()
    // Sync with the backend first: the passphrase proves itself against the vault props as they
    // stand there now, not against a cached copy a delete or recreate may have outdated.
    await this.#refresh()
    const unlocked = this.#closed ? null : await this.#settleUnlock(proof)
    const tookUp = unlocked !== null && await this.#grantLease(unlocked, unlocked.standing, this.#deadlineFromNow(), overtaken)
    this.#settle()
    if (tookUp) { return }
    // A close() meanwhile is said as such: the handle, not the vault, is what refuses now.
    this.#checkOpen()
    if (overtaken?.aborted === true) {
      throw new VaultError('vault_locked', 'The prompt ended while this proof was being checked -- a lock landed, or it was answered -- and its end wins: nothing was unlocked. Ask again when the user wants the vault.')
    }
    throw new VaultError('vault_locked', 'The vault was removed, or its ways in changed, while this unlock was under way: nothing was unlocked, and this device keeps no lease. Unlock again to carry on.')
  }
  // --

  // == [Unlock and ways in]: unwrapWith, draftVaultProps, settleUnlock, standDownCreates, reviseWayins, raiseMarkAfter, checkStrongEnough, newStamp

  /**
   * The vaultKey out of `standing`'s way in of `proof`'s kind -- the passphrase, or the passkey --
   * whose refusal IS the passphrase (or passkey) check. Kind 'absent_wayin' for a passkey's answer
   * to a vault with no passkey.
   */
  async #unwrapWith(standing: VaultProps, proof: Proof): Promise<VaultKeyPair> {
    const { passphrase, passkey } = this.#wayinsOf(standing)
    const wayin = proof.kind === 'passphrase' ? passphrase : passkey
    if (wayin === null) {
      throw new VaultError('absent_wayin', "This vault has no passkey: it may have been removed on another device. Unlock with the passphrase.")
    }
    return valOf(await wayin.tryOpen(proof))
  }

  /**
   * Brand-new vault props around a brand-new vaultKey, wrapped under `passphrase`: their one way
   * in, sealed by this device under `deviceId`; no passkey.
   */
  async #draftVaultProps(passphrase: PassphraseProof, deviceId: string): Promise<{ draft: VaultProps } & VaultKeyPair> {
    const identity = { vault_id: randomId(), registered_at: this.#clockNow(), vault_key_epoch: FirstVaultKeyEpoch }
    const freshKey = await makeVaultKey()
    const stamp: WayinStamp = {
      vault_key_epoch: FirstVaultKeyEpoch,
      device_id:       deviceId,
      registered_at:   identity.registered_at,
    }
    const { wayin, sessionKey } = await Wayin.seal(this, passphrase, identity, stamp, freshKey)
    const draft: VaultProps = {
      format:              'safebyok-vault-v5',
      ...this.#scope,
      ...identity,
      unlock_epoch:        1,
      passphrase:          wayin.props,
      passkey:             null,
    }
    return { draft, transientKey: freshKey, sessionKey }
  }

  /**
   * The vaultKey for an unlock, and the vault props it was proven against: creating the vault when
   * absent, proving the proof when not. A passkey's never creates: a vault is created with a
   * passphrase.
   */
  async #settleUnlock(proof: Proof): Promise<{ standing: VaultProps } & VaultKeyPair> {
    if (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps) {
      if (! (proof instanceof PassphraseProof)) {
        throw new VaultError('absent_vault', 'This vault has not been created yet, so no passkey opens it: the first unlock(), with a passphrase, creates it.')
      }
      await this.#checkStrongEnough(proof.passphrase, 'unlock')
      const deviceId = randomId()
      const { draft, transientKey, sessionKey } = await this.#draftVaultProps(proof, deviceId)
      this.#drafted = { vault_id: draft.vault_id, device_id: deviceId }
      // Another device's vault, if one was made meanwhile, is held to the mark as it was before it.
      const seenBefore = this.#checkedMark(valOf(await this.#deviceDB.getMark(this.#scope)))
      const revoked = this.#createsStandDown.signal
      const settled = frozenVaultProps(await damagedAs(this.#vaultDB.ensureVaultProps(draft), damagedVaultProps))
      const mark = await this.#heedMark(settled, { seenBefore, call: 'unlock' })
      // Vault props a read took up meanwhile are not put back: should they differ, the grant that
      // follows finds these outrun, and takes nothing up. Nor are these put back once a read has
      // found vault props deleted or replaced while they were written: no vault in hand then may
      // be these, deleted, and the grant finds them outrun too.
      if (! revoked.aborted && (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps)) {
        this.#vaultProps = settled
        this.#deviceMark = mark
      }
      if (settled.vault_id === draft.vault_id) { return { standing: settled, transientKey, sessionKey } }
      // Another device created the vault between our look and our write: the settled vault props are
      // theirs, and this passphrase must prove itself against them like any other.
      try {
        return { standing: settled, ...await this.#unwrapWith(settled, proof) }
      } catch (err) {
        if (isVaultError(err, 'wrong_passphrase')) { await this.#refuseCreatedElsewhere(err) }
        throw err
      }
    }
    const standing = this.#vaultProps
    return { standing, ...await this.#unwrapWith(standing, proof) }
  }

  // Aborted, and made anew, at each revocation a read takes up (see takeStorage): a first unlock
  // creating the vault holds the signal standing as it writes its vault props, and once that is
  // aborted, it puts none back, as "no vault in hand" may then be its own vault, deleted elsewhere.
  // One signal serves every create under way, however many.
  #createsStandDown = new AbortController()

  /** Have every first unlock's create under way stand down: a read has found vault props deleted or replaced. */
  #standDownCreates() {
    this.#createsStandDown.abort()
    this.#createsStandDown = new AbortController()
  }

  /**
   * Rewrite the vault's ways in: prove `proof`, the standing passphrase, against the vault props as
   * storage holds them now, write the ways in `revise` makes of the standing ones under the next
   * unlock epoch, and take up the unlock under it, the lease starting again from now. `check` runs
   * first, on the standing vault props, so a change refused for what it asks costs no key
   * derivation.
   *
   * Every change to the ways in goes through here: the proof first, and the write only if no other
   * device changed them meanwhile.
   */
  async #reviseWayins(
    proof: PassphraseProof,
    plan: {
      call:    'putWayin' | 'delWayin'
      check?:  (standing: VaultProps) => void
      // Runs once the proof holds, given this device's id for the vault.
      revise:  (standing: VaultProps, proven: VaultKeyPair, deviceId: string) => StandingWayins | Promise<StandingWayins>
    },
  ): Promise<void> {
    await this.#hello()
    // The proof is made against the vault props as the backend holds them now: a cached copy could
    // bury props written elsewhere under a different vault_id entirely.
    await this.#refresh()
    const standing = this.#currentVaultProps()
    const deviceId = this.#deviceIdFor(standing)
    plan.check?.(standing)
    const proven = await this.#unwrapWith(standing, proof)
    const next = frozenVaultProps({
      ...standing,
      unlock_epoch:     standing.unlock_epoch + 1,
      ...await plan.revise(standing, proven, deviceId),
    })
    await this.#refreshOnStale(this.#vaultDB.putVaultProps(next, { vault_id: standing.vault_id, unlock_epoch: standing.unlock_epoch }), plan.call)
    // The change has landed, whatever happens now: what follows is this device's own, and a
    // failure of it is said through the logger, never thrown as though the change had not landed.
    const raised = await this.#raiseMarkAfter(next, plan.call)
    // A read that took up other vault props meanwhile -- this change's own, or a later one from
    // elsewhere -- is not undone: should they differ from these, the grant below takes nothing up.
    if (! this.#outrun(standing)) {
      this.#deviceMark = raised
      this.#vaultProps = next
    }
    try {
      await this.#grantLease(proven, next, this.#deadlineFromNow())
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands as it stood here, and asks for the passphrase at its next open.", { call: plan.call }, asError(err))
    }
    this.#settle()
  }

  /**
   * This device's mark raised to `next`, vault props its own write just landed: never a refusal, as
   * newer ones seen meanwhile stand. A device store that fails to keep it is said through the
   * logger, and the mark is held in memory as raised: a missed mark only weakens the rollback
   * check until a later read raises it.
   */
  async #raiseMarkAfter(next: VaultProps, call: VaultCall): Promise<DeviceMark> {
    try {
      return await this.#raiseMark(await this.#keptMark(call), next)
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not note it in its mark of the vault: the change stands, and the mark catches up at a later read.", { call }, asError(err))
      return this.#markSeeing(this.#deviceMark, next)
    }
  }

  /**
   * `passphrase` put to the vault's strength checker, refused as `checkStrongEnough` says. Before
   * the first passphrase the unchosen checker refuses, the logger hears, once, that the host must
   * choose one.
   */
  async #checkStrongEnough(passphrase: string, call: VaultCall) {
    if (this.#strengthChecker === UnchosenStrengthChecker && ! this.#unchosenCheckerSaid) {
      this.#unchosenCheckerSaid = true
      this.#logger.error(UnchosenCheckerSaid, { call })
    }
    await checkStrongEnough(this.#strengthChecker, passphrase, this.#scope)
  }

  /**
   * The stamp of a way in this device seals into `standing` now: around the vaultKey the vault
   * props stand for, under this device's id for the vault.
   */
  #newStamp(standing: VaultProps, deviceId: string): WayinStamp {
    return {
      vault_key_epoch: standing.vault_key_epoch,
      device_id:       deviceId,
      registered_at:   this.#clockNow(),
    }
  }
  // --

  // == [Locking and expiry]: shut, heedRefusal, forgetVaultProps, dropKey, armExpiry, outrun, others

  /** Forget the unlock, in memory and on this device: every lock goes through here. */
  async #shut() {
    this.#dropKey()
    valOf(await this.#deviceDB.delLease(this.#scope))
  }

  /** {@link shut}, and the snapshot told, even when the device store fails: the key is dropped at once. */
  async #shutAndSay() {
    try {
      await this.#shut()
    } finally {
      this.#settle()
    }
  }

  /**
   * Do what the refusal policy says of a refusal, before it is thrown: for storage the vault
   * cannot trust -- a user no longer signed in, an older copy of the vault -- lock, as `lock()`
   * does. The refusal is what the caller must hear, so a device store that will not erase the
   * lease is only logged.
   */
  async #heedRefusal(refusal: VaultError) {
    if (UntrustedStorageKinds.some((kind) => isVaultError(refusal, kind))) { this.#forgetHello() }
    if (RefusalPolicy.decide(refusal) !== 'lock') { return }
    const why = refusal.refusalkind === 'rolled_back'
      ? 'Storage handed back an older copy of the vault than this device has seen'
      : 'Storage no longer serves the user this vault was opened for -- signed out, or another user signed in --'
    const wasUnlocked = this.#vaultKey !== null
    // An older copy refused, the vault props in hand are forgotten too, before any wait: the next
    // hello takes up what storage holds, once the host has accepted it (see the class doc). The
    // older copy is never taken for a stale read of these.
    if (refusal.refusalkind === 'rolled_back') { this.#forgetVaultProps() }
    try {
      await this.#shut()
    } catch (err) {
      this.#logger.warn(`${why} so the vault locked, but this device's lease could not be revoked: the next vault made on this device, as at the next page load, may take it up.`, { call: 'untrustedStorage' }, asError(err))
    }
    this.#settle()
    if (wasUnlocked) {
      this.#logger.log(`${why} so the vault locked, as it always does when storage cannot be trusted with it. It asks for the passphrase again once storage is sound.`, { call: 'untrustedStorage' })
    }
  }

  /**
   * Forget the vault props in hand, as though storage had not been read, with their mark and their
   * boxes; any first unlock's create stands down, so puts none back.
   */
  #forgetVaultProps() {
    this.#vaultProps = UnreadVaultProps
    this.#deviceMark = null
    this.#boxes = []
    this.#standDownCreates()
  }

  /** Forget the unlock in memory, and the timer left to do so; a lease take-up under way stands down. */
  #dropKey() {
    this.#cancelPendingShut()
    this.#standDownTakeUp()
    this.#vaultKey = null
    this.#lease = null
  }

  #cancelPendingShut() {
    if (this.#pendingShut === null) { return }
    clearTimeout(this.#pendingShut)
    this.#pendingShut = null
  }

  /** Drop the vaultKey now, and say so: what the expiry's timer does when it rings. */
  #dropNow() {
    this.#dropKey()
    this.#settle()
  }

  /**
   * Arm the expiry for a key taken up until `until`, at `now`, in place of any pending: one timer,
   * which drops the key at the deadline, unless the key lasts until `lock()`.
   */
  #armExpiry(until: number, now: number) {
    this.#cancelPendingShut()
    if (isFarFuture(until)) { return }
    this.#pendingShut = unrefTimeout(() => { this.#dropNow() }, until - now)
  }

  /**
   * True when the handle has closed, or the vault props standing now are no longer the ones
   * `standing` proved a passphrase against: deleted, made anew, or their wayins changed, here or
   * elsewhere.
   */
  #outrun(standing: VaultProps) {
    return this.#closed || this.#movedOn(standing)
  }

  /**
   * True when the vault props standing now are no longer `standing`: deleted, made anew, or their
   * ways in changed, here or elsewhere. {@link outrun} without the close.
   */
  #movedOn(standing: VaultProps) {
    return this.#vaultProps === null || this.#vaultProps === UnreadVaultProps
    || this.#vaultProps.vault_id !== standing.vault_id || this.#vaultProps.unlock_epoch !== standing.unlock_epoch
  }
  // --

  // == [Lease]: deadlineFromNow, grantLease, fetchLease, takeUp, standDownTakeUp, takeUpLease, discardLease

  /**
   * The deadline of an unlock taken up now: `leaseHours` from now. The lease renews whenever the
   * user proves who they are, in any call: an `unlock()` by passphrase or passkey, or a change to
   * the ways in, which the passphrase proves. Every proof passes through here, and nothing else
   * -- a read, a store, a refresh -- moves the deadline.
   */
  #deadlineFromNow(): number {
    return deadlineAfter(this.#clockNow(), this.#leaseMillis)
  }

  /**
   * Grant this device a lease and take up the vaultKey until `until`, arming the expiry anew --
   * unless the handle has closed, the vault props the key was proven against no longer stand, or
   * `overtaken` (an ask's attempt, which its prompt's end stands down) is aborted: then nothing is
   * taken up, and the lease, should it have been written already, is erased -- a deleted vault
   * keeps no lease on this device, even should storage later bring it back. The lease is
   * `Lease.grant`'s, a fresh leaseKey and the vaultKey wrapped under it; the write is the vault's.
   * A close alone erases nothing: a close is no lock, and the next open takes the lease up.
   *
   * @returns True when the vault is now unlocked.
   */
  async #grantLease(unlocked: VaultKeyPair, standing: VaultProps, until: number, overtaken?: AbortSignal): Promise<boolean> {
    // Asked afresh after each wait: a lock may land during any of them.
    const isOvertaken = () => overtaken?.aborted === true
    // What no lease may outlast: a prompt that ended under an ask's attempt -- a lock, an answer --
    // or the vault props deleted, made anew or changed.
    const isVoided = () => isOvertaken() || this.#movedOn(standing)
    const isOutrun = () => this.#closed || isVoided()
    if (isOutrun()) { return false }
    // A take-up under way stands down before this lease is written, not after: one that read an
    // older lease could otherwise erase this one as it discards that.
    this.#standDownTakeUp()
    // The transient's last act: wrapped into this device's lease, then dropped.
    const lease = await Lease.grant(this, standing, unlocked, until)
    // Asked again before the write: the prompt may have ended, or the props moved on, while the key was wrapped.
    if (isVoided()) { return false }
    valOf(await this.#deviceDB.putLease(lease.props))
    // Voided while the lease was written: it is erased, and a hello's take-up that may have read it
    // meanwhile stands down, taking nothing up.
    if (isVoided()) {
      this.#standDownTakeUp()
      valOf(await this.#deviceDB.delLease(this.#scope))
    }
    if (isOutrun()) { return false }
    this.#armExpiry(until, this.#clockNow())
    this.#vaultKey = unlocked.sessionKey
    this.#lease = lease
    return true
  }

  /**
   * Fetch this device's lease, and take it up if it still fits and still opens: the vault is
   * then unlocked until the lease's askPassphraseAt, with no proof asked. Anything else leaves
   * the vault as it stands, and a lease that does not fit or open is discarded: erased. Runs once
   * the vault props are read, in hello(), and does nothing while
   * there are none. The deviceDB may be the host's own, so what it hands back is checked here,
   * whoever wrote it: a record that does not pass reads as "no lease", the safe failure.
   *
   * A lease whose deadline lies past what this handle's leaseHours allows from now was granted
   * under a longer setting, and does not fit either: lowering the option has each device ask
   * again at its next hello, and raising it lengthens no lease already granted. Nothing on this
   * path writes a record, so it can never bring back one that another tab's lock() erased
   * meanwhile. A handle closed while the lease opens takes nothing up, and neither does one whose
   * key was dropped or replaced meanwhile -- a lock(), del(), an unlock, the expiry -- which also
   * leaves the lease standing now alone: the key change that landed during the read wins. Nor does
   * one whose vault props were outrun meanwhile -- the vault deleted or made anew, or its ways in
   * changed, elsewhere -- though no key was held for that change to drop.
   */
  async #fetchLease() {
    this.#standDownTakeUp()
    const takeUp = new AbortController()
    this.#takeUp = takeUp
    try {
      await this.#takeUpLease(takeUp.signal)
    } finally {
      if (this.#takeUp === takeUp) { this.#takeUp = null }
    }
  }

  // The lease take-up under way, if any. Whatever drops or replaces the key -- a lock(), close(),
  // del(), an unlock, the expiry -- aborts it, and an aborted take-up writes nothing: the key change
  // that landed while the lease was read wins.
  #takeUp: AbortController | null = null

  /** Have a lease take-up under way stand down: a key change has landed since it began. */
  #standDownTakeUp() {
    this.#takeUp?.abort()
    this.#takeUp = null
  }

  /**
   * {@link fetchLease}'s work, against the vault props standing as it begins: writing nothing once
   * `overtaken` is aborted, or once those props no longer stand -- the vault deleted or made anew,
   * or its ways in changed (a new unlock_epoch), here or elsewhere, while no key is held to drop.
   */
  async #takeUpLease(overtaken: AbortSignal) {
    const standing = this.#vaultProps
    if (standing === UnreadVaultProps || standing === null) { return }
    // Asked afresh after each wait: a key change, or a refresh bringing new vault props, may land
    // during any of them.
    const isOvertaken = () => overtaken.aborted || this.#outrun(standing)
    const kept = valOf(await this.#deviceDB.getLease(this.#scope))
    // A key change since the read began makes what was read no lease to take up, nor to discard:
    // the lease standing now may be the one that change wrote.
    if (kept === null || isOvertaken()) { return }
    // A record that is no lease, or another vault's, is unreadable.
    const made = await outcomeOf(() => Lease.make(this, kept), unexpectedError)
    if (isOvertaken()) { return }
    if (! made.ok) {
      await this.#discardLease(made.err)
      return
    }
    const lease = made.val
    // Granted under a longer leaseHours than this handle's: it does not fit. Otherwise the lease
    // judges itself against the vault props standing, and the clock.
    const opened = lease.endsWithin(this.#leaseMillis) ? await lease.tryOpen(standing) : null
    // One overtaken is left alone, as the lease standing now may be the overtaking change's own,
    // and the next hello judges it against the vault props that stand then.
    if (isOvertaken()) { return }
    if (! opened?.ok) {
      await this.#discardLease(opened?.err ?? null)
      return
    }
    this.#armExpiry(lease.ask_passphrase_at, this.#clockNow())
    this.#vaultKey = opened.val
    this.#lease = lease
  }

  /**
   * Discard this device's lease, which did not fit or open, as `refusal` says, or under a longer
   * leaseHours (null). Expired, or outdated by a change to the wayins or a shorter setting, is
   * routine; a lease that would not read or open is worth a word, said once the record is erased,
   * so it never claims a discard that failed. Neither the record nor what it failed is told: the
   * record holds key material.
   */
  async #discardLease(refusal: VaultError | null) {
    valOf(await this.#deviceDB.delLease(this.#scope))
    if (refusal === null || refusal.refusalkind === 'vault_locked') { return }
    this.#logger.warn("This device's lease could not be read or would not open, so it was discarded: the vault opens locked, and asks for the passphrase again.", { call: 'hello' })
  }
  // --

  // == [Box limits]: boxWeight, capacity, checkWhisperFits, checkRoomFor

  /**
   * What one box counts for against the vault's storage: room for a whisper and sidecar of
   * `maxWhisperBytes` together (twice that, as {@link StoredBytesPerWhisperByte} says), its
   * fixed-size fields, and its scope and boxlabel as measured, so names of any length are counted
   * as they are.
   */
  #boxWeight(boxlabel: string) {
    return (this.#whisperByteLimit * StoredBytesPerWhisperByte) + BoxFixedBytes + jsonBytes([this.#scope, boxlabel])
  }

  /** The room the vault has, reckoned from the boxes last listed, as `checkRoomFor` reckons it. */
  #capacity(): Capacity {
    const bytesUsed = this.#boxes.reduce((sum, box) => sum + this.#boxWeight(box.boxlabel), 0)
    return {
      boxes: { used: this.#boxes.length, max: this.#boxLimit },
      bytes: { used: bytesUsed, max: this.#vaultByteLimit },
    }
  }

  /**
   * Refuse a whisper whose JSON, with the sidecar's beside it, is over `maxWhisperBytes`: kind
   * 'whisper_too_large', quoting neither.
   */
  #checkWhisperFits(whisperBytes: Uint8Array, sidecarJson: string) {
    const sidecarBytes = new TextEncoder().encode(sidecarJson).length
    if (whisperBytes.length + sidecarBytes <= this.#whisperByteLimit) { return }
    throw new VaultError('whisper_too_large', `That whisper and its box's sidecar are over this vault's limit of ${String(this.#whisperByteLimit)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Vault.make.`)
  }

  /**
   * Refuse a write that would crowd the vault: a new box while it holds `maxBoxes`, or one
   * that would take the vault past its storage's `maxVaultBytes` (each weighed by
   * {@link boxWeight}). Counted from the snapshot's boxes, which every write and
   * every change pushed from storage refreshes, so a store costs no extra read of the whole vault;
   * a vault that looks full is caught up with storage before it is refused.
   */
  async #checkRoomFor(boxlabel: string, prev: Box | null) {
    // A replacement weighs what it replaces, so it never makes the vault fuller: it always lands.
    if (prev !== null) { return }
    const weight = this.#boxWeight(boxlabel)
    const crowding = () => {
      const others = this.#boxes.filter((box) => box.boxlabel !== boxlabel)
      if (others.length >= this.#boxLimit) { return 'count' }
      const othersWeight = others.reduce((sum, box) => sum + this.#boxWeight(box.boxlabel), 0)
      return othersWeight + weight > this.#vaultByteLimit ? 'bytes' : null
    }
    if (crowding() === null) { return }
    await this.#refresh()
    const crowded = crowding()
    if (crowded === 'count') {
      throw new VaultError('vault_full', `This vault already holds its limit of ${String(this.#boxLimit)} boxes: remove one before storing another. A vault meant to hold more can be opened with a larger maxBoxes, up to what its storage adapter allows.`)
    }
    if (crowded === 'bytes') {
      throw new VaultError('vault_full', `This vault has no room for that box in the ${String(this.#vaultByteLimit)} bytes its storage holds of one vault, counting each box's boxlabel and room for a whisper and sidecar of maxWhisperBytes: remove a box, or store under a shorter boxlabel.`)
    }
  }
  // --

  // == [Reading boxes]: checkStandingBoxlabel, checkListed, getBoxOrThrow, boxFrom, openBox, decipherOrCatchUp

  /**
   * `boxlabel`, once a box stands under it, for delBox(), which reaches a box by the name it
   * was stored under: a record that fails verification still stands, and so does one stored under
   * a name the vault's boxlabel check refuses (by another client, or under other checks). Storage
   * is read once.
   */
  async #checkStandingBoxlabel(boxlabel: string): Promise<string> {
    const label = Names.checkFloor('boxlabel', boxlabel)
    if (await this.#getBoxOrDamaged(label) === null) { throw this.#nothingUnder(label) }
    return label
  }

  /**
   * The revision the snapshot's listing names for the box under `boxlabel`, sound or damaged;
   * null for none listed, or a damaged record that holds none. Storage arbitrates a write that
   * names it, so a listing gone stale costs a refusal and a second store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#boxes.find((box) => box.boxlabel === boxlabel)?.revision_tok ?? null }

  /** True when the snapshot's listing shows the box under `boxlabel` as damaged. */
  #isListedDamaged(boxlabel: string): boolean { return this.#boxes.some((box) => box.boxlabel === boxlabel && box.damaged) }

  /**
   * Refuses `boxlabel`, a name above the floor, when the listing in hand shows no box under it,
   * sound or damaged, as {@link #nothingUnder} says: what a locked vault can know before it asks
   * for a proof. Storage is not read again: the listing is as fresh as the host's `staleMinutes`
   * keeps it.
   */
  #checkListed(boxlabel: string) {
    if (this.#boxes.every((box) => box.boxlabel !== boxlabel)) { throw this.#nothingUnder(boxlabel) }
  }

  /** The box under `boxlabel`; null when there is none, and 'damaged' when its record fails verification. */
  async #getBoxOrDamaged(boxlabel: string): Promise<Box | 'damaged' | null> {
    try {
      const record = await this.#vaultDB.getBox(this.#scope, boxlabel)
      return record === null ? null : this.#boxFrom(record)
    } catch (err) {
      if (! isVaultError(err, 'corrupt_record')) { throw err }
      return 'damaged'
    }
  }

  async #getBoxOrThrow(boxlabel: string): Promise<Box> {
    const label = Names.checkFloor('boxlabel', boxlabel)
    const record = await damagedAs(this.#vaultDB.getBox(this.#scope, label), damagedBox)
    if (record === null) { throw this.#nothingUnder(label) }
    return this.#boxFrom(record)
  }

  /**
   * The box `record` makes, under the vault props in hand, for a call that holds the key: a
   * refresh that found the vault gone while storage was read took the key with them, and the
   * call refuses as locked, never as absent.
   */
  #boxFrom(record: BoxRecord): Box {
    this.#checkUnlocked()
    return Box.make(this, record, this.#currentVaultProps())
  }

  /**
   * Why nothing stands under `boxlabel`, a name above the floor: kind 'bad_label' when the vault's
   * boxlabel check refuses it -- the name was never one this app would store under -- and
   * 'absent_box' otherwise. The host's check runs here, once, only when storage holds nothing
   * under the name: a box stored under a name it refuses reads and deletes as any other.
   */
  #nothingUnder(boxlabel: string): VaultError {
    Names.check(this.#rules, 'boxlabel', boxlabel)
    return absentBox()
  }

  /**
   * The whisper in `boxlabel`, for an operation that wants it whole: deciphered under the key in
   * hand once storage answers, and handed back only while a key is still in hand. A lock or a
   * close() that has taken the key meanwhile refuses the call as locked, or as closed.
   */
  async #openBox(boxlabel: string): Promise<Whisper> {
    this.#checkOpen()
    const label = Names.checkFloor('boxlabel', boxlabel)
    // Checked before the user is asked for anything: a call that cannot land never prompts.
    await this.#ensureLease(0, () => { this.#checkListed(label) })
    const box = await this.#getBoxOrThrow(label)
    const whisper = await this.#decipherOrCatchUp(this.#checkUnlocked(), box)
    this.#checkUnlocked()
    return whisper
  }

  /**
   * The whisper `box` holds, or -- for one that will not open under the key in hand -- one
   * catch-up with storage before the kind is named: a vault deleted and made anew elsewhere, or
   * its ways in changed, relocks this device, and the call refuses as 'vault_locked'; otherwise
   * the box is 'damaged_box'. A catch-up that fails is thrown as it came: whether the box
   * is damaged is not known.
   */
  async #decipherOrCatchUp(unlockedKey: CryptoKey, box: Box): Promise<Whisper> {
    const { ok, val: whisper, err } = await box.tryOpen(unlockedKey)
    if (ok) { return whisper }
    if (err.refusalkind !== 'damaged_box') { throw err }
    await this.#refresh()
    this.#checkUnlocked()
    throw err
  }
  // --

  // == [Writing boxes]: writeOver, refuseStalePutBox, refuseCreatedElsewhere

  /**
   * Write `box` over `expected`, as `putBox()` does: one write, which storage refuses unless
   * the revision `expected` names still stands. One attempt: a refusal is thrown as
   * {@link refuseStalePutBox} says.
   */
  async #writeOver(box: Box, expected: BoxExpectation): Promise<void> {
    try {
      await this.#refreshOnStale(this.#vaultDB.putBox(this.#scope, expected, box.props), 'putBox')
    } catch (err) {
      this.#refuseStalePutBox(err)
    }
  }

  /**
   * Throw `err`, what a `putBox()`'s write met, as its refusal. Storage's `invalid_box` is kind
   * 'bad_record', since this vault sealed the box. A refusal as stale, or as for vault props that no
   * longer stand, that {@link refreshOnStale} has caught this device up after becomes kind
   * 'vault_locked' when that catch-up relocked this device (a vault reborn, or its ways in changed,
   * elsewhere); otherwise kind 'stale_write', saying nothing was written and the vault now shows
   * storage as it stands, the adapter's refusal its cause and its `meta.box_stored` carried on.
   * Anything else, a catch-up that failed among it, is thrown as it came.
   */
  #refuseStalePutBox(err: unknown): never {
    if (isVaultError(err, 'invalid_box')) {
      throw new VaultError('bad_record', 'Storage refused the box this vault sealed as one this package would not build, so nothing was written. This is a bug: report it, with this error.', { cause: err })
    }
    if (! this.#isCaughtUpStale(err)) { throw err }
    this.#checkUnlocked()
    if (err.refusalkind === 'vault_mismatch') {
      throw new VaultError('stale_write', 'The vault changed in storage while this device was storing into it, so nothing was written. This device has caught up with storage: call putBox() again if this whisper should still be stored.', { cause: err })
    }
    const meta = err.meta?.box_stored === undefined ? {} : { meta: { box_stored: err.meta.box_stored } }
    throw new VaultError('stale_write', 'That box was written or removed on another device or tab while this one was storing into it, so nothing was written. This device has caught up with storage, and the vault now shows the box as storage holds it: call putBox() again if this whisper should still replace what is there.', { cause: err, ...meta })
  }

  /**
   * Throw kind 'created_elsewhere', for a first unlock whose passphrase `wrong` refused against the
   * vault another device created meanwhile. The vault props were taken up as storage handed them
   * back; this catches the rest of the snapshot up with storage (its boxes), so that it shows
   * the vault as that device made it, `locked`. A catch-up that fails is warned of, and the
   * snapshot says `syncing: false`; but for one refused as untrusted storage, thrown as it came.
   */
  async #refuseCreatedElsewhere(wrong: VaultError): Promise<never> {
    try {
      await this.#refresh()
    } catch (err) {
      this.#logger.warn('A catch-up with storage, after a vault was found created on another device, failed: what the vault shows may lag behind storage (syncing: false) until a read succeeds.', { call: 'unlock' }, asError(err))
      this.#hearBadNews(err)
      if (UntrustedStorageKinds.some((kind) => isVaultError(err, kind))) { throw err }
    }
    throw new VaultError('created_elsewhere', 'A vault was just created for this label on another device, with a different passphrase than the one you entered. Nothing was created on this device. Enter the passphrase you chose there to unlock it.', { cause: wrong })
  }
  // --

  // == [Catching up]: refreshOnStale, catchUp, watchRefresh, unsubscribeDB

  /**
   * `write`, with a refusal as stale (or a box write's `vault_mismatch`) catching this device up with storage before it is thrown --
   * once, before the kind is named: the snapshot then shows what beat the write, and a vault
   * reborn elsewhere, or its ways in changed, relocks this device. A catch-up that fails is
   * thrown as 'stale_write' too, its failure the cause, the snapshot saying `syncing: false` --
   * but for a catch-up refused as 'identity_revoked', 'rolled_back' or 'newer_format', which is
   * thrown as it came: each asks something else of the caller than a stale write does. A write
   * that lands resolves as it came.
   */
  async #refreshOnStale<WrittenT>(write: Promise<WrittenT>, call: VaultCall): Promise<WrittenT> {
    try {
      return await write
    } catch (err) {
      if (! isCatchingUpKind(err)) { throw err }
      await this.#catchUp(err, call)
      throw err
    }
  }

  /**
   * True for a refusal as stale that the catch-up after it has caught up with: what `putBox()` and
   * `delBox()` say as what happened to the box. One whose catch-up failed says that instead.
   */
  #isCaughtUpStale(err: unknown): err is VaultError { return isCatchingUpKind(err) && this.#syncing }

  /** One refresh after `refusal`, a write storage refused as stale; one that fails is said as {@link refreshOnStale} says. */
  async #catchUp(refusal: VaultError, call: VaultCall) {
    try {
      await this.#refresh()
    } catch (err) {
      this.#logger.warn('A catch-up with storage, after a write it refused as stale, failed: what the vault shows may lag behind storage (syncing: false) until a read succeeds.', { call }, asError(err))
      // Bad news the catch-up met is told, even where the write names it only as its cause.
      this.#hearBadNews(err)
      if (UntrustedStorageKinds.some((kind) => isVaultError(err, kind))) { throw err }
      // What the refused write learned of storage (a box write's box_stored) still holds: no read replaced it.
      const learned = refusal.meta === undefined ? {} : { meta: refusal.meta }
      throw new VaultError('stale_write', `${refusal.message} Catching up with storage afterwards failed too, so what the vault shows may be behind it: this error's cause says why.`, { cause: err, ...learned })
    }
  }

  // Watch the backend so boxes written elsewhere (another tab, the inspector's reset button)
  // show up without a manual refresh: by a hello, while none has succeeded or what it read no
  // longer stands, so a lease is taken up as the vault settles. A failing background read has
  // nobody to throw to, so it leaves the snapshot standing, saying `syncing: false`, tells any bad
  // news it met, and warns once for a failing streak; the next read that succeeds says so once.
  async #watchRefresh() {
    try {
      await (this.#greeting === null ? this.#hello() : this.#refresh())
    } catch (err) {
      this.#hearBadNews(err)
      if (this.#watchWarned) { return }
      this.#watchWarned = true
      this.#logger.warn('Storage rang with a change the vault could not read, so what it shows may lag behind storage (syncing: false). It says nothing more of this until a read succeeds; its next call meets the same trouble, and throws it.', { call: 'refresh' }, asError(err))
    }
  }
  // The adapter's watch on the vault, which the first hello starts and close() ends, and whether
  // it was begun.
  #unsubscribeDB: (() => void) | null = null
  #watching = false
  // --

  // == [Two forms]: trying, throwing

  /**
   * `body`, as a public `tryX` makes it: its outcome, a throw that is no VaultError said as
   * `unexpected_error`, and the bad news it refuses with told before the outcome resolves. Every
   * public call that reaches storage is made through here, the throwing form through it too.
   */
  #trying<ArgsT extends unknown[], ValT>(body: (...args: ArgsT) => Promise<ValT>): (...args: ArgsT) => Promise<Outcome<ValT>> {
    return async (...args) => {
      // Never logged: a host's function that threw (a key deriver) may have been handed a passphrase.
      const outcome = await outcomeOf(() => body(...args), unexpectedError)
      if (! outcome.ok) { this.#hearBadNews(outcome.err) }
      return outcome
    }
  }

  /** `tryCall`'s throwing form: its `val`, or its `err` thrown. */
  #throwing<ArgsT extends unknown[], ValT>(tryCall: (...args: ArgsT) => Promise<Outcome<ValT>>): (...args: ArgsT) => Promise<ValT> {
    return async (...args) => valOf(await tryCall(...args))
  }
  // --

  // == [Bad news]: hearBadNews, tellBadNews, tellListingNews, tellWayinNews, handlerThrew

  // Bad news already told, so a refusal several callers share, or met again on its way out, is told once.
  readonly #told = new WeakSet<VaultError>()

  /** Tell `err`, when it is bad news not told yet, and publish it as the trouble. */
  #hearBadNews(err: unknown) {
    if (! isVaultError(err) || err.family !== 'bad_news' || this.#told.has(err)) { return }
    this.#tellBadNews(err)
    this.#settle()
  }

  /**
   * Keep `news` as the trouble and hand it to the host's handler, never awaited: what it throws,
   * or its promise rejects with, becomes the trouble in its place. Publishes nothing: the caller
   * settles.
   */
  #tellBadNews(news: VaultError) {
    this.#told.add(news)
    this.#trouble = news
    if (this.#onBadNews === null) { return }
    try {
      // Any answer is heard out, a thenable or another realm's promise among them: none is awaited.
      void this.#heedLateThrow(this.#onBadNews(news))
    } catch (err) {
      this.#handlerThrew(err)
    }
  }

  /** What an async handler's answer rejects with, once it does, kept as the trouble and published. */
  async #heedLateThrow(answer: unknown) {
    try {
      await Promise.resolve(answer)
    } catch (err) {
      this.#handlerThrew(err)
      this.#settle()
    }
  }

  /**
   * Tell each box the listing, published already, shows damaged that `shown`, the listing before
   * it, did not show damaged at the same revision: one `damaged_box` news apiece, `meta.box_listed`
   * the box, and the trouble published once all are told. The read that lists them succeeds all
   * the same.
   */
  #tellListingNews(shown: readonly (BoxSummary | DamagedBox)[]) {
    const wasShown = (box: DamagedBox) => shown.some((was) => was.damaged && was.boxlabel === box.boxlabel && was.revision_tok === box.revision_tok)
    const news = this.#boxes.filter((box): box is DamagedBox => box.damaged && ! wasShown(box))
    if (news.length === 0) { return }
    for (const box of news) {
      this.#tellBadNews(new VaultError('damaged_box', "A box in this vault is stored damaged, so it can't be read: this error's meta.box_listed names it. It was left as it is; remove it with delBox(), or store its whisper again over it.", { meta: { box_listed: box } }))
    }
    this.#settle()
  }

  /**
   * Tell each of `damaged`, the ways in a read of the vault props found damaged, that `shown`, the
   * ways in published before it, did not already show damaged as stored alike: one `damaged_wayin`
   * news apiece, `meta.wayin_listed` its summary, and the trouble published once all are told. The
   * read that found them succeeds all the same, and the other way in, if any, opens as ever.
   */
  #tellWayinNews(damaged: readonly Wayin[], shown: readonly Wayin[]) {
    const wasShown = new Set(shown.filter((wayin) => wayin.isDamaged()).map((wayin) => stableJsonify(wayin.props)))
    const news = damaged.filter((wayin) => ! wasShown.has(stableJsonify(wayin.props)))
    if (news.length === 0) { return }
    for (const wayin of news) {
      this.#tellBadNews(new VaultError('damaged_wayin', "A way into this vault is stored damaged, so it can't be tried: this error's meta.wayin_listed names it. The other way in, if the vault has one, still opens it. A damaged passkey is mended by adding the passkey again; a damaged passphrase only by removing the vault and making it again.", { meta: { wayin_listed: wayin.summary } }))
    }
    this.#settle()
  }

  /** What the host's `onBadNews` threw, kept as the trouble, and told to the logger and the platform. */
  #handlerThrew(err: unknown) {
    this.#trouble = new VaultError('bad_option', "The onBadNews handler passed to Vault.make threw as it was told of bad news: fix the handler. What it threw is this error's cause. The call that met the news went on as it would have.", { cause: err })
    this.#logger.error("The onBadNews handler threw as it was told of bad news: the vault's trouble keeps what it threw. The call that met the news went on as it would have.", { call: 'onBadNews' }, asError(err))
    reportToPlatform(err)
  }
  // --
}

// == [Refusals]: damagedAs, damagedVaultProps, damagedBox, lockedError, declinedError, closedError

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

const damagedVaultProps = (opts: ErrorOptions) => new VaultError('damaged_vault', "This vault's stored record is damaged, so no passphrase or passkey can be tried against it, and it can't be opened. It was left as it is: the app's support may be able to restore it.", opts)

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
const damagedBox = (opts: ErrorOptions) => new VaultError('damaged_box', "That box is stored damaged, so it can't be read. It was left as it is; remove it, or store its whisper again over it.", opts)

const damagedBeyondNaming = () => new VaultError('damaged_box', "That box is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with delBox() first, then store its whisper again.")

const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call again, and the vault asks for a proof through getProof, or unlock it first.')

/** The refusal of a call whose ask was declined: by the user, or for want of a `getProof` to ask. */
const declinedError = (asked: boolean) => new VaultError('vault_locked', asked
  ? 'The vault is locked, and the user declined to unlock it: nothing was read or written. Ask again when they want the vault.'
  : 'The vault is locked, and there is no getProof to ask the user for a proof (Vault.make was given none): nothing was read or written. Prompt the user, unlock() with their passphrase, and call again.')

const closedError = () => new VaultError('vault_closed', 'This vault handle was closed: make another with Vault.make.')
// --

// == [Vocabulary]: frozenVaultProps, isUnderHeldKey, isNewerCopy, asDamaged, MarkFormat, VaultCall, UntrustedStorageKinds, isCatchingUpKind

/**
 * A copy of `props`, frozen through its ways in: what the vault holds as its vault props, so the
 * very object its ways in and boxes lie under, and its snapshot shows, is one no host can write to.
 */
const frozenVaultProps = (props: VaultProps): VaultProps => Object.freeze({
  ...props,
  passphrase: frozenRecord(props.passphrase),
  passkey:    props.passkey === null ? null : frozenRecord(props.passkey),
})

/** The ways in of vault props, as a change to them writes them anew. */
type StandingWayins = Pick<VaultProps, 'passphrase' | 'passkey'>

/**
 * True when `box` lists as damaged already, or stands under the vaultKey `standing` holds. A
 * box under any other epoch opens under no key the vault holds.
 */
const isUnderHeldKey = (box: BoxSummary | DamagedBox, standing: VaultProps): boolean => (
  box.damaged || box.vault_key_epoch === standing.vault_key_epoch
)

/**
 * True when `inHand` is the vault `fresh` is, at a later `unlock_epoch` or `vault_key_epoch`:
 * `fresh` was read before a write of this device's own landed, and is an older copy. Storage
 * never takes a vault's epochs back (the device mark refuses a store that does, as
 * 'rolled_back'), so such a read stands for nothing, and never replaces what is in hand.
 */
const isNewerCopy = (inHand: VaultProps | null, fresh: VaultProps | null): boolean => (
  fresh !== null && inHand !== null && inHand.vault_id === fresh.vault_id
  && (fresh.unlock_epoch < inHand.unlock_epoch || fresh.vault_key_epoch < inHand.vault_key_epoch)
)

/** `box`, a box listed sound, as damaged: under its boxlabel and revision, nothing else of it trusted. */
const asDamaged = (box: BoxSummary | DamagedBox): DamagedBox => ({ boxlabel: box.boxlabel, damaged: true, revision_tok: box.revision_tok })

/** The device mark's format, as each mark carries it. */
const MarkFormat = 'safebyok-mark-v4'

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'make' | 'hello' | 'refresh' | 'unlock' | 'del' | 'untrustedStorage'
  | 'putWayin' | 'delWayin' | 'putBox' | 'delBox' | 'getBox'

/** The `vault_key_epoch` of a vault's first vaultKey, the one it is created with. */
const FirstVaultKeyEpoch = 1

/**
 * The refusals that say storage cannot be trusted as it stands, each asking the caller for
 * something a stale write does not -- the user to sign in again ('identity_revoked'; the vault has
 * locked), storage to be looked at ('rolled_back'; locked too), or the app to be updated
 * ('newer_format'). A write's catch-up with storage throws each as it came, never as
 * 'stale_write'; and each, whichever call met it, has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'rolled_back', 'newer_format'] as const satisfies readonly RefusalKind[]

/** True for a write's refusal that says storage moved under it, which the vault catches up after: 'stale_write', or a box write's 'vault_mismatch'. */
const isCatchingUpKind = (err: unknown): err is VaultError => isVaultError(err, 'stale_write') || isVaultError(err, 'vault_mismatch')
// --

// == [Argument parsers]: checkBagOrNone, checkHelloOpts, checkEnsureLeaseOpts, checkStoreOpts, sidecarJsonOf, standingPassphraseOf, newProofOf, absentBox

/**
 * `given`, once it is left out or a plain bag of options, as `call` takes: kind 'bad_option'
 * otherwise, saying how to wrap the call. What else comes is an event, almost always: `hello` or
 * `ensureLease` handed to `addEventListener` or `onClick` as the handler itself, which would
 * otherwise read the event as options, and reject where nothing hears it.
 */
const checkBagOrNone = <BagT>(given: BagT, call: 'hello' | 'ensureLease'): BagT => {
  if (given === undefined || isPlainBag(given)) { return given }
  const tried = call === 'hello' ? 'tryHello' : 'tryEnsureLease'
  throw new VaultError('bad_option', `${call}() takes a bag of options, or nothing, and was handed something else: an event, most likely, as ${call} was handed to addEventListener or onClick as the handler itself. Wrap it: \`() => { void vault.${tried}() }\`, whose refusal, being returned, never surfaces as an unhandled rejection.`)
}

/** What `hello()`'s options may hold: `staleMinutes`, which `parseStaleMinutes` checks, and nothing else. */
const checkHelloOpts = optionsCheck({ staleMinutes: Z.optional(Z.unknown()) }, "hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage: check its spelling, and leave out any other.")

/** What `ensureLease()`'s options may hold: `renewMinutes`, which `parseRenewMinutes` checks, and nothing else. */
const checkEnsureLeaseOpts = optionsCheck({ renewMinutes: Z.optional(Z.unknown()) }, "ensureLease()'s only option is `renewMinutes`, how many minutes before the lease ends to ask for a proof anyway: check its spelling, and leave out any other.")

/** What `putBox()`'s options may hold: a sidecar, which {@link sidecarJsonOf} checks, and nothing else. */
const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, "putBox()'s only option is `sidecar`, the box's own visible data (it is authenticated but never encrypted): check its spelling, and leave out any other. A note is kept in the sidecar: { sidecar: { note } }.")

/**
 * The sidecar a `putBox()` was handed, as the JSON a box keeps, keys sorted; undefined when
 * it was handed none. Kind 'bad_option' for anything JSON cannot carry, quoting none of it, and
 * for options beside it.
 */
const sidecarJsonOf = (storeOpts: { sidecar?: Sidecar | undefined } | undefined): string | undefined => {
  checkStoreOpts(storeOpts)
  if (storeOpts?.sidecar === undefined) { return undefined }
  return stableJsonify(checkedSidecar(storeOpts.sidecar))
}

/**
 * The proof of a change to the ways in, `call`'s: the vault's standing passphrase, as text. Kind
 * 'bad_option' for anything else, a passkey's answer among it, and as {@link PassphraseProof.parse}
 * refuses.
 */
const standingPassphraseOf = (vault: Vault, given: unknown, call: 'putWayin' | 'delWayin'): PassphraseProof => {
  if (typeof given !== 'string') {
    throw new VaultError('bad_option', `${call} takes the vault's passphrase as it stands, as the text the user typed: only the passphrase proves a change to the vault's ways in, never a passkey.`)
  }
  return PassphraseProof.parse(vault, given)
}

/**
 * `putWayin`'s new way in, checked: a new passphrase as text, refused as 'weak_passphrase' when
 * blank, as no blank passphrase is strong; or a passkey's answer, over a fresh salt. Kind
 * 'bad_option' for anything else, as {@link Proof.parse} and `checkFreshSalt` refuse.
 */
const newProofOf = (vault: Vault, given: unknown): PassphraseProof | PasskeyProof => {
  if (typeof given === 'string' && ! given.trim()) {
    throw new VaultError('weak_passphrase', "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember.")
  }
  const proof = Proof.parse(vault, given)
  if (proof instanceof PasskeyProof) { checkFreshSalt(proof) }
  return proof
}

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
const absentBox = () => new VaultError('absent_box', 'No box stands under that boxlabel in this vault: its snapshot lists the ones it holds.')

// --

// == [Timers and grace]: isFarFuture, unrefTimeout, deadlineAfter

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

/** The deadline for a lease granted at `nowMillis`: `leaseMillis` later, in whole ms, but never past {@link FarFuture}. */
const deadlineAfter = (nowMillis: number, leaseMillis: number): number => Math.min(Math.floor(nowMillis + leaseMillis), FarFuture)
// --
