import { type Capacity, type Clock, type VaultScope, Whisper, Sidecar, type DeviceRecord, type LeaseRecord, type WayinKind } from './types/types'
import { type GatedVaultRecord, type GateRecord, type GateSparse, type VaultMadeUnder, type VaultRecord, type VaultSparse, type VaultStamp, gateSparseOf, isGated, vaultSparseOf } from './vault-record'
import { vault_tok } from './types/type-aliases'
import { MinuteMillis, FarFuture, FarPast } from './consts'
import { Box, type BoxBase, type BoxDamaged, type BoxRecord, type BoxSparse, boxSparseOf, checkedSidecar, checkedWhisper, whisperBytesOf } from './box'
import * as CX from './checks/core-checks'
import { Validator } from './checks/validator'
import { optionsCheck } from './options'
import { VaultError, isVaultError, type RefusalKind } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, valOf } from './outcome'
import * as Refusals from './refusals'
import { Wayin, frozenRecord, type PasskeyWayin, type PassphraseWayin } from './wayin'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import { jsonBytes, type BoxExpectation } from './vault-db'
import { byCodeUnit } from './text'
import { type VaultLogger, asError } from './logger'
import * as RefusalPolicy from './refusal-policy'
import type { GuardedStrengthChecker } from './passphrase-strength'
import { type BadNewsHandler, type GuardedRequestCleartext, type VaultParts, parseRenewMinutes, parseStaleMinutes, StoredBytesPerWhisperByte, BoxFixedBytes } from './vault-opts'
import { reportToPlatform } from './report-error'
import { type DeviceDB, deviceRecordFor, deviceRecordOf, deviceTroubleAsConditions } from './device-db'
import type { KeyDeriver } from './key-deriver'
import { Lease, type LeaseSparse } from './lease'
import { registerLeaseReader } from './held-lease'
import { type PassphraseProving, Proving, type VaultPrivateTools, registerProvingTools } from './proving'
import { Gate } from './gate'
import { type GatingCall, type GatingTools, type GatingKind, RaisedGating, gateMadeElsewhereError } from './gating'

// == [Public types]: VaultFreshness, VaultSnapshot, bear, letGo, goneBy

/** The name of the bank's one way to birth a Vault object, exported by no entry point. */
export const bear = Symbol('Vault.bear')

/** The name of the bank's one way to let a Vault object go, exported by no entry point. */
export const letGo = Symbol('Vault.letGo')

/** The name of the bank's one look at whether a Vault object went gone of itself, exported by no entry point. */
export const goneBy = Symbol('Vault.goneBy')

/** How far to trust the vault's picture of storage, as a UI might say so.
 *  * `timely`: the last read of storage succeeded within `staleMinutes`.
 *  * `aged`: the last read succeeded `staleMinutes` ago or more; the next `hello()` reads again.
 *  * `refused`: the last read failed, so what the vault shows may be behind storage; `trouble`
 *    says why when it was bad news.
 */
export type VaultFreshness = 'timely' | 'aged' | 'refused'

/** What a host renders of a vault, frozen in one plain object for `useSyncExternalStore`: the same object until something changes.
 * It sits flat on the vault's scope, so it goes to any bank call that takes a scope, and carries
 * the vault's `format` and `vault_tok`, so `vault.demandConsistentWith(snapshot)` judges it. Each
 * changing part (`gate`, `boxes`, `damagedBoxes`, `capacity`) is a slice that keeps its identity
 * until it changes, so a memoized component handed one slice skips a change to the others.
 *
 * A host chooses its screen from two fields: `gate === null`, set a passphrase; `ask_passphrase_at
 * === null`, unlock; otherwise, the boxes. It holds nothing an offline guess at a passphrase could
 * start from: no passphrase's salt, key deriver or wrapped vaultKey, and none of the vault's epochs.
 * A passkey's PRF salt does show, as its authenticator is asked with it. Box summaries show even
 * while locked.
 *
 * @example
 *   const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
 *   if (snapshot.gate === null) { return <ChoosePassphrase /> }
 *   if (snapshot.ask_passphrase_at === null) { return <Unlock passkey={snapshot.gate.passkey} /> }
 *   return <BoxList boxes={snapshot.boxes} />
 */
export type VaultSnapshot = Readonly<{
  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  applabel:          string
  /** The signed-in user the vault is found under, as `bank.ensureVault` was given it. Fixed for the Vault object's life. */
  user_id:           string
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  vaultlabel:        string
  /** The vault record's format, `safebyok-vault-v6`. Fixed for the Vault object's life. */
  format:            VaultSparse['format']
  /** The stored vault's token, minted when it was made: one life of the vault in its scope. Fixed for the Vault object's life. */
  vault_tok:         string
  /** The vault's ways in, each as its sparse shape ({@link GateSparse}): the passphrase's, and the passkey's or null; null while the vault has no passphrase yet.
   * It shows while locked, so a host can offer the passkey, ask its authenticator for an answer
   * (`safebyok-react`'s `askPasskey` takes the gate), and say which passkey a new one would
   * replace. It is the same object until the ways in change.
   */
  gate:              GateSparse | null
  /** Every sound box, sorted by boxlabel, as its {@link BoxSparse}: every field of its record but the two ciphered ones.
   * The listing never opens a box's ciphertext, so ciphertext altered in storage shows only when
   * the box is read. A box whose record does not read back is in `damagedBoxes`, never here. The
   * same array until a box changes.
   */
  boxes:             readonly BoxSparse[]
  /** Every box whose stored record does not read back, sorted by boxlabel, as its {@link BoxDamaged}: its boxlabel, the revision it names, and its `damage`.
   * Each holds room in the vault, and meets a `putBox()` under its boxlabel. Offer one only for
   * {@link Vault.delBox}, or a fresh `putBox()` while it names a revision; for a `damage` of
   * `newer_format`, a box a newer safebyok wrote, offer to update the app instead. The same array
   * until a box changes.
   */
  damagedBoxes:      readonly BoxDamaged[]
  /** How much room the vault has, as this device reckons it from its last read.
   * It counts boxes against `maxBoxes`, and bytes against what storage holds of one vault. Each box
   * reserves room for a whisper and sidecar of `maxWhisperBytes`, its fixed fields and its names.
   * Storage checks again on every write, and its `vault_full` or `box_too_large` is the truth: read
   * this only to warn the user ahead of time. The same object until the room changes.
   *
   * @example const { boxes } = vault.snapshot.capacity; if (boxes.used >= boxes.max - 1) { warn('Your vault is nearly full.') }
   */
  capacity:          Readonly<{ boxes: Readonly<Capacity['boxes']>, bytes: Readonly<Capacity['bytes']> }>
  /** Epoch ms from which the vault asks for a proof again, while unlocked on this device; null while it is locked, or has no passphrase yet.
   * Null with a `gate` is the host's cue to offer an unlock. It is `leaseHours` after a proof last unlocked the vault, or a passphrase last proved a change
   * to its ways in. A vault that stays unlocked until `lock()` reads {@link FarFuture} (in 2255):
   * compare with `>= FarFuture - MinuteMillis`, never for equality. To show it, format it in the
   * user's locale with `Intl`: `Intl.DateTimeFormat` for the deadline itself ("Tue, Oct 27, 3:00
   * PM"), and `Intl.RelativeTimeFormat` for the time left ("in 2 days"); show "until locked" instead
   * for any deadline at or past `FarFuture - MinuteMillis`.
   *
   * @example const minutesLeft = snapshot.ask_passphrase_at === null ? null : Math.ceil((snapshot.ask_passphrase_at - Date.now()) / MinuteMillis)
   */
  ask_passphrase_at: number | null
  /** How far to trust what the vault shows: see {@link VaultFreshness}.
   * The vault keeps working whatever it says: every write still lands only where storage stands as
   * this device last read it. It is reckoned when the snapshot is replaced, so `aged` shows at the
   * next change, or the next `hello()`.
   */
  freshness:         VaultFreshness
  /** The latest bad news the vault has learned, or what its `onBadNews` handler threw; null when there is none.
   * Bad news is a refusal of the `bad_news` family: `damaged_vault` or `vault_behind`, say, or a box
   * listed damaged (`damaged_box`, its `meta.box_listed` the box), or a way in stored damaged
   * (`damaged_wayin`, its `meta.wayin_listed` the way in's summary). A handler's throw is kind
   * 'bad_option', the throw its cause. It clears once a read of storage finds nothing amiss.
   * Conditions, such as storage unreachable or a stale write, never land here: they reach their
   * caller alone.
   *
   * @example
   *   const { trouble } = vault.getSnapshot()
   *   if (trouble?.refusalkind === 'damaged_box') { offerToRemove(trouble.meta?.box_listed?.boxlabel) }
   */
  trouble:           VaultError | null
}>
// --

/** The ways in of a vault record's gate, as the vault holds them: the passphrase's, and the passkey's or null. */
type HeldWayins = Readonly<{ passphrase: PassphraseWayin, passkey: PasskeyWayin | null }>

/** One user's vault of boxes, one life of it in storage, for as long as the bank holds it: every read and write of a whisper goes through here.
 * `bank.ensureVault` births one from one read of storage: never absent, with no gate until its
 * first passphrase is set, and holding one `vault_tok` for its life. Its own fields are its
 * {@link VaultStamp} (its format, scope, `vault_tok` and `registered_at`), fixed for its life and
 * frozen, so a spread or a log line of it shows those alone. Everything that changes (its `gate`,
 * `boxes`, `ask_passphrase_at`, `capacity`, `trouble` and the rest) is read through `vault.snapshot`,
 * frozen in one object: a UI renders from `getSnapshot()` and re-renders on `subscribe()`.
 *
 * A call that needs a whisper goes through {@link Vault.ensureUnlocked}: a vault that is not unlocked
 * raises a gating, handed to the host's `requestCleartext`, one at a time. Nothing prompts on open.
 *
 * Every call holds to these, unless its own doc says otherwise:
 *  * A malformed argument or option is refused 'bad_option' ('bad_scope' for a name) before
 *    anything is read, asked for or written. Its message names the field, never the value.
 *  * A call refuses with what storage refuses, as it came.
 *  * Once the Vault object is gone -- the bank let it go, or the vault was deleted, or deleted and
 *    made anew, here or elsewhere -- every call but `subscribe()`, `getSnapshot()` and
 *    `checkStrength()` refuses 'vault_gone', or 'vault_remade' for a vault made anew. The bank
 *    hands out a new Vault object when asked again.
 *  * A throw that is no refusal (a bug, in safebyok or in a function handed to it) is refused
 *    'unexpected_error', what was thrown its cause, and is not logged. What a function that hears
 *    the passphrase throws -- the key deriver, the strengthChecker, requestCleartext -- is kept
 *    nowhere, cause, message or log: the logger hears at most that it threw, and the kind of a
 *    VaultError it threw. Each says how it refuses.
 *
 * This device keeps a record of the highest `vault_epoch` it has seen in the scope (its device
 * record, in the deviceDB), raised at each read and at each write of its own, never lowered. A
 * read below the device record refuses 'vault_behind', taking nothing from it and writing nothing,
 * though the Vault object holds the newer copy: an older vault could bring back a way in that was
 * removed. It locks the vault, as 'identity_revoked' from storage does. Any other read of a vault
 * record older than the one a Vault object holds (one served before a write of this device's own)
 * is ignored: it takes nothing from them, refuses nothing, and keeps the newer. A host
 * that restored storage from an older copy on purpose accepts it on this device with
 * `bank.clearCachedVault`, which erases the record, and asks the bank for the vault again.
 *
 * Storage alone settles a race, and the vault argues with none. A write storage refuses as stale
 * is refused as it came: the vault reads nothing after it, and `hello()` shows what stands. Every
 * thing a Vault object hands out was made under the vault as it stood then (its scope, `vault_tok`
 * and epochs), and each call demands, at each of its steps, that the vault still stands as the
 * thing it holds was made under: a call that finds
 * the vault deleted, made anew, its ways in changed, or locked meanwhile refuses 'vault_gone',
 * 'vault_remade', 'gate_moved' or 'vault_locked' (see {@link Vault.demandConsistentWith}). A box
 * that will not open under the lease in hand is 'damaged_box' at once, with no read of storage
 * first.
 *
 * Every call comes in two forms. `tryEnsureUnlocked()`, `tryPutBox()` and the rest resolve to an
 * {@link Outcome}, `{ ok: true, val }` or `{ ok: false, err }`, never thrown: the form for code
 * that branches on `refusalkind`. `ensureUnlocked()`, `putBox()` and the rest resolve to that `val` or
 * throw that `err`: the form for code that reports failure by throwing, as a TanStack `queryFn`
 * does. A refusal a member's doc names comes as `err` from its `try` form. Bad news is told to
 * `onBadNews` once, whichever form met it. `subscribe()` and `useWhisper()` come in the throwing
 * form alone.
 *
 * `subscribe` and `getSnapshot` are bound to their vault, each keeping one identity, so they can go
 * to `useSyncExternalStore` as they are. Every other call is a method: call it on the vault, or
 * wrap it to hand it on, as an event handler does: `() => vault.tryHello()`.
 *
 * @example const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
 * @example if (vault.snapshot.gate !== null && vault.snapshot.ask_passphrase_at === null) { offerUnlock(vault.snapshot.gate.passkey) }
 * @example JSON.stringify(vault)   // its stamp alone: format, scope, vault_tok and registered_at
 * @example
 *   await vault.ensureUnlocked()   // asks through requestCleartext while locked
 *   const whisper = await vault.getWhisper('anthropic_api_key')
 * @example
 *   const { ok, err } = await vault.tryGetWhisper('anthropic_api_key')
 *   if (! ok && err.refusalkind === 'vault_locked') { offerUnlock() }
 */
export class Vault implements VaultStamp {
  // == [Vault: fields]: format, applabel, user_id, vaultlabel, vault_tok, registered_at, stamp, snapshot, getSnapshot, subscribe, logger

  // Its own fields are its stamp, fixed for its life and frozen with it. Everything that changes
  // lives in a private field, which a freeze leaves writable, and is read through the snapshot that
  // `#replaceSnapshot()` last published. Its boxes, ways in and lease are each handed what they
  // use of it as they are made: the time, the epochs it showed then, its key deriver, its lease length.

  /** The vault record's format, `safebyok-vault-v6`. Fixed for the Vault object's life. */
  readonly format:        VaultStamp['format']
  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  readonly applabel:      string
  /** The signed-in user the vault is found under. Fixed for the Vault object's life. */
  readonly user_id:       string
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  readonly vaultlabel:    string
  /** The stored vault's token: the one life of it this Vault object holds. Fixed for the Vault object's life. */
  readonly vault_tok:     string
  /** When the stored vault was made, in epoch milliseconds. Fixed for the Vault object's life. */
  readonly registered_at: number

  /** Its own fields, its stamp, as one frozen plain object: what to spread, copy or show where the Vault object itself would carry its methods along. The same object for the Vault object's life.
   *
   * @example const { vault_tok, registered_at } = vault.stamp
   * @example const shown = { ...vault.stamp, boxCount: vault.snapshot.boxes.length }   // never { ...vault }
   */
  get stamp(): VaultStamp { return this.#stamp }
  readonly #stamp: VaultStamp

  /** Everything about the vault that changes, frozen in one object: what {@link Vault.getSnapshot} returns. See {@link VaultSnapshot}.
   *
   * @example const { gate, ask_passphrase_at, boxes } = vault.snapshot
   */
  get snapshot(): VaultSnapshot { return this.#snapshot }

  /** The current {@link VaultSnapshot}, as a function bound to its vault, of one identity for the Vault object's life: the same object until something changes. */
  get getSnapshot(): () => VaultSnapshot { return this.#getSnapshot }
  readonly #getSnapshot = (): VaultSnapshot => this.#snapshot

  /** Call `listener` after every snapshot change, returning the unsubscribe: a function bound to its vault, of one identity for the Vault object's life. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** The logger the vault was made with, which its boxes and ways in log through: for host code that logs about a vault. */
  get logger(): VaultLogger { return this.#logger }
  // --

  // == [Vault: opening]: hello, refresh, ensureUnlocked

  /** Read storage and settle the vault as novel, locked or unlocked, resolving the vault.
   * Never prompts. Within `opts.staleMinutes` of the last read it re-settles without reading, unless
   * the last read failed or found storage it could not trust. A hello made while a read is under
   * way shares that read, whatever its `staleMinutes`, and starts none of its own. Reads
   * {@link DeviceDB.getDeviceRecord}, then `VaultDB.getVault` beside {@link DeviceDB.getLease}.
   *
   * A hello takes no lease up: the vault's birth took up this device's, and another tab's unlock
   * shows here at the next {@link Vault.ensureUnlocked}. It drops the lease in hand, erasing nothing,
   * once this device's store no longer holds it (another tab locked), or holds one under other ways
   * in, or the vault's ways in changed; another tab's unlock or renewal leaves it standing until it
   * ends. A read served before a write of this device's own, and answered after it, is ignored:
   * nothing is taken from it, and nothing refused. It raises this device's record of the vault to
   * what it read.
   *
   * A refused hello applies no partial read: the vault stands as its last read left it. A stored
   * vault record it cannot use refuses with 'damaged_vault' (`delDamagedVault` clears it), 'newer_format'
   * or 'vault_behind'. Finding the vault deleted, it refuses 'vault_gone'; deleted and made anew,
   * 'vault_remade': either way this Vault object is gone for good, and the bank hands out the next.
   * A box or way in stored damaged refuses nothing: it lists damaged, and is told as bad news.
   *
   * @example await vault.hello()   // vault.snapshot.gate: null while novel; vault.snapshot.ask_passphrase_at: null while locked
   * @example document.addEventListener('visibilitychange', () => { if (! document.hidden) { void vault.tryHello() } })
   * @example window.addEventListener('focus', () => vault.tryHello())   // wrapped: vault.hello itself would refuse the event as its options
   * @example await vault.hello({ staleMinutes: 0 })   // read now, whatever was read a moment ago
   */
  async hello(given?: { staleMinutes?: number | undefined }): Promise<Vault> { return valOf(await this.tryHello(given)) }

  /** Read storage and settle the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.hello}. */
  async tryHello(given?: { staleMinutes?: number | undefined }): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      const helloOpts = checkHelloOpts(given)
      const staleMillis = helloOpts?.staleMinutes === undefined ? this.#staleMillis : parseStaleMinutes(helloOpts.staleMinutes, 'hello')
      await this.#helloWithin(staleMillis)
      // The bank may have let the vault go while storage was read.
      this.#checkStanding()
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Read storage now and settle the vault, resolving the vault: {@link Vault.hello} with `staleMinutes: 0`.
   * A refresh asked for while a read is under way shares that read, which may have begun before
   * the call: a caller that must see a write it just learned of elsewhere awaits it, then refreshes
   * again. The vault's watch on storage refreshes so as storage rings. It refuses as `hello()` does.
   *
   * @example await vault.refresh()   // the listing as storage holds it now
   */
  async refresh(): Promise<Vault> { return valOf(await this.tryRefresh()) }

  /** Read storage now, as an {@link Outcome}: the non-throwing form of {@link Vault.refresh}. */
  async tryRefresh(): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      await this.#helloWithin(0)
      // The bank may have let the vault go while storage was read.
      this.#checkStanding()
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Have the vault unlocked, asking the user through `requestCleartext` only when it must, resolving the vault.
   * Every call that needs a whisper goes through it; call it yourself to unlock ahead of time, on a
   * button. Once it resolves, the vault is unlocked under a lease that stands. It awaits a hello
   * first. Unlocked, under a lease of the ways in the vault holds that does not end within
   * `opts.renewMinutes` (0 when left out), it resolves at once, with no prompt and no write.
   * Otherwise it raises a gating, `unlock_vault` (`initialize_gate` while the vault is `novel`), or
   * joins the one standing when that one unlocks (`unlock_vault`, `initialize_gate`), hearing what
   * it settles with: one dialog answers every call waiting on it. A gating of another kind -- a
   * change to the ways in, a deletion -- it waits out, whatever that settles with, and asks again;
   * so does a joined gating's success that leaves no lease standing past this call's
   * `renewMinutes`. The call raises at most one gating of its own. A gating it raises first
   * consults this device's store, and takes up a lease another tab granted when it fits -- of the
   * ways in held, ending past `renewMinutes` from now, and no later than `leaseHours` from now --
   * before the host is ever asked. Only then is the gating handed to `requestCleartext`, and the
   * call waits for it to settle.
   *
   * A `renewMinutes` as long as the lease or longer refuses 'bad_option': every call would prompt.
   * Refuses 'vault_locked' when the user declines, when there is no `requestCleartext`, when a
   * `lock()` lands while the gating stands, or when the lease is gone by the time it settles;
   * 'vault_gone' when the vault is deleted meanwhile, or the bank lets it go ('vault_remade' for
   * one made anew); and with what the gating's attempt refused, when it settled the gating. A first
   * passphrase set when this device's store would not keep the unlock refuses as the store did,
   * 'storage_blocked' or 'storage_unavailable', saying the passphrase was set. A wrong passphrase
   * never reaches here: the dialog meets it, through the gating's attempt.
   *
   * @example await vault.ensureUnlocked()   // unlocked, or refused 'vault_locked'
   * @example <button onClick={() => vault.tryEnsureUnlocked()}>Unlock</button>
   * @example await vault.ensureUnlocked({ renewMinutes: 60 })   // ask now if the lease ends within the hour
   */
  async ensureUnlocked(given?: { renewMinutes?: number | undefined }): Promise<Vault> { return valOf(await this.tryEnsureUnlocked(given)) }

  /** Have the vault unlocked, as an {@link Outcome}: the non-throwing form of {@link Vault.ensureUnlocked}. */
  async tryEnsureUnlocked(given?: { renewMinutes?: number | undefined }): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      const unlockOpts = checkEnsureUnlockedOpts(given)
      const renewMillis = parseRenewMinutes(unlockOpts?.renewMinutes)
      if (renewMillis > 0 && renewMillis >= this.#leaseMillis) { throw renewPastLease() }
      await this.#ensureUnlocked(renewMillis)
      this.#demandLease('ensureUnlocked')
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: demand]: demandConsistentWith, consistentWith

  /** Refuse unless `thing` is consistent with the vault as it stands now: what each call asks before and after each wait.
   * `thing` is something the vault handed out (a box, a lease, a listing's entry), its snapshot, or
   * a {@link VaultSparse}: anything carrying the `vault_tok` it was made under ({@link VaultMadeUnder}).
   * Each of the scope, `vault_tok` and epochs it carries is compared with the vault record in hand,
   * in this order, and the first that disagrees refuses. The vault is gone: 'vault_gone'.
   * Another scope or `vault_tok`, the vault deleted and made anew: 'vault_remade'. Another
   * `gate_epoch`, or a `vault_epoch` past the vault's: 'gate_moved'. With `opts.leaseBound`, the
   * vault must also hold a lease that has not ended: 'vault_locked'; one found ended is dropped,
   * as its expiry drops it.
   *
   * It is synchronous, reads nothing, and changes nothing but an ended lease. The logger hears
   * each refusal's kind, never the thing's fields. A thing missing its `vault_tok` is 'bad_option'.
   *
   * @example vault.demandConsistentWith(box)                              // the vault half: 'vault_gone' or 'vault_remade' once it moved on
   * @example vault.demandConsistentWith(box, { leaseBound: true })        // and 'vault_locked' once a lock lands
   * @example vault.demandConsistentWith({ vault_tok: vault.vault_tok, gate_epoch: 0 })   // throws 'gate_moved' for a vault with a way in
   */
  demandConsistentWith(thing: VaultMadeUnder, opts?: { leaseBound?: boolean | undefined }): void {
    const demandOpts = checkDemandOpts(opts)
    this.#demand(checkedMadeUnder(thing), { leaseBound: demandOpts?.leaseBound === true, call: 'demandConsistentWith' })
  }

  /** True while `thing` is consistent with the vault as it stands now: the question {@link Vault.demandConsistentWith} refuses on, asked without refusing.
   * It compares as the demand does, and with `opts.leaseBound` asks also for a lease in hand that
   * has not ended. It changes nothing, not even an ended lease, and logs nothing. A thing missing
   * its `vault_tok`, or an option it does not take, throws 'bad_option', as misuse.
   *
   * @example if (! vault.consistentWith(box)) { box = await vault.getBox(box.boxlabel) }   // read it again once the vault moved on
   */
  consistentWith(thing: VaultMadeUnder, opts?: { leaseBound?: boolean | undefined }): boolean {
    const leaseBound = checkDemandOpts(opts)?.leaseBound === true
    return this.#inconsistencyWith(checkedMadeUnder(thing)) === null && (! leaseBound || this.#leaseInForce() !== null)
  }
  // --

  // == [Vault: locking]: lock

  /** Forget the unlock, in memory and on this device: the vault is `locked` at once, storage reachable or not.
   * All a caller can see happens before it returns, synchronously: the lease is dropped and its
   * expiry disarmed; a gating standing ends, every call waiting on it refusing 'vault_locked' and
   * its `lockLanded` settling; and the snapshot reads `locked`. What it returns is this
   * device's lease being erased, with {@link DeviceDB.delLease}. It awaits no hello.
   *
   * A call under way ends by its own rule. A `getWhisper()` or `useWhisper()` refuses 'vault_locked'
   * once storage answers or the box opens, unless a gating has put a lease back in hand meanwhile;
   * a `getBox()` refuses so too, handing back no box. A `putBox()` refuses
   * 'vault_locked', writing nothing, when the lock lands while it waits on a gating, reads and
   * opens the box (`VaultDB.getBox`, `box.extractWhisper()`), or seals it (`Box.seal`); a
   * `delBox()` does when it lands while it waits on a gating. Only the write itself is past a
   * lock's reach: once `VaultDB.putBox` or `VaultDB.delBox` is sent, it lands or refuses as storage
   * decides, a stale `putBox()` refusing 'stale_write' as ever. So is a deletion's: once a
   * `del_vault` attempt has sent `VaultDB.delVault`, `del()` resolves when it lands, and refuses
   * 'vault_locked' when storage refuses it. A gating's attempt under way, of
   * whatever kind, holds no lease once the lock lands: it refuses 'gating_landed' at its next step,
   * and a change to the ways in it already stored stays stored.
   *
   * Refuses 'storage_unavailable' ('storage_blocked' when the browser withholds the store) when the
   * device store cannot erase the lease; the vault is locked all the same.
   *
   * The vault also locks of itself: when the lease ends, at `del()`, for storage it cannot trust,
   * and at a read that finds its ways in changed, or the lease gone from this device's store.
   *
   * @example document.addEventListener('visibilitychange', () => { if (document.hidden) { void vault.lock() } })
   */
  async lock(): Promise<void> { valOf(await this.tryLock()) }

  /** Forget the unlock, as an {@link Outcome}: the non-throwing form of {@link Vault.lock}. */
  async tryLock(): Promise<Outcome<void>> {
    try {
      this.#checkStanding()
      valOf(await this.#lockNow())
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: ways in]: checkStrength, putWayin, delWayin

  /** Refuse a new passphrase too easy to guess, by the `strengthChecker` the vault was made with: 'weak_passphrase', the checker's reason its message, written for the user.
   * The `initialize_gate` and `change_passphrase` gatings refuse a weak one by this check, so a
   * field asking it as the user types decides alike: show a 'weak_passphrase' message beside the
   * field. A blank passphrase is weak before the checker hears it. Reads nothing, and awaits no
   * hello.
   *
   * A checker that breaks its contract is refused here, and by every call that asks it:
   * 'bad_option' for an answer that is no verdict, and 'unexpected_error' for a throw. That refusal
   * carries nothing of what the checker threw, as the checker heard the passphrase. A passphrase
   * that is not text is 'bad_option' too.
   *
   * @example await vault.checkStrength(chosen)   // throws 'weak_passphrase' with the checker's reason
   * @example await vault.checkStrength('correct horse battery staple')   // resolves
   * @example
   *   const { ok, err } = await vault.tryCheckStrength(typed)
   *   setHint(ok || err.refusalkind !== 'weak_passphrase' ? '' : err.message)
   */
  async checkStrength(passphrase: string): Promise<void> { valOf(await this.tryCheckStrength(passphrase)) }

  /** Refuse a new passphrase too easy to guess, as an {@link Outcome}: the non-throwing form of {@link Vault.checkStrength}. */
  async tryCheckStrength(passphrase: string): Promise<Outcome<void>> {
    try {
      if (typeof passphrase !== 'string') {
        throw new VaultError('bad_option', "checkStrength takes the passphrase as the text the user typed, as a string.")
      }
      const verdict = await this.#strengthChecker(passphrase)
      if (! verdict.strong) { throw new VaultError('weak_passphrase', verdict.reason) }
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Put a way into the vault at `slotlabel`, through a gating the user answers, resolving the vault.
   * On a `novel` vault `'passphrase'` raises `initialize_gate`: the first passphrase, and a passkey
   * beside it if the dialog offers one; `'passkey'` refuses 'absent_vault', asking nothing, as a
   * passkey is added under the passphrase. Otherwise `'passphrase'` raises
   * `change_passphrase`: the current passphrase and the next, which replaces it and removes the
   * passkey, if any (the user adds a passkey again under the new passphrase). `'passkey'` raises
   * `put_passkey`: the passphrase and a new passkey's answer, which becomes the vault's passkey,
   * replacing any; the snapshot's `passkey` says which, so the host can warn the user first. Only
   * the passphrase proves a change to the ways in, never a passkey. Boxes are untouched, so the
   * call costs the same however many there are. The gating's attempt writes with
   * `VaultDB.putVaultRecord`.
   *
   * A gating of the same kind standing is joined; one of another kind is waited out first. Once it
   * resolves, the change is in storage. The gate epoch moves, so every other device locks, and asks
   * again at its next look. This device is left unlocked, its lease starting again from now.
   *
   * Refuses 'bad_option' for a slotlabel other than `'passphrase'` or `'passkey'`; 'absent_vault'
   * for `'passkey'` on a vault with no passphrase yet; 'vault_locked'
   * when the user declines or a `lock()` lands while the gating stands; and with what the gating's
   * attempt refused when it settled it: 'stale_write' or 'gate_moved' when the vault changed
   * first, here or elsewhere. A wrong or weak passphrase, the same one again, or a way in stored
   * damaged ('damaged_wayin'), the dialog meets in place.
   *
   * Replacing is not revoking: whoever holds the old passphrase or passkey, and kept a copy of the
   * vault record from before, can still open that copy. The vaultKey inside it is the one the vault
   * still uses.
   *
   * @example await vault.putWayin('passphrase')   // the dialog asks for the current and the next
   * @example await vault.putWayin('passkey')   // the dialog asks for the passphrase, and creates a passkey
   */
  async putWayin(slotlabel: WayinKind): Promise<Vault> { return valOf(await this.tryPutWayin(slotlabel)) }

  /** Put a way into the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.putWayin}. */
  async tryPutWayin(slotlabel: WayinKind): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      checkSlotlabel(slotlabel, 'putWayin')
      await this.#helloWithin(this.#staleMillis)
      const kindNow = (): GatingKind => {
        if (isGated(this.#vaultRecord)) { return slotlabel === 'passphrase' ? 'change_passphrase' : 'put_passkey' }
        if (slotlabel === 'passkey') { throw passkeyBeforePassphrase() }
        return 'initialize_gate'
      }
      await this.#gatingFor(kindNow, 'putWayin')
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Take away the way in at `slotlabel`, the passkey, through a `del_passkey` gating the user answers with the passphrase, resolving the vault.
   * The passphrase slot refuses 'passphrase_required' at once: a vault keeps its passphrase. A vault
   * with no passkey refuses 'absent_wayin', before any gating. Otherwise it refuses as
   * {@link Vault.putWayin} does. Like `putWayin()`, it moves the gate epoch, so every other device
   * locks and must unlock again with the passphrase; this one is left unlocked, its lease starting
   * again from now.
   *
   * Removing is not revoking: whoever holds the removed passkey, and kept a copy of the vault record
   * from before, can still open that copy. The vaultKey inside it is the one the vault still uses.
   *
   * @example await vault.delWayin('passkey')   // the passkey is gone
   */
  async delWayin(slotlabel: WayinKind): Promise<Vault> { return valOf(await this.tryDelWayin(slotlabel)) }

  /** Take away a way in, as an {@link Outcome}: the non-throwing form of {@link Vault.delWayin}. */
  async tryDelWayin(slotlabel: WayinKind): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      checkSlotlabel(slotlabel, 'delWayin')
      if (slotlabel === 'passphrase') {
        throw new VaultError('passphrase_required', "A vault keeps its passphrase: it can be replaced (putWayin('passphrase')), never removed. Nothing was changed.")
      }
      await this.#helloWithin(this.#staleMillis)
      this.#checkStanding()
      const kindNow = (): GatingKind => {
        if (! isGated(this.#vaultRecord) || this.#vaultRecord.gate.passkey === null) {
          throw new VaultError('absent_wayin', "This vault has no passkey to remove: it may have been removed on another device. Nothing was changed.")
        }
        return 'del_passkey'
      }
      await this.#gatingFor(kindNow, 'delWayin')
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: boxes]: putBox, getBox, getWhisper, useWhisper, delBox

  /** Seal `whisper` into the box `props.boxlabel` and store it, creating or replacing it, resolving the {@link Box} as stored.
   * Once it resolves, the box holds this whisper, and the snapshot lists its new revision. It goes
   * through {@link Vault.ensureUnlocked}, which may prompt, only once the boxlabel, sidecar and whisper
   * have passed their checks: a store that cannot land never prompts. It is one write, with
   * `VaultDB.putBox`, over the revision the box was sealed from.
   *
   * Given both the sidecar and the whisper, it reads nothing: it writes over the revision the
   * snapshot lists under the boxlabel, keeping its `registered_at`, or as a new box when none is
   * listed. Leave either out to keep the box's own: it reads the box first, opens it (so what it
   * keeps is proven unaltered), and writes over the revision it read. With none standing, a sidecar
   * left out is `{}`, and a whisper left out refuses 'no_whisper': at once, asking nobody, for a
   * box a locked vault's listing does not show.
   *
   * Refuses 'whisper_too_large' when the whisper's JSON and the sidecar's are together over
   * `maxWhisperBytes`; a sidecar kept counts as one given does. Refuses 'vault_full' for a new
   * boxlabel when the vault holds `maxBoxes`, or has no room left in what storage holds of one vault,
   * as the listing in hand counts them: one a moment stale may refuse, and a hello cures it.
   * Replacing a box is never refused so by the vault's own limits, though storage may refuse it
   * 'vault_full' by its own. Storage refuses 'box_too_large' for a box heavier than one record holds.
   *
   * Refuses 'stale_write' when another call, here or on another device, wrote, created or deleted
   * this box since the revision it was sealed from: nothing was written, and the refusal's
   * `meta.box_stored` is what stands. A whole store over a listing a moment stale refuses so too: a
   * hello shows what stands, or leave out the sidecar to read the box first. A vault deleted or made
   * anew elsewhere refuses 'stale_write' too, writing nothing. A lock landing while the call waits
   * on a gating, reads and opens the box (`VaultDB.getBox`, `box.extractWhisper()`), or seals it
   * (`Box.seal`) refuses 'vault_locked', writing nothing. Once `VaultDB.putBox` is
   * sent, a lock does not stop it: the write lands or refuses as storage decides. Once it lands, the
   * listing takes the box as storage stored it; a vault made anew meanwhile refuses 'vault_remade'
   * after the write landed.
   *
   * Every store stamps `written_at`, the same whisper stored again included; `registered_at` keeps
   * the box's first store. A box that will not read or open is written over as new, keeping neither
   * its sidecar nor its `registered_at`, when the whisper is given; a store keeping its whisper
   * refuses 'damaged_box'. One listed damaged with no revision refuses 'damaged_box', writing
   * nothing: {@link Vault.delBox} it first. A boxlabel that is not a label refuses 'bad_scope'.
   *
   * @param props - The box: its `boxlabel`, and its `sidecar`, your app's own JSON object beside the
   *   whisper, shown in the snapshot while locked, and never interpreted by the vault. Anything but a
   *   JSON object, a bare string, array or null among them, refuses 'bad_option'. It is stored in
   *   the clear, readable by anyone who can read the database: never put secret material in it. It
   *   is authenticated, so a sidecar altered in storage makes the box refuse to open. `{}` empties it.
   * @param whisper - Any JSON value but a bare null. Left out, the box keeps the one it holds.
   *
   * @example await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'work account' } }, 'sk-ant-...')
   * @example await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-...')                 // keeps the sidecar it has
   * @example await vault.putBox({ boxlabel: 'anthropic_api_key', sidecar: { note: 'personal' } })   // keeps the whisper it has
   */
  async putBox(props: PutBoxProps, whisper?: Whisper): Promise<Box> { return valOf(await this.tryPutBox(props, whisper)) }

  /** Seal and store the box `props.boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.putBox}. */
  async tryPutBox(props: PutBoxProps, whisper?: Whisper): Promise<Outcome<Box>> {
    try {
      this.#checkStanding()
      const { boxlabel, sidecar } = putBoxPropsOf(props)
      const label = this.#checkedBoxlabel(boxlabel)
      // The refusal never quotes its input: a whisper stays out of error messages.
      const given = whisper === undefined ? undefined : checkedWhisper(whisper)
      // Checked before the user is asked for anything: a call that cannot land never prompts. A
      // sidecar given beside a whisper left out is weighed alone now, and with the whisper kept once read.
      this.#checkWhisperFits(given, sidecar ?? {})
      // A whisper left out is kept from the box: one the listing does not show has none to keep.
      if (! await this.#ensureUnlocked(0, () => given !== undefined || this.#isListed(label))) { throw noWhisper() }
      return good(await this.#sealAndPutBox(label, sidecar, given))
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The {@link Box} under `boxlabel`, still sealed: its visible fields, sidecar among them, and its ciphered whisper; null when there is none.
   * `box.extractWhisper()` opens the whisper. A box the snapshot does not list resolves null at
   * once, asking nobody: that listing is as fresh as `staleMinutes` keeps it. Otherwise the call
   * goes through {@link Vault.ensureUnlocked}, which may prompt, and reads `VaultDB.getBox` under the
   * vault this device holds.
   *
   * Refuses 'damaged_box' when its record fails its checks. It does not open the whisper, so a
   * whisper that will not open shows only at `extractWhisper()` or `getWhisper()`. A vault deleted
   * or made anew elsewhere refuses 'vault_gone', reading no box of the vault that stands now, and
   * this Vault object is gone with it: ask the bank for the vault again (`bank.ensureVault`).
   * Deleted or made anew while storage is read, it refuses
   * 'vault_gone' or 'vault_remade', as when the bank lets the vault go; a lock landing then refuses
   * 'vault_locked', handing back no box. A boxlabel that is not a label refuses 'bad_scope'.
   *
   * @example const box = await vault.getBox('anthropic_api_key')   // null when there is none
   */
  async getBox(boxlabel: string): Promise<Box | null> { return valOf(await this.tryGetBox(boxlabel)) }

  /** The box under `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.getBox}. */
  async tryGetBox(boxlabel: string): Promise<Outcome<Box | null>> {
    try {
      return good(await this.#getBoxUnlocked(boxlabel, 'getBox'))
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The whisper in `boxlabel`, opened under the vault's key: 'absent_box' when there is none, as reading the whisper of {@link Vault.getBox}'s null would be.
   * Asks, reads and refuses as {@link Vault.getBox} does, then opens it as `box.extractWhisper()`
   * does: 'damaged_box' for a box that will not open under the vault's key ({@link Vault.delBox}
   * it, or {@link Vault.putBox} over it), and 'vault_locked' for a lock landing meanwhile. A box the
   * snapshot does not list refuses 'absent_box' at once, asking nobody, as `getBox` resolves null.
   *
   * @example const whisper = await vault.getWhisper('anthropic_api_key')   // 'absent_box' when there is none
   */
  async getWhisper(boxlabel: string): Promise<Whisper> { return valOf(await this.tryGetWhisper(boxlabel)) }

  /** The whisper in `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.getWhisper}. */
  async tryGetWhisper(boxlabel: string): Promise<Outcome<Whisper>> {
    try {
      const box = await this.#getBoxUnlocked(boxlabel, 'getWhisper')
      if (box === null) { throw absentBox() }
      return good(await box.extractWhisper())
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Hand the whisper in `boxlabel` to `callback`, resolving its result: the shape that discourages parking a secret in state.
   * Asks, reads and refuses as {@link Vault.getWhisper} does, 'absent_box' when there is none
   * among them: the callback is handed a whisper or not called. A throw from `callback` rejects as it
   * came, and is never told as bad news.
   *
   * @example await vault.useWhisper('anthropic_api_key', (whisper) => callAnthropic(whisper))
   */
  async useWhisper<ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT> {
    if (typeof callback !== 'function') { throw new VaultError('bad_option', 'use needs a callback function to hand the whisper to.') }
    const whisper = valOf(await this.tryGetWhisper(boxlabel))
    // The callback's own throw is the host's, and is never told as the vault's bad news.
    return await callback(whisper)
  }

  /** Remove the box `boxlabel`, whatever revision of it stands, resolving what was removed: a damaged one too, as deleting is its remedy.
   * Once it resolves, storage holds no box under `boxlabel`. It asks for a proof, and refuses
   * 'absent_box' at once for a box the snapshot does not list, or 'bad_scope', as {@link Vault.getBox}
   * does; 'absent_box' too when another device or tab deleted it first. Writes with
   * `VaultDB.delBox`, which keeps no record of what it removed.
   *
   * The delete lands only in the vault this device last read. If that vault was deleted, or made
   * anew, elsewhere, nothing is removed, and the call refuses 'stale_write': `hello()` to see what
   * stands. Within that vault the delete wins: a revision another device or tab wrote meanwhile
   * is deleted all the same, its `outcome` 'deleted_other', and the logger warns. Deleted is gone: a
   * later `putBox()` from a device that never saw the delete is refused as stale. A lock landing
   * while the call waits on a gating refuses 'vault_locked', removing nothing. Once `VaultDB.delBox`
   * is sent, a lock does not stop it: the delete lands or refuses as storage decides, and once it
   * lands the listing drops the box.
   *
   * @example const { outcome } = await vault.delBox('anthropic_api_key')   // 'deleted', or 'deleted_other' when another write stood
   */
  async delBox(boxlabel: string): Promise<DeletedBox> { return valOf(await this.tryDelBox(boxlabel)) }

  /** Remove the box `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.delBox}. */
  async tryDelBox(boxlabel: string): Promise<Outcome<DeletedBox>> {
    try {
      this.#checkStanding()
      const label = this.#checkedBoxlabel(boxlabel)
      // Checked before the user is asked for anything: a call that cannot land never prompts.
      if (! await this.#ensureUnlocked(0, () => this.#isListed(label))) { throw absentBox() }
      this.#demandLease('delBox')
      // Lands only in the vault this device holds a lease for, whatever revision of the box stands:
      // a vault deleted and made anew elsewhere refuses it. The revision the listing shows only
      // lets storage say whether it removed that one or another.
      const expected = { vault_tok: this.vault_tok, revision_tok: this.#listedRevisionOf(label) }
      const showedDamaged = this.#isListedDamaged(label)
      const deleted = await outcomeOf(() => this.#vaultDB.delBox(this.#scope, label, expected))
      // A lock landing meanwhile lets the deletion land.
      this.#demandAfterWait(deleted, { vault_tok: this.vault_tok }, { call: 'delBox' })
      const { outcome } = valOf(deleted)
      // Storage arbitrates: nothing stood there to delete.
      if (outcome === 'absent') { throw absentBox() }
      if (outcome === 'deleted_other') {
        if (showedDamaged) {
          this.#logger.warn("The box this device showed was a damaged one, and the box deleted was not that record: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox', damaged: true })
        } else {
          this.#logger.warn("The box deleted was not the revision this device showed: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox' })
        }
      }
      return good(this.#dropBoxListingOf({ boxlabel: label, vault_tok: this.vault_tok, outcome }))
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: deleting]: del

  /** Delete the vault, through a `del_vault` gating the user answers with the passphrase: every record it has in storage, and this device's lease of it, as the vault half of deleting an account.
   * Deleting a vault is proven like any change to it. Storage keeps a tombstone of the scope, which
   * carries the vault's counter into any vault made there later, and this device raises its record
   * of the vault to it. The gating's attempt writes with `VaultDB.delVault`, expecting the vault and
   * the ways in it proved; the gating settles, and then the vault locks as `lock()` does. Once it
   * resolves, this Vault object is gone: every call on it refuses 'vault_gone', and the bank hands
   * out a new one, `novel`, when asked for the vault again. A device store that cannot erase the
   * lease is only logged: the vault is deleted all the same.
   *
   * A gating of another kind standing is waited out first. Refuses 'vault_locked' when the user
   * declines or a `lock()` lands while the gating stands, unless the attempt has sent its write: a
   * deletion that lands then resolves, as storage decides. Refuses with what the attempt refused
   * when it settled it: 'stale_write' when the vault changed in storage first, or as
   * {@link Vault.demandConsistentWith} finds it moved on. It awaits a hello first: a vault still
   * `novel` then has no passphrase to prove it with, and refuses 'absent_vault'.
   *
   * @example await vault.del()   // storage holds a tombstone; bank.ensureVault({ vaultlabel }) births the next life, novel
   */
  async del(): Promise<void> { valOf(await this.tryDel()) }

  /** Delete the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.del}. */
  async tryDel(): Promise<Outcome<void>> {
    try {
      this.#checkStanding()
      // Judged on a picture within staleMinutes, as putWayin's and delWayin's are: a stale novel one may be gated by now.
      await this.#helloWithin(this.#staleMillis)
      this.#checkStanding()
      this.#gatedRecord()
      await this.#gatingFor(() => 'del_vault', 'del')
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The bank lets this Vault object go: it is gone, every call refusing 'vault_gone', as `bank.closeVault` says. Not a lock: nothing stored is erased, and the lease stays for the next Vault object. */
  [letGo](): void { this.#letGo(null) }

  /** What every call on this Vault object refuses with once it is gone, or null while it stands: the bank's look at a Vault object whose read found the vault deleted or made anew before its birth settled. */
  get [goneBy](): VaultError | null { return this.#goneBy?.() ?? null }
  // --

  // == [Options and setup]: bear, the constructor, scope, parsed options, limits, vaultDB, onBadNews, requestCleartext, onGone, clockNow

  readonly #scope: VaultScope
  // Every storage refusal, whichever call met it, passes by the refusal policy on its way out.
  readonly #vaultDB: RefusalPolicy.HeededVaultDB
  // Every failure of the device's own storage reaches the vault's callers as a condition, with a kind.
  readonly #deviceDB: DeviceDB
  // How long a lease lasts on this device: what a grant runs for, and what a lease taken up may run past.
  readonly #leaseMillis: number
  // How long a hello trusts the last read when its call says nothing: see hello().
  readonly #staleMillis: number
  readonly #onBadNews: BadNewsHandler | null
  readonly #requestCleartext: GuardedRequestCleartext | null
  readonly #logger: VaultLogger
  readonly #clock: Clock
  readonly #keyDeriver: KeyDeriver
  readonly #strengthChecker: GuardedStrengthChecker
  readonly #maxWhisperBytes: number
  readonly #maxBoxes: number
  readonly #maxVaultBytes: number
  // The bank's ear for a Vault object that went gone of itself: deleted, or found deleted or made anew.
  readonly #onGone: (refusal: VaultError) => void

  /** Birth a Vault object of `parts` from `born`, one read of storage and this device's store, as `bank.ensureVault` does: the bank's alone, exported by no entry point.
   * It takes the read as its picture, takes up the lease the read found when it fits, and starts
   * the watch on storage. `onGone` hears the refusal of a Vault object that went gone of itself.
   */
  static [bear](parts: VaultParts, born: BirthRead, onGone: (refusal: VaultError) => void): Vault {
    return new Vault(parts, born, onGone)
  }

  /** The Vault object {@link Vault[bear]} births. */
  private constructor(parts: VaultParts, born: BirthRead, onGone: (refusal: VaultError) => void) {
    const { format, applabel, user_id, vaultlabel, vault_tok: vaultTok, registered_at } = born.vaultRecord
    this.format = format
    this.applabel = applabel
    this.user_id = user_id
    this.vaultlabel = vaultlabel
    this.vault_tok = vaultTok
    this.registered_at = registered_at
    this.#stamp = Object.freeze({ format, applabel, user_id, vaultlabel, vault_tok: vaultTok, registered_at })
    this.#scope = CX.vaultScope.parse(parts)
    this.#vaultDB = RefusalPolicy.heed(parts.vaultDB, async (refusal) => { await this.#heedRefusal(refusal) })
    this.#deviceDB = deviceTroubleAsConditions(parts.deviceDB)
    this.#leaseMillis = parts.leaseMillis
    this.#staleMillis = parts.staleMillis
    this.#onBadNews = parts.onBadNews
    this.#requestCleartext = parts.requestCleartext
    this.#logger = parts.logger
    this.#clock = parts.clock
    this.#keyDeriver = parts.keyDeriver
    this.#strengthChecker = parts.strengthChecker
    this.#maxWhisperBytes = parts.maxWhisperBytes
    this.#maxBoxes = parts.maxBoxes
    this.#maxVaultBytes = parts.maxVaultBytes
    this.#onGone = onGone
    this.#vaultRecord = frozenVaultRecord(born.vaultRecord)
    this.#deviceId = born.record.device_id
    this.#snapshot = this.#picture(null)
    registerLeaseReader(this, () => this.#lease)
    const tools: VaultPrivateTools = {
      keyDeriver:  this.#keyDeriver,
      leaseMillis: this.#leaseMillis,
      demand:      (thing, call, opts) => { this.#demand(thing, { call, firstGate: opts?.firstGate === true }) },
    }
    registerProvingTools(this, {
      ...tools,
      vaultRecord: () => this.#vaultRecord,
      logger:      this.#logger,
      now:         () => this.#clockNow(),
      deviceId:    () => this.#deviceId,
      putLease:    (record) => this.#deviceDB.putLease(record),
      holdLease:   (stored) => this.#holdLease(Lease.make(this, stored)),
    })
    this.#gatingTools = {
      ...tools,
      freshen:     async (gating) => await this.#freshen(gating),
      putGate:     async (gate, call) => await this.#putGate(gate, call),
      delVault:    async (proving) => await this.#delVault(proving),
      afterDel:    async (vaultEpoch) => { await this.#afterDel(vaultEpoch) },
      takeUp:      async (gating, renewMillis) => await this.#takeUpFromPantry(gating, renewMillis),
      badOutcome:  (thrown) => this.#badOutcome(thrown),
      request:     this.#requestCleartext,
    }
    this.#takePicture({ fresh: this.#vaultRecord, listing: born.listing, leaseKept: null, readAt: born.readAt, leasesSeen: this.#leasesHeld })
    this.#takeUpAtBirth(born.leaseKept)
    this.#watchStorage()
    Object.freeze(this)
  }

  /** The host's clock, read now, rounded down to whole milliseconds: every time a record keeps is an integer. */
  #clockNow(): number { return Math.floor(this.#clock.now()) }
  // --

  // == [State and snapshot]: vaultRecord, lease, expiry, leaseInForce, listeners, snapshot, picture, replaceSnapshot

  // The vault record in hand, frozen: gateless while novel, and of one vault_tok for the Vault object's life.
  #vaultRecord: VaultRecord
  // This device's id for the scope, from its device record: every way in it seals carries it.
  #deviceId: string
  // The listing of the last read, as this device's own writes since have moved it: the sound boxes
  // and the damaged apart, each sorted by boxlabel, each list frozen.
  #boxes: readonly BoxSparse[] = Object.freeze([])
  #damagedBoxes: readonly BoxDamaged[] = Object.freeze([])
  // The lease this Vault object holds, opened: the one place it keeps the vaultKey. Dropping it locks.
  #lease: Lease | null = null
  // How many leases this Vault object has held, the last of them the one in hand: a read of this
  // device's store begun before the lease in hand was granted or taken up is older than it, and
  // cannot say it was revoked. Counted, not timed: a read begun in the same millisecond as a grant
  // is told apart.
  #leasesHeld = 0
  // Set once the bank lets the Vault object go, or it is deleted, or found deleted or made anew:
  // what every call refuses with from then on, 'vault_remade' for a vault made anew, else 'vault_gone'.
  #goneBy: (() => VaultError) | null = null
  // The timer that drops the lease at ask_passphrase_at. Null when none is held, or the one held
  // lasts until lock().
  #expiry: ReturnType<typeof setTimeout> | null = null

  readonly #listeners = new Set<() => void>()
  #freshness(now: number): VaultFreshness {
    if (this.#readRefused) { return 'refused' }
    return now - this.#readAt >= this.#staleMillis ? 'aged' : 'timely'
  }
  /** The lease in hand while it has not ended by `now`, else null. Drops nothing: an ended lease is dropped by its expiry, or by the call that finds it. */
  #leaseInForce(now = this.#clockNow()): Lease | null {
    const held = this.#lease
    return held === null || held.endsBy(now) ? null : held
  }
  // The ways in of each gate the vault has held, made once per gate. Every record
  // the vault holds is frozen as it takes it up (see frozenVaultRecord), so the ways in made of one,
  // and the vault record they are bound to, never change under it.
  readonly #modelled = new WeakMap<GateRecord, HeldWayins>()
  #wayinsOf(standing: GatedVaultRecord): HeldWayins {
    const { gate } = standing
    const known = this.#modelled.get(gate)
    if (known !== undefined) { return known }
    const kit = { keyDeriver: this.#keyDeriver }
    const wayins = Object.freeze({
      passphrase: Wayin.make(standing, gate.passphrase, kit),
      passkey:    gate.passkey === null ? null : Wayin.make(standing, gate.passkey, kit),
    })
    this.#modelled.set(gate, wayins)
    return wayins
  }
  /** The ways in of `standing`, the passphrase's first, as a list: none for a novel vault's record. */
  #wayinListOf(standing: VaultRecord | null): readonly (PassphraseWayin | PasskeyWayin)[] {
    if (standing === null || ! isGated(standing)) { return [] }
    const { passphrase, passkey } = this.#wayinsOf(standing)
    return passkey === null ? [passphrase] : [passphrase, passkey]
  }
  // Whether the last read of storage failed, as the snapshot's freshness says; and whether the
  // storage watch has warned of a failing streak of reads it has not yet seen end.
  #readRefused = false
  #watchWarned = false
  // The latest bad news, or what the handler threw at it: the snapshot's trouble. See [Bad news].
  #trouble: VaultError | null = null
  #snapshot: VaultSnapshot
  // The vault record the snapshot was last settled from: news of a damaged way in is told once per
  // way in it did not already show.
  #shownRecord: VaultRecord | null = null

  /** The snapshot the private state makes at `now`, frozen: the clock read now, unless the caller knows the time without it.
   * Each slice of `shown`, the snapshot published before, is kept wherever the new one holds the
   * same, so a slice keeps its identity until it changes.
   */
  #picture(shown: VaultSnapshot | null, now = this.#clockNow()): VaultSnapshot {
    const { gate } = this.#vaultRecord
    return Object.freeze({
      applabel:          this.applabel,
      user_id:           this.user_id,
      vaultlabel:        this.vaultlabel,
      format:            this.format,
      vault_tok:         this.vault_tok,
      gate:              keptIfSame(shown?.gate, gate === null ? null : gateSparseOf(gate)),
      boxes:             keptIfSame(shown?.boxes, this.#boxes),
      damagedBoxes:      keptIfSame(shown?.damagedBoxes, this.#damagedBoxes),
      capacity:          keptIfSame(shown?.capacity, this.#capacity()),
      ask_passphrase_at: this.#leaseInForce(now)?.ask_passphrase_at ?? null,
      freshness:         this.#freshness(now),
      trouble:           this.#trouble,
    })
  }

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped.
   * It keeps its identity, and tells nobody, until something really changed: useSyncExternalStore's
   * contract, and what spares React a render after a refresh that found nothing new. `now` is
   * the time it is reckoned at, the clock read now unless the caller knows it.
   */
  #replaceSnapshot(now?: number) {
    this.#shownRecord = this.#vaultRecord
    const next = this.#picture(this.#snapshot, now)
    // Trouble is told apart by identity, as two refusals of one kind read alike as JSON.
    if (next.trouble === this.#snapshot.trouble && stableJsonify({ ...next, trouble: null }) === stableJsonify({ ...this.#snapshot, trouble: null })) { return }
    this.#snapshot = next
    this.#listeners.forEach((listener) => { listener() })
  }
  // --

  // == [Reading storage]: refresh, readStorage, takeStorage, judgeRead, takePicture, readAt, helloWithin, watchStorage

  /** Bring the picture up to what storage holds, one read at a time: a refresh asked for while one runs shares it. */
  readonly #refresh = oneAtATime(() => this.#readStorage())

  /** One read of storage into the picture. One that fails leaves the picture as it stood, but for its freshness, and has the next hello read afresh. */
  async #readStorage() {
    try {
      await this.#takeStorage()
    } catch (err) {
      this.#readRefused = true
      this.#readAt = FarPast
      this.#replaceSnapshot()
      throw err
    }
    if (! this.#watchWarned) { return }
    this.#watchWarned = false
    this.#logger.log('Storage reads again after the failures the vault warned of: what it shows has caught up with storage.', { call: 'refresh' })
  }

  /** Fetch the vault record, listing and this device's lease, judge them against the picture in hand, and raise this device's record to what was taken.
   * The device record is read first, so a raise this device's own write made is never held against a
   * read served before that write landed. The judgment is synchronous ({@link Vault.#judgeRead}).
   */
  async #takeStorage() {
    const readAt = this.#clockNow()
    const leasesSeen = this.#leasesHeld
    const record = deviceRecordFor(this.#scope, valOf(await this.#deviceDB.getDeviceRecord(this.#scope)))
    const [read, leaseKept] = await Promise.all([this.#vaultDB.getVault(this.#scope), this.#deviceDB.getLease(this.#scope)])
    const verdict = this.#judgeRead(read, record)
    if (verdict === 'ignore') { return }
    if (verdict === 'behind') {
      const refusal = behindError()
      // Storage serving an older copy is not to be trusted with an unlocked vault.
      await this.#heedRefusal(refusal)
      throw refusal
    }
    const { boxes, damagedBoxes, ...fresh } = verdict
    this.#takePicture({ fresh: frozenVaultRecord(fresh), listing: { boxes, damagedBoxes }, leaseKept: valOf(leaseKept), readAt, leasesSeen })
    await this.#raiseRecordAfter(fresh.vault_epoch, 'refresh')
  }

  /** Judge one read of storage against the picture in hand and `record`, this device's record as read before it, synchronously: the read to take, `ignore`, or `behind`.
   * A Vault object let go meanwhile takes nothing. The vault deleted, or made anew under another
   * `vault_tok`, makes this Vault object gone for good, refusing 'vault_gone' or 'vault_remade'. A
   * read below the record's highest `vault_epoch` is `behind`, though the picture in hand is the
   * newer copy: the caller refuses it 'vault_behind', taking nothing. A read older than the picture
   * but not below the record (the same vault at a lower epoch: one served before this device's own
   * write, whose raise of the record came after the record was read) is ignored.
   */
  #judgeRead(read: (VaultRecord & Listing) | null, record: DeviceRecord | null): (VaultRecord & Listing) | 'ignore' | 'behind' {
    if (this.#goneBy !== null) { return 'ignore' }
    if (read === null) {
      const gone = goneError()
      this.#letGo(gone)
      throw gone
    }
    if (read.vault_tok !== this.#vaultRecord.vault_tok) {
      const remade = remadeError()
      this.#letGo(remade)
      throw remade
    }
    if (record !== null && read.vault_epoch < record.highest_vault_epoch) { return 'behind' }
    if (isOlderPicture(this.#vaultRecord, read)) { return 'ignore' }
    return read
  }

  /** Replace the picture with what one read found, synchronously: vault record and listing together, never a vault beside another's boxes.
   * The lease in hand is dropped, in memory only, when it no longer fits the vault record's ways in.
   * It is dropped too when this device's store holds no lease (a lock in another tab), or one under
   * another gate, unless the read began before the lease in hand was taken: a read older than the
   * lease, which changes nothing. A lease another tab's unlock or renewal wrote under the same gate
   * leaves it standing. None is taken up here. Bad news is told once the snapshot shows it.
   */
  #takePicture(found: { fresh: VaultRecord, listing: Listing, leaseKept: LeaseRecord | null, readAt: number, leasesSeen: number }) {
    const { fresh, listing } = found
    const shown = this.#damagedBoxes
    const shownWayins = this.#wayinListOf(this.#shownRecord)
    this.#vaultRecord = fresh
    this.#boxes = Object.freeze([...listing.boxes])
    this.#damagedBoxes = Object.freeze([...listing.damagedBoxes])
    this.#readRefused = false
    this.#readAt = found.readAt
    // A read with no damaged box or way in clears the trouble: nothing amiss stands. The listing is
    // published before its news is told, so a handler reading the vault sees what it lists.
    const damagedWayins = this.#wayinListOf(fresh).filter((wayin) => wayin.isDamaged())
    if (this.#damagedBoxes.length === 0 && damagedWayins.length === 0) { this.#trouble = null }
    const held = this.#lease
    const outdated = held !== null && ! fitsLease(fresh, held)
    const revoked = held !== null && found.leasesSeen >= this.#leasesHeld && ! standsBeside(found.leaseKept, held)
    if (outdated || revoked) { this.#dropLease() }
    this.#replaceSnapshot()
    this.#tellListingNews(shown)
    this.#tellWayinNews(damagedWayins, shownWayins)
  }

  // When the last read of storage to succeed began, by the vault's clock: what a hello's
  // staleMinutes are counted from. FarPast after a read that failed, so the next hello reads.
  #readAt = FarPast

  /** The host's hello: a read once the last began `staleMillis` ago or more; the snapshot replaced either way, so a lease run out meanwhile shows. */
  async #helloWithin(staleMillis: number): Promise<void> {
    if (this.#clockNow() - this.#readAt >= staleMillis) { await this.#refresh() }
    this.#replaceSnapshot()
  }

  /** Start the vault's watch on storage, once, at birth: letting the vault go ends it. */
  #watchStorage() {
    this.#unsubscribeDB = this.#vaultDB.subscribe(this.#scope, () => { void this.#watchRefresh() })
  }
  // --

  // == [Device record]: raiseRecordAfter

  /** This device's record of the scope raised to `vaultEpoch`, what a read or a write of its own just took: never a refusal.
   * A device store that fails to keep it is warned of: a missed raise only weakens the check for a
   * vault served behind what this device has seen, until a later read raises it.
   */
  async #raiseRecordAfter(vaultEpoch: number, call: VaultCall): Promise<void> {
    const raised = await this.#deviceDB.raiseDeviceRecord(deviceRecordOf(this.#scope, this.#deviceId, vaultEpoch))
    if (raised.ok) { return }
    this.#logger.warn("This device could not note the newest copy of the vault it has seen in its record of the vault: what it did stands, and the record catches up at a later read.", { call }, raised.err)
  }
  // --

  // == [Demand]: checkStanding, demand, demandAfterWait, inconsistencyWith, provingInconsistency, leaseRefusal, demandLease, gatedRecord

  /** Refuse once this Vault object is gone, 'vault_remade' for a vault made anew and 'vault_gone' otherwise: what every call asks first, and again after a wait it has no thing in hand for. */
  #checkStanding() {
    if (this.#goneBy !== null) { throw this.#goneBy() }
  }

  /** Refuse unless `thing` is consistent with the picture in hand, as {@link Vault.demandConsistentWith} says: the one demand, before and after each wait.
   * With `opts.firstGate`, `thing` was made for the vault's first gate, which is not yet written: a
   * gate in the picture is another device's first, and refuses 'gate_made_elsewhere', not 'gate_moved'.
   */
  #demand(thing: VaultMadeUnder, opts: { leaseBound?: boolean, firstGate?: boolean, call: VaultCall }) {
    const refusal = this.#inconsistencyWith(thing, { firstGate: opts.firstGate === true }) ?? (opts.leaseBound === true ? this.#leaseRefusal() : null)
    if (refusal === null) { return }
    // The thing's fields never reach the logger: a lease's are its scope and epoch, but the rule is one.
    this.#logger.log(`A call found the vault moved on from what it held, and refused it: ${refusal.refusalkind}.`, { call: opts.call, refusalkind: refusal.refusalkind })
    throw refusal
  }

  /** Demand `thing` right after a wait whose answer is `settled`, before anything is made of that answer, a refusal included: the vault moving on meanwhile refuses as the demand finds it.
   * A refusal from storage about the vault itself (`UntrustedStorageKinds`) comes as it came: heeding
   * it is what moved the picture. A lease-bound demand asks for the lease only of an answer that
   * came: a lease that refused its own use (`damaged_lease`) has dropped itself.
   */
  #demandAfterWait(settled: Outcome<unknown>, thing: VaultMadeUnder, opts: { leaseBound?: boolean, firstGate?: boolean, call: VaultCall }) {
    if (! settled.ok && UntrustedStorageKinds.some((kind) => isVaultError(settled.err, kind))) { throw settled.err }
    this.#demand(thing, { leaseBound: opts.leaseBound === true && settled.ok, firstGate: opts.firstGate === true, call: opts.call })
  }

  /** Why `thing` is not consistent with the picture in hand, the vault half (gone, made anew, ways in moved), or null when it is.
   * Ways in moved past a thing made for the first gate, before that gate is written
   * (`opts.firstGate`), are another device's first gate: 'gate_made_elsewhere'.
   */
  #inconsistencyWith(thing: VaultMadeUnder, opts?: { firstGate: boolean }): VaultError | null {
    if (this.#goneBy !== null) { return this.#goneBy() }
    const held = this.#vaultRecord
    const sameScope = (thing.applabel ?? this.#scope.applabel) === this.#scope.applabel
      && (thing.user_id ?? this.#scope.user_id) === this.#scope.user_id
      && (thing.vaultlabel ?? this.#scope.vaultlabel) === this.#scope.vaultlabel
    if (! sameScope || thing.vault_tok !== held.vault_tok) { return remadeError() }
    const moved = opts?.firstGate === true ? gateMadeElsewhereError : gateMovedError
    if (thing instanceof Proving) { return this.#provingInconsistency(thing as Proving, moved) }
    if (thing instanceof Gate) { return thing.base_epoch === held.gate_epoch || thing.isHeldBy(held) ? null : moved() }
    if ((thing.gate_epoch ?? held.gate_epoch) !== held.gate_epoch || (thing.vault_epoch ?? held.vault_epoch) > held.vault_epoch) { return moved() }
    return null
  }

  /** Why `proving` is not consistent with the gate in hand: its header is in no wayin of the gate, which moved since it was sealed (`moved`, 'gate_moved' or 'gate_made_elsewhere'), or its gating landed ('gating_landed').
   * A fresh header is in no gate until the one carrying it is stored: until then the gate it was
   * sealed under must stand.
   */
  #provingInconsistency(proving: Proving, moved: () => VaultError): VaultError | null {
    const held = this.#vaultRecord
    if (! proving.isCarriedBy(held) && proving.gate_epoch !== held.gate_epoch) { return moved() }
    if (proving.gating.landed) { return gatingLandedError() }
    return null
  }

  /** Why the lease half refuses: no lease in hand, or one ended, which is dropped as its expiry drops it; null while one is in force. */
  #leaseRefusal(): VaultError | null {
    if (this.#leaseInForce() !== null) { return null }
    if (this.#lease !== null) { this.#dropLease() }
    return lockedError()
  }

  /** The lease in hand, for `call` about to use it: demanded to stand, consistent with the picture, and not ended, or 'vault_locked'. */
  #demandLease(call: VaultCall): Lease {
    const lease = this.#lease
    if (lease === null) { throw lockedError() }
    this.#demand(lease, { leaseBound: true, call })
    return lease
  }

  /** The vault record in hand, once the vault has its passphrase: 'absent_vault' while it is novel. */
  #gatedRecord(): GatedVaultRecord {
    if (! isGated(this.#vaultRecord)) {
      throw new VaultError('absent_vault', 'This vault has no passphrase yet, so nothing can prove this change: set its passphrase first, as ensureUnlocked() or putWayin() does.')
    }
    return this.#vaultRecord
  }
  // --

  // == [Gating]: gating, gatingTools, ensureUnlocked, leaseLastsPast, gatingFor, raiseGating, landGating, freshen, delVault, afterDel

  // The gating standing now, if any: one per vault, and every call that needs the user waits on it
  // or on its settling. See ensureUnlocked() and gatingFor().
  #gating: RaisedGating | null = null
  // What a gating reaches of this Vault object, which no getter shows: see GatingTools.
  readonly #gatingTools: GatingTools

  /** Have the vault unlocked: at once while a lease of the ways in held stands past `renewMillis` from now, else once the gating standing or raised now settles.
   * See {@link Vault.ensureUnlocked}. An unlocking gating standing (`unlock_vault`,
   * `initialize_gate`) is joined: its refusal is this call's, as one dialog answers every call
   * waiting on it, and its success is checked again, since it may have taken up a lease ending
   * within this call's `renewMillis`. Any other kind is waited out, whatever it settles with, and
   * the question asked again. The call raises at most one gating of its own, and hears what that
   * settles with. `shouldAsk` runs only when the vault must ask, after the hello and before any
   * gating is joined or raised: a call checks there what it can know without the key, so a call
   * that cannot land never prompts. It resolves true once unlocked, demanding nothing after: the
   * call's own operation demands on the lease first. It resolves false, asking nobody, when
   * `shouldAsk` says not to ask.
   */
  async #ensureUnlocked(renewMillis: number, shouldAsk?: () => boolean): Promise<boolean> {
    await this.#helloWithin(this.#staleMillis)
    // The bank letting the vault go during the hello: no gating is raised over a gone Vault object.
    this.#checkStanding()
    for (;;) {
      if (this.#leaseLastsPast(renewMillis)) { return true }
      // The threshold is the truth: a lease past its deadline goes now, should its timer run late.
      if (this.#lease !== null && this.#leaseInForce() === null) { this.#dropLease() }
      const standing = this.#gating
      if (standing !== null && ! UnlockingKinds.has(standing.gatingkind)) {
        await standing.settled
        this.#checkStanding()
        continue
      }
      if (shouldAsk?.() === false) { return false }
      const settled = await (standing ?? this.#raiseGating(isGated(this.#vaultRecord) ? 'unlock_vault' : 'initialize_gate', 'ensureUnlocked', renewMillis)).settled
      // A let-go lands the gating as a lock does, but its waiters hear the Vault object is gone.
      this.#checkStanding()
      valOf(settled)
      if (standing === null) { return true }
    }
  }

  /** True while the lease in hand fits the ways in the picture holds and does not end within `renewMillis` from now. */
  #leaseLastsPast(renewMillis: number): boolean {
    const held = this.#lease
    if (held === null) { return false }
    return fitsLease(this.#vaultRecord, held) && ! held.endsBy(this.#clockNow() + renewMillis)
  }

  /** Join the gating standing when it is of the kind `kindNow` names, else wait it out and raise one of that kind, for `call`; resolve once it settled with success.
   * `kindNow` judges the picture in hand each time round, and may refuse.
   */
  async #gatingFor(kindNow: () => GatingKind, call: GatingCall): Promise<void> {
    for (;;) {
      this.#checkStanding()
      const gatingkind = kindNow()
      const standing = this.#gating
      if (standing !== null && standing.gatingkind !== gatingkind) {
        await standing.settled
        continue
      }
      const settled = await (standing ?? this.#raiseGating(gatingkind, call, null)).settled
      // A deletion that settled leaves the Vault object gone, by design; any other waiter hears a let-go as gone.
      if (call !== 'del' || ! settled.ok) { this.#checkStanding() }
      valOf(settled)
      return
    }
  }

  /** Raise a gating of `gatingkind` for `call`, standing until it settles: with `renewMillis`, it consults this device's store first. */
  #raiseGating(gatingkind: GatingKind, call: GatingCall, renewMillis: number | null): RaisedGating {
    const raised: RaisedGating = RaisedGating.raise(gatingkind, call, this, this.#gatingTools, () => {
      if (this.#gating === raised) { this.#gating = null }
    })
    this.#gating = raised
    raised.run(renewMillis)
    return raised
  }

  /** A `lock()` has landed, or the vault went gone: the gating standing, if any, refuses its waiters, 'vault_locked' or `told`, and settles `lockLanded`.
   * It stops standing as it settles. A deletion whose write is sent stands until its chain settles
   * it, so no call raises a gating over a vault being deleted.
   */
  #landGating(told?: VaultError) {
    this.#gating?.landLock(told)
  }

  /** An attempt's first step: storage read now through the refresh join, the Vault object demanded to stand and `gating` not to have landed, resolving the vault record in hand. */
  async #freshen(gating: RaisedGating): Promise<VaultRecord> {
    this.#checkStanding()
    await this.#helloWithin(0)
    this.#checkStanding()
    if (gating.landed) { throw gatingLandedError() }
    return this.#vaultRecord
  }

  /** Delete the vault `proving` proved, within its gating's hold, with `VaultDB.delVault` expecting the `vault_tok` and `gate_epoch` in hand, resolving the tombstone's `vault_epoch`.
   * It demands on the proving before the write. A deletion storage refused is told as the vault now
   * stands; one that landed is this vault's, by its expectation, whatever a read has made of it
   * meanwhile.
   */
  async #delVault(proving: PassphraseProving): Promise<number> {
    this.#demand(proving, { call: 'del' })
    const doomed = this.#vaultRecord
    const deleted = await outcomeOf(() => this.#vaultDB.delVault(this.#scope, { vault_tok: doomed.vault_tok, gate_epoch: doomed.gate_epoch }))
    if (! deleted.ok) {
      this.#demandAfterWait(deleted, proving, { call: 'del' })
      throw deleted.err
    }
    return deleted.val.vault_epoch
  }

  /** Once the gating that deleted the vault settled: lock as `lock()` does, let this Vault object go, and raise the device record to `vaultEpoch`, the tombstone's. An erase that fails is only logged: the vault is deleted all the same. */
  async #afterDel(vaultEpoch: number): Promise<void> {
    const erased = this.#lockNow()
    // The bank hears it, and births the next life when asked.
    this.#letGo(goneError())
    await this.#raiseRecordAfter(vaultEpoch, 'del')
    const done = await erased
    if (! done.ok) {
      this.#logger.warn("The vault was deleted, but this device's lease of it could not be erased: no Vault object takes it up, as it names the vault deleted.", { call: 'del' }, done.err)
    }
  }
  // --

  // == [Ways in]: putGate, gateWriteRefusal, takeOwnWrite

  /** Store `gate` over its base, the gate in hand, with `VaultDB.putVaultRecord` expecting its `vault_tok` and base epoch, resolving the gate as stored.
   * It demands on the gate before and after the write. The picture takes what was stored, unless
   * a read has already taken a later copy, and the device record is raised to its `vault_epoch`.
   * A first gate losing to another device's refuses 'gate_made_elsewhere', and the next hello reads
   * the gate that stands; any other stale write refuses 'stale_write', naming nothing stored.
   */
  async #putGate(gate: Gate, call: GatingCall): Promise<Gate> {
    const firstGate = gate.base_epoch === 0
    this.#demand(gate, { call, firstGate })
    const held = this.#vaultRecord
    // `vault_epoch` is the one the store will set, the standing one plus one; the store ignores what it is handed.
    const drafted = frozenVaultRecord({ ...held, vault_epoch: held.vault_epoch + 1, gate_epoch: gate.gate_epoch, gate: gate.record })
    const written = await outcomeOf(() => this.#vaultDB.putVaultRecord(drafted, { vault_tok: gate.vault_tok, gate_epoch: gate.base_epoch }))
    // A read meanwhile may have taken up the other device's first gate, which refused this one:
    // 'gate_made_elsewhere', not a gate moved. A gate stored is this one, held or since moved past.
    this.#demandAfterWait(written, gate, { call, firstGate: firstGate && ! written.ok })
    if (! written.ok) { throw this.#gateWriteRefusal(gate, written.err) }
    const next = frozenVaultRecord(written.val) as GatedVaultRecord
    const stored = Gate.of(next, { keyDeriver: this.#keyDeriver })
    this.#demand(stored, { call })
    // The picture takes it first, so the record raised after never outruns the picture.
    this.#takeOwnWrite(next)
    await this.#raiseRecordAfter(next.vault_epoch, call)
    return stored
  }

  /** What a refused write of `gate` refuses with, as storage's refusal `err` shows what stands.
   * Another `vault_tok` standing, or none, is the vault made anew or deleted elsewhere: the Vault
   * object goes for good, as a refresh finding it so does ('vault_remade', 'vault_gone'). A first
   * gate losing to another device's is 'gate_made_elsewhere', and the next hello reads the gate that
   * stands. Any other stale write is 'stale_write', naming nothing stored. A refusal naming no
   * stored vault record passes as it came.
   */
  #gateWriteRefusal(gate: Gate, err: VaultError): VaultError {
    const winner = isVaultError(err, 'stale_write') ? err.meta?.vault_stored : undefined
    if (winner === undefined) { return err }
    if (winner?.vault_tok !== gate.vault_tok) {
      const told = winner === null ? goneError() : remadeError()
      this.#letGo(told)
      return told
    }
    if (gate.base_epoch === 0 && isGated(winner)) {
      // The gate that stands is another device's: the next hello reads it, whatever staleMinutes says.
      this.#readAt = FarPast
      return gateMadeElsewhereError()
    }
    // Not the VaultDB's message, which sends the reader to a meta this refusal does not carry.
    return new VaultError('stale_write', "The vault changed in storage since this device read it -- a vault unlocker was changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying.", err.cause === undefined ? {} : { cause: err.cause })
  }

  /** Take `next`, a vault record a write of this Vault object's own just stored, into the picture, unless a read has already taken a later copy, or the Vault object went gone meanwhile: then the grant that follows finds the vault moved on, and writes no lease.
   * A lease in hand of the gate before is dropped from memory, as a read taking a new gate drops
   * it: the grant that follows holds the new one, and a grant that fails leaves the vault locked,
   * as its snapshot then says.
   */
  #takeOwnWrite(next: GatedVaultRecord) {
    if (this.#goneBy !== null || isOlderPicture(this.#vaultRecord, next)) { return }
    this.#vaultRecord = next
    const held = this.#lease
    if (held !== null && ! fitsLease(next, held)) {
      this.#dropLease()
      return
    }
    this.#replaceSnapshot()
  }

  // --

  // == [Locking and expiry]: lockNow, heedRefusal, letGo, dropLease, armExpiry, disarmExpiry

  /** Lock, all a caller can see at once and in this order: the lease and its expiry dropped, the gating standing landed on, the snapshot replaced; then the erase, whose promise it returns.
   * Every lock goes through here. Nothing is awaited before the erase is issued, so the device
   * store applies it after any lease write already issued: a grant under way when it lands is
   * erased behind it, and holds nothing, its gating landed. A pantry consult under way takes
   * nothing up, for the same reason.
   */
  #lockNow(): Promise<Outcome<void>> {
    this.#lease = null
    this.#disarmExpiry()
    this.#landGating()
    this.#replaceSnapshot()
    return this.#deviceDB.delLease(this.#scope)
  }

  /** Do what the refusal policy says of `refusal` before it is thrown: lock, as `lock()` does, for storage the vault cannot trust.
   * That is a user no longer signed in, or an older copy of the vault. A device store that will not
   * erase the lease is only logged, as the refusal is what the caller must hear. Storage it cannot
   * trust has the next hello read afresh.
   */
  async #heedRefusal(refusal: VaultError) {
    if (UntrustedStorageKinds.some((kind) => isVaultError(refusal, kind))) { this.#readAt = FarPast }
    if (RefusalPolicy.decide(refusal) !== 'lock') { return }
    const why = refusal.refusalkind === 'vault_behind'
      ? 'Storage handed back an older copy of the vault than this device has seen'
      : 'Storage no longer serves the user this vault was opened for -- signed out, or another user signed in --'
    const wasUnlocked = this.#lease !== null
    // A lock: the gating standing lands, its waiters hearing the refusal itself, so a pantry
    // consult under way takes nothing up.
    this.#landGating(refusal)
    this.#dropLease()
    const erased = await this.#deviceDB.delLease(this.#scope)
    if (! erased.ok) {
      this.#logger.warn(`${why} so the vault locked, but this device's lease could not be revoked: the next Vault object born on this device, as at the next page load, may take it up.`, { call: 'untrustedStorage' }, erased.err)
    }
    if (wasUnlocked) {
      this.#logger.log(`${why} so the vault locked, as it always does when storage cannot be trusted with it. It asks for the passphrase again once storage is sound.`, { call: 'untrustedStorage' })
    }
  }

  /** Make this Vault object gone for good: every call refuses as `told` did ('vault_remade' for a vault made anew, else 'vault_gone'), the prompt up ends as a lock ends it (its waiters refusing as every call does), the lease is dropped from memory, erasing nothing, and the watch on storage ends.
   * `told`, when the Vault object went gone of itself, is what the bank hears; the bank letting it
   * go passes none. A second call does nothing.
   */
  #letGo(told: VaultError | null) {
    if (this.#goneBy !== null) { return }
    this.#goneBy = told?.refusalkind === 'vault_remade' ? remadeError : goneError
    this.#landGating(this.#goneBy())
    this.#dropLease()
    // A second unsubscribe would count down a watch an adapter shares.
    this.#unsubscribeDB?.()
    this.#unsubscribeDB = null
    if (told !== null) { this.#onGone(told) }
  }

  /** Drop the lease from memory, erasing nothing, and say so: what the expiry, the vault going gone, a demand finding the lease ended, and a read finding it revoked do.
   * Another tab may hold a lease renewed under the same scope, so nothing in the device store is
   * touched, and no prompt is landed on: an attempt made as the lease ends completes. The expiry
   * passes `now`, its deadline, so the snapshot is reckoned without a read of the clock.
   */
  #dropLease(now?: number) {
    this.#lease = null
    this.#disarmExpiry()
    this.#replaceSnapshot(now)
  }

  /** Arm the one expiry timer, in place of any, to drop the lease at `until`, counted from `now`; none for a lease that lasts until `lock()`. */
  #armExpiry(until: number, now: number) {
    this.#disarmExpiry()
    if (isFarFuture(until)) { return }
    // The timer knows the time it fires at, its deadline, and reads no clock: one that throws
    // there would throw out of the timer, the lease dropped and the snapshot never replaced.
    this.#expiry = unrefTimeout(() => { this.#dropLease(until) }, until - now)
  }

  #disarmExpiry() {
    if (this.#expiry === null) { return }
    clearTimeout(this.#expiry)
    this.#expiry = null
  }
  // --

  // == [Lease]: holdLease, takeUpFromPantry, takeUpAtBirth, fitsTakeUp

  /** Hold `lease`, granted or taken up, as the vault's lease, resolving it: its expiry armed, the snapshot replaced. */
  #holdLease(lease: Lease): Lease {
    this.#lease = lease
    this.#leasesHeld += 1
    this.#armExpiry(lease.ask_passphrase_at, this.#clockNow())
    this.#replaceSnapshot()
    return lease
  }

  /** The gating's first step, before the host is asked: take up this device's lease when another tab granted one that fits, true when taken.
   * It fits by {@link Vault.#fitsTakeUp}, ending past `renewMillis` from now. A lock, a decline or
   * the vault going while the store is read lands the gating, and a landed gating takes nothing up.
   * A lease that does not fit is left where it lies, never erased: it may be another tab's, and the
   * next grant writes over it. A record that is no lease of this scope is warned of, and left too.
   * Its wrap is not tried: a damaged one refuses at its first use, 'damaged_lease'.
   */
  async #takeUpFromPantry(gating: RaisedGating, renewMillis: number): Promise<boolean> {
    const kept = await this.#deviceDB.getLease(this.#scope)
    this.#checkStanding()
    if (gating.landed) { return false }
    const record = valOf(kept)
    if (record === null) { return false }
    let lease: Lease
    try {
      lease = Lease.make(this, record)
    } catch {
      // Neither the record nor what it failed is told: the record holds key material.
      this.#logger.warn("This device's lease could not be read, so it was not taken up, and the vault asks for the passphrase. It was left where it lies: the next unlock writes over it.", { call: 'ensureUnlocked' })
      return false
    }
    if (! this.#fitsTakeUp(lease, renewMillis)) { return false }
    this.#holdLease(lease)
    return true
  }

  /** Take up `kept`, the lease the vault's birth found in this device's store, when it fits ({@link Vault.#fitsTakeUp}): the vault is born unlocked, its expiry armed.
   * One that does not fit, or is no lease of this scope, is left where it lies, never erased: it may
   * be another tab's, of another life, and a grant writes over it. Its wrap is not tried: a damaged
   * one refuses at its first use, 'damaged_lease'.
   */
  #takeUpAtBirth(kept: LeaseRecord | null) {
    if (kept === null) { return }
    let lease: Lease
    try {
      lease = Lease.make(this, kept)
    } catch {
      // Neither the record nor what it failed is told: the record holds key material.
      this.#logger.warn("This device's lease could not be read, so the vault was born locked, and asks for the passphrase again. It was left where it lies: the next unlock writes over it.", { call: 'hello' })
      return
    }
    if (! this.#fitsTakeUp(lease, 0)) { return }
    this.#holdLease(lease)
  }

  /** True when `lease`, a stored lease about to be taken up, fits: of the gate in hand (its `vault_tok` and `gate_epoch`), ending past `renewMillis` from now, and no later than this vault's `leaseHours` from now.
   * The last is what makes lowering `leaseHours` take hold on each device, and what refuses a lease
   * granted before the clock stepped back. The one predicate wherever a stored lease is taken up:
   * birth passes 0, and a gating's pantry consult the `renewMinutes` of the call that raised it, so
   * a call asking ahead of the lease's end never takes its own twilight lease back up.
   */
  #fitsTakeUp(lease: Lease, renewMillis: number): boolean {
    const now = this.#clockNow()
    return fitsLease(this.#vaultRecord, lease) && ! lease.endsBy(now + renewMillis) && lease.endsBy(now + this.#leaseMillis)
  }
  // --

  // == [Box limits]: boxWeight, capacity, checkWhisperFits, checkRoomFor

  /** What one box counts for against the vault's storage: room for a whisper and sidecar of `maxWhisperBytes`, its fixed fields, and its names as they are.
   * The whisper's room is {@link StoredBytesPerWhisperByte} bytes for each byte of `maxWhisperBytes`.
   */
  #boxWeight(boxlabel: string) {
    return (this.#maxWhisperBytes * StoredBytesPerWhisperByte) + BoxFixedBytes + jsonBytes([this.#scope, boxlabel])
  }

  /** Every box last listed, sound and damaged: each holds room in the vault. */
  #listed(): readonly (BoxSparse | BoxDamaged)[] { return [...this.#boxes, ...this.#damagedBoxes] }

  /** The room the vault has, frozen, reckoned from the boxes last listed, sound and damaged, as `#checkRoomFor` reckons it. */
  #capacity(): VaultSnapshot['capacity'] {
    const listed = this.#listed()
    const bytesUsed = listed.reduce((sum, box) => sum + this.#boxWeight(box.boxlabel), 0)
    return Object.freeze({
      boxes: Object.freeze({ used: listed.length, max: this.#maxBoxes }),
      bytes: Object.freeze({ used: bytesUsed, max: this.#maxVaultBytes }),
    })
  }

  /** Refuse 'whisper_too_large' for a whisper whose JSON, with the sidecar's beside it, is over `maxWhisperBytes`, quoting neither; the sidecar alone is weighed when the whisper is left out. */
  #checkWhisperFits(whisper: Whisper | undefined, sidecar: Sidecar) {
    const whisperBytes = whisper === undefined ? new Uint8Array() : whisperBytesOf(whisper)
    const weight = whisperBytes.length + new TextEncoder().encode(stableJsonify(sidecar)).length
    whisperBytes.fill(0)
    if (weight <= this.#maxWhisperBytes) { return }
    throw new VaultError('whisper_too_large', `That whisper and its box's sidecar are over this vault's limit of ${String(this.#maxWhisperBytes)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Bank.make.`)
  }

  /** Refuse 'vault_full' for a new box while the vault holds `maxBoxes`, or one that would take it past `maxVaultBytes`.
   * Each box is weighed by `#boxWeight`. It counts from the boxes last listed, so a store costs no
   * extra read: a listing a moment stale may refuse, and a hello cures it. A replacement, sealed
   * over a base, always passes.
   */
  #checkRoomFor(boxlabel: string, base: BoxBase | null) {
    // A replacement weighs what it replaces, so it never makes the vault fuller: it always lands.
    if (base !== null) { return }
    const others = this.#listed().filter((box) => box.boxlabel !== boxlabel)
    if (others.length >= this.#maxBoxes) {
      throw new VaultError('vault_full', `This vault already holds its limit of ${String(this.#maxBoxes)} boxes: remove one before storing another. A vault meant to hold more can be opened with a larger maxBoxes, up to what its storage adapter allows.`)
    }
    const othersWeight = others.reduce((sum, box) => sum + this.#boxWeight(box.boxlabel), 0)
    if (othersWeight + this.#boxWeight(boxlabel) > this.#maxVaultBytes) {
      throw new VaultError('vault_full', `This vault has no room for that box in the ${String(this.#maxVaultBytes)} bytes its storage holds of one vault, counting each box's boxlabel and room for a whisper and sidecar of maxWhisperBytes: remove a box, or store under a shorter boxlabel.`)
    }
  }
  // --

  // == [Reading boxes]: listedRevisionOf, isListed, isListedDamaged, getBoxUnlocked, readBox, boxReadRefusal

  /** The revision the listing names for the box under `boxlabel`, sound or damaged; null for none listed, or a damaged record that holds none.
   * Storage arbitrates a write that names it, so a listing gone stale costs a refusal and a second
   * store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#listedOf(boxlabel)?.revision_tok ?? null }

  /** The listing's entry for the box under `boxlabel`, sound or damaged, or undefined for none. */
  #listedOf(boxlabel: string): BoxSparse | BoxDamaged | undefined { return this.#listed().find((box) => box.boxlabel === boxlabel) }

  /** `boxlabel`, once it is a label: 'bad_scope' otherwise, naming the field and quoting none of it. */
  #checkedBoxlabel(boxlabel: unknown): string { return CX.boxscope.parse({ ...this.#scope, boxlabel }).boxlabel }

  /** True when the snapshot's listing shows a box under `boxlabel`: what a locked vault can know before it asks for a proof. Reads nothing. */
  #isListed(boxlabel: string): boolean { return this.#listedOf(boxlabel) !== undefined }

  /** True when the snapshot's listing shows the box under `boxlabel` as damaged. */
  #isListedDamaged(boxlabel: string): boolean { return this.#damagedBoxes.some((box) => box.boxlabel === boxlabel) }

  /** The box under `boxlabel`, once the vault is unlocked for it; null when there is none, or when a locked vault's listing shows none, asking nobody. */
  async #getBoxUnlocked(boxlabel: string, call: VaultCall): Promise<Box | null> {
    this.#checkStanding()
    const label = this.#checkedBoxlabel(boxlabel)
    // Checked before the user is asked for anything: a box the listing does not show is none.
    if (! await this.#ensureUnlocked(0, () => this.#isListed(label))) { return null }
    this.#demandLease(call)
    return await this.#readBox(label, call)
  }

  /** The box under `boxlabel` as storage holds it in this vault, or null when none stands; the vault demanded after the read, then the lease.
   * A box another device wrote is what storage holds, not drift. The demand on what the read was
   * made under cannot see a lock, which moves no `vault_tok`, so the lease is demanded again before
   * anything is handed back: a lock landing while storage is read refuses 'vault_locked', a box or none.
   */
  async #readBox(boxlabel: string, call: VaultCall): Promise<Box | null> {
    const read = await outcomeOf(() => this.#vaultDB.getBox(this.#scope, boxlabel, { vault_tok: this.vault_tok }))
    // A vault that moved on meanwhile refuses as the demand finds it, never as what its read found.
    this.#demandAfterWait(read, { vault_tok: this.vault_tok }, { call })
    if (! read.ok) { throw this.#boxReadRefusal(read.err) }
    if (read.val === null) {
      this.#demandLease(call)
      return null
    }
    const fetched = Box.make(this, read.val, vaultSparseOf(this.#vaultRecord))
    this.#demandLease(call)
    return fetched
  }

  /** What a box read that storage refused refuses with: storage's 'vault_mismatch' as 'vault_gone', the Vault object gone with it; any other as it came.
   * The vault this device read was deleted, or deleted and made anew, elsewhere, which its picture
   * does not show yet. As a refresh finding it so does, the Vault object goes for good, every later
   * call refusing 'vault_gone', and the bank births the next when asked.
   */
  #boxReadRefusal(err: VaultError): VaultError {
    if (! isVaultError(err, 'vault_mismatch')) { return err }
    const gone = new VaultError('vault_gone', 'The vault this device held was deleted, or deleted and made anew, on another device, so no box was read, and this Vault object is gone: what stands now is another vault, or none. Ask the bank for the vault again (bank.ensureVault) to see what stands.', { cause: err })
    this.#letGo(gone)
    return gone
  }
  // --

  // == [Writing boxes]: sealAndPutBox, listedBase, storedBase, damagedBase, writeOver, updateBoxListingOf, dropBoxListingOf

  /** Seal and store the box `boxlabel`, as `putBox()` says, once the vault is unlocked: one read when the sidecar or whisper is left out, one seal, one write.
   * It demands the lease first, and the box after its seal; what storage stored is taken into the
   * listing after its own demand, a lock meanwhile letting it land.
   */
  async #sealAndPutBox(boxlabel: string, givenSidecar: Sidecar | undefined, givenWhisper: Whisper | undefined): Promise<Box> {
    const lease = this.#demandLease('putBox')
    const readFirst = givenSidecar === undefined || givenWhisper === undefined
    const { base, sidecar, whisper } = readFirst
      ? await this.#storedBase(boxlabel, givenSidecar, givenWhisper)
      : { base: this.#listedBase(boxlabel), sidecar: givenSidecar, whisper: givenWhisper }
    // A lock landing while the box was read and opened refuses, sealing nothing.
    if (readFirst) { this.#demand(lease, { leaseBound: true, call: 'putBox' }) }
    // A sidecar kept counts toward the limit as one given does, weighed before any key is made.
    this.#checkWhisperFits(whisper, sidecar)
    this.#checkRoomFor(boxlabel, base)
    const sealed = await Box.trySeal(this, { boxlabel, sidecar, base }, whisper, { madeUnder: vaultSparseOf(this.#vaultRecord), now: this.#clockNow() })
    // A lock landing during the seal refuses, writing nothing.
    this.#demandAfterWait(sealed, lease, { leaseBound: true, call: 'putBox' })
    const box = valOf(sealed)
    this.#demand(box, { call: 'putBox' })
    // Lands only in the vault this whisper is sealed for, over the revision it was sealed from: a
    // vault reborn elsewhere, or a box written meanwhile by another device, refuses it.
    const written = await outcomeOf(() => this.#writeOver(box, { vault_tok: box.vault_tok, revision_tok: box.baseRevisionTok }))
    // A lock landing during the write lets it land; the vault moving on meanwhile refuses as the demand finds it.
    this.#demandAfterWait(written, { vault_tok: box.vault_tok }, { call: 'putBox' })
    return this.#updateBoxListingOf(valOf(written))
  }

  /** What a whole `putBox()` seals over, reading nothing: the listing's entry for `boxlabel`, its revision and `registered_at` adopted as they stand, or none for a box it does not show, which is a new box.
   * A box listed damaged gives its revision alone; one naming none refuses 'damaged_box'.
   */
  #listedBase(boxlabel: string): BoxBase | null {
    const sound = this.#boxes.find((box) => box.boxlabel === boxlabel)
    if (sound !== undefined) { return { revision_tok: sound.revision_tok, registered_at: sound.registered_at } }
    const listed = this.#damagedBoxes.find((box) => box.boxlabel === boxlabel)
    if (listed === undefined) { return null }
    // A box listed damaged naming no revision could be cleared only by a delete before the store,
    // a second call another device's write could fall between and be lost: the user deletes it, then stores.
    if (listed.revision_tok === null) { throw damagedBeyondNaming() }
    return { revision_tok: listed.revision_tok }
  }

  /** What a `putBox()` leaving out the sidecar or the whisper seals: the box read from storage, opened, its sidecar and whisper kept where not given, and its revision the base.
   * Opening it proves what is kept unaltered. A box that will not read or open is written over as
   * new, keeping nothing, when the whisper is given, and refuses 'damaged_box' when it is not; none
   * standing refuses 'no_whisper' when the whisper is not given.
   */
  async #storedBase(boxlabel: string, givenSidecar: Sidecar | undefined, givenWhisper: Whisper | undefined): Promise<{ base: BoxBase | null, sidecar: Sidecar, whisper: Whisper }> {
    const read = await outcomeOf(() => this.#readBox(boxlabel, 'putBox'))
    this.#demandAfterWait(read, { vault_tok: this.vault_tok }, { call: 'putBox' })
    if (! read.ok) {
      if (givenWhisper === undefined || ! isVaultError(read.err, 'damaged_box')) { throw read.err }
      return { base: this.#damagedBase(boxlabel), sidecar: givenSidecar ?? {}, whisper: givenWhisper }
    }
    const stored = read.val
    if (stored === null) {
      if (givenWhisper === undefined) { throw noWhisper() }
      return { base: null, sidecar: givenSidecar ?? {}, whisper: givenWhisper }
    }
    const opened = await stored.tryExtractWhisper()
    this.#demandAfterWait(opened, stored, { leaseBound: true, call: 'putBox' })
    if (! opened.ok) {
      if (givenWhisper === undefined || ! isVaultError(opened.err, 'damaged_box')) { throw opened.err }
      // Nothing in a box that will not open vouches for its fields: it is written over as new.
      return { base: { revision_tok: stored.revision_tok }, sidecar: givenSidecar ?? {}, whisper: givenWhisper }
    }
    return { base: stored, sidecar: givenSidecar ?? stored.sidecar, whisper: givenWhisper ?? opened.val }
  }

  /** What a store seals over a box storage refused as damaged: the revision the listing names, or none for a box it does not show yet, which storage refuses while one stands; 'damaged_box' for one listed with none.
   * It is `#listedBase`'s revision alone: a box that will not read vouches for none of its fields.
   * The next hello lists it, with its revision for the next store.
   */
  #damagedBase(boxlabel: string): BoxBase | null {
    const listed = this.#listedBase(boxlabel)
    return listed === null ? null : { revision_tok: listed.revision_tok }
  }

  /** Write `box` over `expected`, as `putBox()` does, resolving the record as stored: one write, which storage refuses unless the revision `expected` names still stands.
   * A stale refusal comes as storage gave it, the box that stands as its `meta.box_stored`.
   * Storage's 'invalid_box' becomes 'bad_record', as this vault sealed the box, and its
   * 'vault_mismatch' becomes 'stale_write', as the vault this device read is gone.
   */
  async #writeOver(box: Box, expected: BoxExpectation): Promise<BoxRecord> {
    try {
      return await this.#vaultDB.putBox(this.#scope, expected, box.record)
    } catch (err) {
      if (isVaultError(err, 'invalid_box')) {
        throw new VaultError('bad_record', 'Storage refused the box this vault sealed as one this package would not build, so nothing was written. This is a bug: report it, with this error.', { cause: err })
      }
      if (isVaultError(err, 'vault_mismatch')) {
        throw new VaultError('stale_write', 'The vault was deleted, or deleted and made anew, on another device while this one was storing into it, so nothing was written. Read the vault again (hello) to see what stands now.', { cause: err })
      }
      throw err
    }
  }

  /** Update the box listing with `stored`, the record a box write just landed in this vault, resolving the box it makes under the picture in hand. */
  #updateBoxListingOf(stored: BoxRecord): Box {
    const box = Box.make(this, stored, vaultSparseOf(this.#vaultRecord))
    const entry = boxSparseOf(stored)
    this.#boxes = Object.freeze([...this.#boxes.filter((listed) => listed.boxlabel !== entry.boxlabel), entry].toSorted((one, two) => byCodeUnit(one.boxlabel, two.boxlabel)))
    this.#damagedBoxes = Object.freeze(this.#damagedBoxes.filter((listed) => listed.boxlabel !== entry.boxlabel))
    this.#replaceSnapshot()
    return box
  }

  /** Drop the box `deleted` names, which a delete just removed, from the listing, once it is demanded consistent: a lock meanwhile lets it land. Resolves it, frozen. */
  #dropBoxListingOf(deleted: DeletedBox): DeletedBox {
    this.#demand(deleted, { call: 'delBox' })
    this.#boxes = Object.freeze(this.#boxes.filter((box) => box.boxlabel !== deleted.boxlabel))
    this.#damagedBoxes = Object.freeze(this.#damagedBoxes.filter((box) => box.boxlabel !== deleted.boxlabel))
    this.#replaceSnapshot()
    return Object.freeze({ ...deleted })
  }
  // --

  // == [Watching]: watchRefresh, unsubscribeDB

  // Watch the backend so boxes written elsewhere (another tab, the inspector's reset button) show
  // up without a manual refresh, through the refresh, joining one under way. A failure here has
  // nobody to throw to, so it leaves the snapshot standing and tells any bad news it met. It
  // leaves the snapshot's freshness `refused`, and warns once for a failing streak; the next read
  // that succeeds says so once. A read that finds the vault gone has made the Vault object gone,
  // and told the bank.
  async #watchRefresh() {
    try {
      await this.#refresh()
    } catch (err) {
      this.#hearBadNews(err)
      if (this.#goneBy !== null || this.#watchWarned) { return }
      this.#watchWarned = true
      this.#logger.warn('Storage rang with a change the vault could not read, so what it shows may lag behind storage (freshness: refused). It says nothing more of this until a read succeeds; its next call meets the same trouble, and throws it.', { call: 'refresh' }, asError(err))
    }
  }
  // The adapter's watch on the vault, which birth starts and letting the vault go ends.
  #unsubscribeDB: (() => void) | null = null
  // --

  // == [Two forms]: badOutcome

  /** The refusal `thrown` makes, as the outcome a public `tryX` resolves: a throw that is no VaultError becomes 'unexpected_error'.
   * Bad news is told before the outcome resolves.
   */
  #badOutcome(thrown: unknown): BadOutcome {
    // Never logged: a host's function that threw (a key deriver) may have been handed a passphrase.
    const err = isVaultError(thrown) ? thrown : Refusals.unexpectedError(thrown)
    this.#hearBadNews(err)
    return bad(err)
  }
  // --

  // == [Bad news]: hearBadNews, tellBadNews, tellListingNews, tellWayinNews, handlerThrew

  // Bad news already told, so a refusal several callers share, or met again on its way out, is told once.
  readonly #told = new WeakSet<VaultError>()

  /** Tell `err`, when it is bad news not told yet, and publish it as the trouble. */
  #hearBadNews(err: unknown) {
    if (! isVaultError(err) || err.family !== 'bad_news' || this.#told.has(err)) { return }
    this.#tellBadNews(err)
    this.#replaceSnapshot()
  }

  /** Keep `news` as the trouble, and hand it to the host's handler, never awaited.
   * What the handler throws, or its promise rejects with, becomes the trouble in its place. It
   * publishes nothing: the caller settles.
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
      this.#replaceSnapshot()
    }
  }

  /** Tell each box the published listing shows damaged that `shown`, the damaged boxes listed before it, did not show at the same revision.
   * Each gets one 'damaged_box' news, its `meta.box_listed` the box, and the trouble is published once
   * all are told. The read that lists them succeeds all the same.
   */
  #tellListingNews(shown: readonly BoxDamaged[]) {
    const wasShown = (box: BoxDamaged) => shown.some((was) => was.boxlabel === box.boxlabel && was.revision_tok === box.revision_tok)
    const news = this.#damagedBoxes.filter((box) => ! wasShown(box))
    if (news.length === 0) { return }
    for (const box of news) {
      this.#tellBadNews(new VaultError('damaged_box', "A box in this vault is stored damaged, so it can't be read: this error's meta.box_listed names it. It was left as it is; remove it with delBox(), or store its whisper again over it.", { meta: { box_listed: box } }))
    }
    this.#replaceSnapshot()
  }

  /** Tell each of `damaged`, the ways in a read found damaged, that `shown`, the ways in published before it, did not already show damaged alike.
   * Each gets one 'damaged_wayin' news, its `meta.wayin_listed` the summary, and the trouble is
   * published once all are told. The read succeeds all the same, and the other way in opens as ever.
   */
  #tellWayinNews(damaged: readonly Wayin[], shown: readonly Wayin[]) {
    const wasShown = new Set(shown.filter((wayin) => wayin.isDamaged()).map((wayin) => stableJsonify(wayin.record)))
    const news = damaged.filter((wayin) => ! wasShown.has(stableJsonify(wayin.record)))
    if (news.length === 0) { return }
    for (const wayin of news) {
      this.#tellBadNews(new VaultError('damaged_wayin', "One of this vault's unlockers is stored damaged, so it can't be tried: this error's meta.wayin_listed names it. The other vault unlocker, if the vault has one, still opens it. A damaged passkey is mended by adding the passkey again; a damaged passphrase only by removing the vault and making it again.", { meta: { wayin_listed: wayin.toJSON() } }))
    }
    this.#replaceSnapshot()
  }

  /** What the host's `onBadNews` threw, kept as the trouble, and told to the logger and the platform. */
  #handlerThrew(err: unknown) {
    this.#trouble = new VaultError('bad_option', "The onBadNews handler passed to Bank.make threw as it was told of bad news: fix the handler. What it threw is this error's cause. The call that met the news went on as it would have.", { cause: err })
    this.#logger.error("The onBadNews handler threw as it was told of bad news: the vault's trouble keeps what it threw. The call that met the news went on as it would have.", { call: 'onBadNews' }, asError(err))
    reportToPlatform(err)
  }
  // --
}

// == [Refusals]: damagedBeyondNaming, lockedError, goneError, remadeError, behindError, gateMovedError, gatingLandedError

const damagedBeyondNaming = () => new VaultError('damaged_box', "That box is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with delBox() first, then store its whisper again.")

const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call ensureUnlocked(), which asks the user through requestCleartext, and call again.')

const goneError = () => new VaultError('vault_gone', 'This Vault object is gone -- the vault was deleted, here or on another device, or the app let this Vault object go -- so nothing more was read or written. Ask the bank for the vault again (bank.ensureVault) to see what stands now.')

const remadeError = () => new VaultError('vault_remade', 'The vault this call was working on was deleted and made anew on another device, so nothing more was read or written: what the call held belongs to the vault that was deleted. Ask the bank for the vault again (bank.ensureVault), and unlock the one that stands now.')

const behindError = () => new VaultError('vault_behind', "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask the bank for the vault again; otherwise the app's support should look at its storage.")

const gateMovedError = () => new VaultError('gate_moved', "A vault unlocker changed while this call was under way -- the passphrase or passkey was changed, here or on another device -- so nothing more was done. Unlock again to carry on.")

const gatingLandedError = () => new VaultError('gating_landed', 'The prompt ended while this proof was being checked -- a lock landed, or it was answered or declined -- and its end wins: nothing was unlocked. Ask again when the user wants the vault.')

// --

// == [Vocabulary]: BirthRead, frozenVaultRecord, isOlderPicture, fitsLease, standsBeside, VaultCall, UntrustedStorageKinds, UnlockingKinds

/** A vault's box listing, as a read of storage hands it up: the sound boxes and the damaged apart, each sorted by boxlabel. */
type Listing = Readonly<{ boxes: readonly BoxSparse[], damagedBoxes: readonly BoxDamaged[] }>

/** One read of storage and this device's store that a Vault object is born of, as `bank.ensureVault` made it.
 * `vaultRecord` and `listing` are what `vaultDB.ensureVault` resolved; `leaseKept` what
 * `deviceDB.getLease` found; `record` this device's record of the scope as raised at birth; and
 * `readAt` when the read began, by the bank's clock.
 */
export type BirthRead = Readonly<{
  vaultRecord: VaultRecord
  listing:     Listing
  leaseKept:   LeaseRecord | null
  record:      DeviceRecord
  readAt:      number
}>

/** A copy of `record`, frozen through its gate and ways in: the vault record the vault holds, which no host can write to. */
const frozenVaultRecord = (record: VaultRecord): VaultRecord => {
  const { gate } = record
  if (gate === null) { return Object.freeze({ ...record }) }
  return Object.freeze({ ...record, gate: Object.freeze({ passphrase: frozenRecord(gate.passphrase), passkey: gate.passkey === null ? null : frozenRecord(gate.passkey) }) })
}

/** True when `fresh`, a vault record a read or a write returned, is older than `inHand`: the same vault at a lower epoch.
 * That is a read served before this device's own write and answered after it, or a write a read
 * has already passed. Data cannot tell it from storage restored from an older copy, so it is
 * ignored, never refused.
 */
const isOlderPicture = (inHand: VaultSparse, fresh: VaultSparse): boolean => (
  inHand.vault_tok === fresh.vault_tok
  && (fresh.vault_epoch < inHand.vault_epoch || fresh.gate_epoch < inHand.gate_epoch)
)

/** `next`, or `shown` when it holds the same: a snapshot's slice keeps its identity until what it holds changes. */
const keptIfSame = <SliceT>(shown: SliceT | undefined, next: SliceT): SliceT => (
  shown !== undefined && stableJsonify(shown) === stableJsonify(next) ? shown : next
)

/** True when `lease` was granted under the vault and ways in `standing` holds. */
const fitsLease = (standing: Pick<VaultSparse, 'vault_tok' | 'gate_epoch'>, lease: Lease): boolean => lease.vault_tok === standing.vault_tok && lease.gate_epoch === standing.gate_epoch

/** True when `kept`, what this device's store held as its lease when a read looked, leaves `held`, the lease in hand, standing: a lease of the same vault and ways in.
 * Its deadline is not compared: another tab's unlock or renewal writes a lease ending later, and
 * this tab keeps its own until it ends. None (a lock in another tab), or one under another gate,
 * does not.
 */
const standsBeside = (kept: unknown, held: Lease): boolean => {
  if (typeof kept !== 'object' || kept === null) { return false }
  const record: Partial<Record<keyof LeaseSparse, unknown>> = kept
  return record.vault_tok === held.vault_tok && record.gate_epoch === held.gate_epoch
}

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'birth' | 'hello' | 'refresh' | 'del' | 'untrustedStorage' | 'ensureUnlocked' | 'demandConsistentWith'
  | 'putWayin' | 'delWayin' | 'putBox' | 'delBox' | 'getBox' | 'getWhisper'

/** The refusals that say storage cannot be trusted as it stands: 'identity_revoked' and 'vault_behind', which lock the vault, and 'newer_format'.
 * Each asks something of the caller that a stale write does not: the user to sign in again,
 * storage to be looked at, or the app to be updated. Each has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'vault_behind', 'newer_format'] as const satisfies readonly RefusalKind[]

/** The gatings whose settling answers `ensureUnlocked`'s question, which it joins: an unlock, and a first gate. Any other it waits out. */
const UnlockingKinds: ReadonlySet<GatingKind> = new Set(['unlock_vault', 'initialize_gate'])
// --

// == [Argument parsers]: checkHelloOpts, checkEnsureUnlockedOpts, renewPastLease, PutBoxProps, checkPutBoxProps, putBoxPropsOf, DeletedBox, checkSlotlabel, passkeyBeforePassphrase, absentBox, noWhisper

/** What `hello()`'s options may hold: `staleMinutes`, which `parseStaleMinutes` checks, and nothing else. */
const checkHelloOpts = optionsCheck(({ unk }) => ({ staleMinutes: unk.optional() }), "hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage. Handed to addEventListener or onClick as the handler itself, it is handed an event: wrap it, `() => vault.tryHello()`.")

/** What `ensureUnlocked()`'s options may hold: `renewMinutes`, which `parseRenewMinutes` checks, and nothing else. */
const checkEnsureUnlockedOpts = optionsCheck(({ unk }) => ({ renewMinutes: unk.optional() }), "ensureUnlocked()'s only option is `renewMinutes`, how many minutes before the lease ends to ask the user anyway. Handed to addEventListener or onClick as the handler itself, it is handed an event: wrap it, `() => vault.tryEnsureUnlocked()`.")

/** The refusal of a `renewMinutes` as long as the lease or longer, under which every call would ask the user. */
const renewPastLease = () => new VaultError('bad_option', "ensureUnlocked()'s renewMinutes is as long as the lease or longer (leaseHours), so every call would ask the user: give fewer minutes than the lease lasts, or leave it out. To ask every time, lock() once done.")

/** What `demandConsistentWith()`'s options may hold: `leaseBound`, a boolean, and nothing else. */
const checkDemandOpts = optionsCheck(({ bool }) => ({ leaseBound: bool.optional() }), "demandConsistentWith()'s only option is `leaseBound`, true when the thing must also have a lease in hand to stand.")

/** What `demandConsistentWith()` judges, checked: a thing carrying a `vault_tok`, and, where it carries them, a scope's labels and epochs of the right types. */
export const { vaultMadeUnderShape } = Validator('bad_option', ({ obj, str, num }) => ({
  vaultMadeUnderShape: obj({
    vault_tok,
    applabel:    str.optional(),
    user_id:     str.optional(),
    vaultlabel:  str.optional(),
    vault_epoch: num.optional(),
    gate_epoch:  num.optional(),
  }).loose(),
}))

/** `thing`, as `demandConsistentWith()` was handed it, once it carries a `vault_tok`: 'bad_option' for anything else, quoting none of it. */
const checkedMadeUnder = (thing: unknown): VaultMadeUnder => {
  if (vaultMadeUnderShape.safeParse(thing).success) { return thing as VaultMadeUnder }
  throw new VaultError('bad_option', "demandConsistentWith() takes something the vault handed out -- a box, a lease, a listing's entry -- or its snapshot: an object carrying the vault_tok it was made under, and its epochs as numbers.")
}

/** What `putBox()` is handed to name the box it seals: its boxlabel, and its sidecar, left out to keep the one it has. */
export type PutBoxProps = { boxlabel: string, sidecar?: Sidecar | undefined }

/** What `putBox()`'s props may hold: a boxlabel, a sidecar, and nothing else. */
const checkPutBoxProps = optionsCheck(({ unk }) => ({ boxlabel: unk, sidecar: unk.optional() }), "putBox()'s props are `boxlabel`, and `sidecar`, the box's own visible data (it is authenticated but never encrypted). A note is kept in the sidecar: { boxlabel, sidecar: { note } }.")

/** The boxlabel and sidecar a `putBox()` was handed, the sidecar checked and undefined when left out.
 * Refuses 'bad_option' for props that are no object, a sidecar that is no JSON object, or a field
 * beside them, quoting none of it. The boxlabel is the caller's to check.
 */
const putBoxPropsOf = (props: unknown): { boxlabel: unknown, sidecar: Sidecar | undefined } => {
  if (typeof props !== 'object' || props === null) {
    throw new VaultError('bad_option', "putBox() takes the box it stores as its first argument, { boxlabel, sidecar }, and the whisper second: putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-...').")
  }
  const { boxlabel, sidecar } = checkPutBoxProps(props as Partial<Record<'boxlabel' | 'sidecar', unknown>>)
  return { boxlabel, sidecar: sidecar === undefined ? undefined : checkedSidecar(sidecar) }
}

/** What `delBox()` removed: the boxlabel, the vault it lay in, and whether the revision removed was the one the snapshot listed (`deleted`) or another written over it meanwhile (`deleted_other`). Storage keeps nothing of it. */
export type DeletedBox = Readonly<{ boxlabel: string, vault_tok: string, outcome: 'deleted' | 'deleted_other' }>

/** Refuse 'bad_option' for a slotlabel other than `'passphrase'` or `'passkey'`, quoting none of it. */
const checkSlotlabel = (given: unknown, call: 'putWayin' | 'delWayin'): void => {
  if (given !== 'passphrase' && given !== 'passkey') {
    throw new VaultError('bad_option', `${call} takes the slot of the way in, 'passphrase' or 'passkey': the user's passphrase or passkey is asked for through requestCleartext, never handed to the vault.`)
  }
}

/** The refusal of `putWayin('passkey')` on a novel vault: a passkey is added under the passphrase, which it has none of yet. */
const passkeyBeforePassphrase = () => new VaultError('absent_vault', "This vault has no passphrase yet, and a passkey is added under the passphrase, so nothing was asked or changed: set the passphrase first -- ensureUnlocked() asks for it, with a passkey beside it if the dialog offers one -- then add the passkey.")

// The refusal never quotes the boxlabel: a label may still be a key pasted by mistake.
const absentBox = () => new VaultError('absent_box', 'No box stands under that boxlabel in this vault: its snapshot lists the ones it holds.')

/** The refusal of a `putBox()` that left out the whisper, to keep the one stored, where none is stored. */
const noWhisper = () => new VaultError('no_whisper', 'No box stands under that boxlabel, so there is no whisper to keep: hand putBox() the whisper to store.')

// --

// == [Timers and grace]: isFarFuture, unrefTimeout

/** True for an instant within a minute of {@link FarFuture}: a deadline that never comes. Never compared for equality, so a reading rounded or nudged on its way still counts. */
const isFarFuture = (at: number): boolean => at >= FarFuture - MinuteMillis

/** `setTimeout(callback, delayMillis)`, a negative delay as none, that lets a Node or Bun process exit while it is pending.
 * A vault left open must not keep a server or a script alive for days. A browser's timer has no
 * `unref`, and needs none.
 */
const unrefTimeout = (callback: () => void, delayMillis: number): ReturnType<typeof setTimeout> => {
  const timer = setTimeout(callback, Math.max(0, delayMillis))
  const handle = timer as unknown as { unref?: () => unknown }
  if (typeof handle.unref === 'function') { handle.unref() }
  return timer
}
// --
