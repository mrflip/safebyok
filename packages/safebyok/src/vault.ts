import * as Z from 'zod/mini'
import { type Capacity, type Clock, type VaultScope, BoxSummary, type DamagedBox, type ListedSummary, type Stamp, type Stamped, type PasskeyWayinSummary, type PassphraseWayinSummary, type PasskeyAnswer, type WayinSummary, Whisper, Sidecar, type GatedVaultProps, type GatelessVaultProps, type VaultProps, type DeviceRecord, DeviceRecordFormat, type LeaseRecord, isGated, MinuteMillis, FarFuture, FarPast } from './types'
import { Box, type BoxBase, type BoxRecord, checkedSidecar, checkedWhisper, heldListing, whisperBytesOf } from './box'
import * as Names from './names'
import { optionsCheck } from './options'
import { VaultError, isVaultError, type RefusalKind } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { Wayin, frozenRecord, type PasskeyWayin, type PassphraseWayin } from './wayin'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import { byCodeUnit, jsonBytes, type BoxExpectation, type ListedVault } from './vault-db'
import { type VaultLogger, asError } from './logger'
import * as RefusalPolicy from './refusal-policy'
import type { GuardedStrengthChecker, PassphraseVerdict } from './passphrase-strength'
import { type BadNewsHandler, type VaultParts, parseRenewMinutes, parseStaleMinutes, StoredBytesPerWhisperByte, BoxFixedBytes } from './vault-opts'
import { reportToPlatform } from './report-error'
import { type DeviceDB, deviceRecordFor, deviceTroubleAsConditions } from './device-db'
import type { KeyDeriver } from './key-deriver'
import { Lease, type LeaseView } from './lease'
import { registerLeaseReader } from './held-lease'
import { PasskeyProving, PassphraseProving, Proving, type ProvingGating, StandingGating, checkFreshSalt, checkedPasskeyAnswer, headerOf, registerProvingInside } from './proving'
import { Gate } from './gate'
import { Ask, type AskWhy, type GetProof, type RaisedAsk, raiseAsk } from './ask'

// == [Public types]: VaultState, VaultFreshness, VaultSnapshot, bear, letGo

/** The name of the bank's one way to birth a Vault object, exported by no entry point. */
export const bear = Symbol('Vault.bear')

/** The name of the bank's one way to let a Vault object go, exported by no entry point. */
export const letGo = Symbol('Vault.letGo')

/** Where the vault stands, as a UI branches on it.
 *  * `novel`: stored, with no passphrase yet. The first passphrase proof, through `getProof` or
 *    `unlock()`, sets it.
 *  * `locked`: has its passphrase; box summaries are readable, whispers not.
 *  * `unlocked`: whispers are readable until `askPassphraseAt` or `lock()`.
 */
export type VaultState = 'novel' | 'locked' | 'unlocked'

/** How far to trust the vault's picture of storage, as a UI might say so.
 *  * `timely`: the last read of storage succeeded within `staleMinutes`.
 *  * `aged`: the last read succeeded `staleMinutes` ago or more; the next `hello()` reads again.
 *  * `refused`: the last read failed, so what the vault shows may be behind storage; `trouble`
 *    says why when it was bad news.
 */
export type VaultFreshness = 'timely' | 'aged' | 'refused'

/** The vault's fields, frozen in one plain object for `useSyncExternalStore`, each as the vault shows it.
 * It is replaced whole when any field changes, and is otherwise the same object. It holds nothing
 * an offline guess at a passphrase could start from: ways in show as summaries, never a
 * passphrase's salt or a wrapped vaultKey. A passkey's PRF salt does show, as its authenticator
 * is asked with it. Box summaries show even while locked.
 */
export type VaultSnapshot = Readonly<{
  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  applabel:        string
  /** The signed-in user the vault is found under, as `bank.ensureVault` was given it. Fixed for the Vault object's life. */
  user_id:         string
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  vaultlabel:      string
  /** The stored vault's token, minted when it was made: one life of the vault in its scope. Fixed for the Vault object's life. */
  vault_tok:       string
  /** When the stored vault was made, in epoch milliseconds. */
  registered_at:   number
  /** Up by one on every change to the ways in, which sends every other device back to `locked`; 0 while `novel`. */
  gate_epoch:      number
  /** The vault's passphrase, as its {@link PassphraseWayinSummary}: when it was set, and from which device; null while `novel`. */
  passphrase:      PassphraseWayinSummary | null
  /** The vault's passkey, as its {@link PasskeyWayinSummary}; null while it has none.
   * It shows while locked, so a host can offer the passkey, ask its authenticator for an answer
   * (`safebyok-react`'s `askPasskey` takes it), and say which passkey a new one would replace.
   */
  passkey:         PasskeyWayinSummary | null
  /** Where the vault stands: see {@link VaultState}. */
  state:           VaultState
  /** Every box, sorted by boxlabel: a {@link BoxSummary} for each, or a {@link DamagedBox}.
   * A box is damaged when its record does not read back, or is sealed under a vaultKey the vault
   * does not hold; {@link Vault.delBox} removes one. The listing never opens a box's ciphertext,
   * so ciphertext altered in storage shows only when the box is read.
   */
  boxes:           readonly (BoxSummary | DamagedBox)[]
  /** How much room the vault has, as this device reckons it from its last read.
   * It counts boxes against `maxBoxes`, and bytes against what storage holds of one vault. Each box
   * reserves room for a whisper and sidecar of `maxWhisperBytes`, its fixed fields and its names.
   * Storage checks again on every write, and its `vault_full` or `box_too_large` is the truth: read
   * this only to warn the user ahead of time.
   *
   * @example const { boxes } = vault.capacity; if (boxes.used >= boxes.max - 1) { warn('Your vault is nearly full.') }
   */
  capacity:        Readonly<{ boxes: Readonly<Capacity['boxes']>, bytes: Readonly<Capacity['bytes']> }>
  /** Epoch ms from which the vault asks for a proof again, while unlocked; null otherwise.
   * It is `leaseHours` after a proof last unlocked the vault, or a passphrase last proved a change
   * to its ways in. A vault that stays unlocked until `lock()` reads {@link FarFuture} (in 2255):
   * compare with `>= FarFuture - MinuteMillis`, never for equality.
   */
  askPassphraseAt: number | null
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
  trouble:         VaultError | null
  /** How far to trust what the vault shows: see {@link VaultFreshness}.
   * The vault keeps working whatever it says: every write still lands only where storage stands as
   * this device last read it. It is reckoned when the snapshot is replaced, so `aged` shows at the
   * next change, or the next `hello()`.
   */
  freshness:       VaultFreshness
}>
// --

/** The ways in of vault props, as the vault holds them: the passphrase's, and the passkey's or null. */
type HeldWayins = Readonly<{ passphrase: PassphraseWayin, passkey: PasskeyWayin | null }>

/** One user's vault of boxes, one life of it in storage, for as long as the bank holds it: every read and write of a whisper goes through here.
 * `bank.ensureVault` births one from one read of storage: never absent, `novel` until its
 * first passphrase is set, and holding one `vault_tok` for its life. Its fields (`state`, `boxes`,
 * `passkey`, `capacity`, `trouble` and the rest) are live and read-only. A UI renders from
 * `getSnapshot()`, the same fields frozen in one object, and re-renders on `subscribe()`.
 *
 * A call that needs a whisper goes through {@link Vault.ensureLease}: a vault that is not unlocked
 * asks the host's `getProof` for a proof, one prompt at a time. Nothing prompts on open.
 *
 * Every call holds to these, unless its own doc says otherwise:
 *  * A malformed argument or option is refused 'bad_option' ('bad_label' for a name) before
 *    anything is read, asked for or written. Its message names the field, never the value.
 *  * A call refuses with what storage refuses, as it came.
 *  * Once the Vault object is gone -- the bank let it go, or the vault was deleted, or deleted and
 *    made anew, here or elsewhere -- every call but `subscribe()`, `getSnapshot()` and
 *    `checkPassphrase()` refuses 'vault_gone', or 'vault_remade' for a vault made anew. The bank
 *    hands out a new Vault object when asked again.
 *  * A throw that is no refusal (a bug, in safebyok or in a function handed to it) is refused
 *    'unexpected_error', what was thrown its cause. It is never logged.
 *
 * This device keeps a record of the highest `vault_epoch` it has seen in the scope (its device
 * record, in the deviceDB), raised at each read and at each write of its own, never lowered. A
 * read of vault props older than the ones a Vault object holds is ignored: it takes nothing from
 * them, refuses nothing, and keeps the newer. Any other read below the device record refuses
 * 'vault_behind', taking nothing from it and writing nothing: an older vault could bring back a
 * way in that was removed. It locks the vault, as 'identity_revoked' from storage does. A host
 * that restored storage from an older copy on purpose accepts it on this device with
 * `bank.clearCachedVault`, which erases the record, and asks the bank for the vault again.
 *
 * Storage alone settles a race, and the vault argues with none. A write storage refuses as stale
 * is refused as it came: the vault reads nothing after it, and `hello()` shows what stands. Every
 * thing a Vault object hands out was made under its `stamp`, and each call demands, at each of
 * its steps, that the vault still stands as the thing it holds was made under: a call that finds
 * the vault deleted, made anew, its ways in changed, or locked meanwhile refuses 'vault_gone',
 * 'vault_remade', 'gate_moved' or 'vault_locked' (see {@link Vault.demandConsistentWith}). A box
 * that will not open under the lease in hand is 'damaged_box' at once, with no read of storage
 * first.
 *
 * Every call comes in two forms. `tryUnlock()`, `tryPutBox()` and the rest resolve to an
 * {@link Outcome}, `{ ok: true, val }` or `{ ok: false, err }`, never thrown: the form for code
 * that branches on `refusalkind`. `unlock()`, `putBox()` and the rest resolve to that `val` or
 * throw that `err`: the form for code that reports failure by throwing, as a TanStack `queryFn`
 * does. A refusal a member's doc names comes as `err` from its `try` form. Bad news is told to
 * `onBadNews` once, whichever form met it. `subscribe()`, `checkPassphrase()` and `useWhisper()`
 * come in the throwing form alone.
 *
 * `subscribe`, `getSnapshot` and `checkPassphrase` are bound to their vault, so `subscribe` and
 * `getSnapshot` can go to `useSyncExternalStore` as they are. Every other call is a method: call it
 * on the vault, or wrap it to hand it on, as an event handler does: `() => vault.tryHello()`.
 *
 * @example const snapshot = useSyncExternalStore(vault.subscribe, vault.getSnapshot)
 * @example if (vault.state === 'locked') { askForProof(vault.passkey) }
 * @example
 *   await vault.unlock(passphrase)
 *   const whisper = await vault.getWhisper('anthropic_api_key')
 * @example
 *   const { ok, err } = await vault.tryUnlock(passphrase)
 *   if (! ok && err.refusalkind === 'wrong_passphrase') { askAgain(err.message) }
 */
export class Vault {
  // == [Vault: fields]: applabel, user_id, vaultlabel, vault_tok, registered_at, gate_epoch, passphrase, passkey, state, boxes, capacity, trouble, freshness, snapshot, getSnapshot, subscribe, logger, keyDeriver, now

  // Each field reads the snapshot `#replaceSnapshot()` last published, so the fields and the snapshot always
  // agree. A getter with no setter: a host cannot write over one, and the vault never reads one back.
  // Its boxes, ways in and lease read back only what is fixed for the Vault object's life -- its scope, its
  // key deriver, its lease length -- and the time; each holds the token and epoch of the vault props it is bound to.

  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  get applabel(): string { return this.#snapshot.applabel }
  /** The signed-in user the vault is found under. Fixed for the Vault object's life. */
  get user_id(): string { return this.#snapshot.user_id }
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  get vaultlabel(): string { return this.#snapshot.vaultlabel }
  /** The stored vault's token: the one life of it this Vault object holds. Fixed for the Vault object's life. */
  get vault_tok(): string { return this.#snapshot.vault_tok }
  /** When the stored vault was made, in epoch milliseconds. */
  get registered_at(): number { return this.#snapshot.registered_at }
  /** Up by one on every change to the ways in, which sends every other device back to `locked`; 0 while `novel`. */
  get gate_epoch(): number { return this.#snapshot.gate_epoch }
  /** The vault's passphrase, as its summary; null while `novel`. See {@link VaultSnapshot}. */
  get passphrase(): PassphraseWayinSummary | null { return this.#snapshot.passphrase }
  /** The vault's passkey, as its summary; null while it has none. See {@link VaultSnapshot}. */
  get passkey(): PasskeyWayinSummary | null { return this.#snapshot.passkey }
  /** Where the vault stands: see {@link VaultState}. */
  get state(): VaultState { return this.#snapshot.state }
  /** Every box, sound or damaged, sorted by boxlabel, no whisper among them. See {@link VaultSnapshot}. */
  get boxes(): readonly (BoxSummary | DamagedBox)[] { return this.#snapshot.boxes }
  /** How much room the vault has, as this device reckons it from its last read. See {@link VaultSnapshot}. */
  get capacity(): VaultSnapshot['capacity'] { return this.#snapshot.capacity }
  /** The latest bad news, or what the `onBadNews` handler threw; null when there is none. See {@link VaultSnapshot}. */
  get trouble(): VaultError | null { return this.#snapshot.trouble }
  /** How far to trust what the vault shows: `timely`, `aged` or `refused`. See {@link VaultSnapshot}. */
  get freshness(): VaultFreshness { return this.#snapshot.freshness }
  /** Every field above, frozen in one object: what {@link Vault.getSnapshot} returns. */
  get snapshot(): VaultSnapshot { return this.#snapshot }

  /** The current {@link VaultSnapshot}: the same object until something changes. */
  getSnapshot = (): VaultSnapshot => this.#snapshot
  /** Call `listener` after every snapshot change, returning the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  /** The logger the vault was made with, which its boxes and ways in log through. */
  get logger(): VaultLogger { return this.#logger }
  /** The key deriver the vault was made with, which its ways in derive through. */
  get keyDeriver(): KeyDeriver { return this.#keyDeriver }
  /**
   * The time it is by the clock the vault was made with, in whole epoch milliseconds (a reading's
   * fraction rounded down): what the vault's boxes, ways in and lease are stamped and judged by.
   *
   * @example vault.now() - box.written_at   // how long ago the box was written, by the vault's clock
   */
  now(): number { return this.#clockNow() }
  // --

  // == [Vault: the lease, delegated]: askPassphraseAt, leaseMillis

  // The lease this device holds is the Vault object's own: no getter, field or JSON shows it, and
  // its boxes reach it inside the package alone (`heldLeaseOf`). What an app reads of it is here.

  /** When this device's lease ends and the vault locks of itself, in epoch milliseconds, while unlocked; null otherwise: for an autolock, or a "locks in 10 minutes" line. See {@link VaultSnapshot}.
   * It reads the snapshot, so a component subscribed to it sees the deadline move as a renewal
   * moves it. A vault that stays unlocked until `lock()` reads {@link FarFuture}.
   *
   * @example const minutesLeft = vault.askPassphraseAt === null ? null : Math.ceil((vault.askPassphraseAt - vault.now()) / MinuteMillis)
   */
  get askPassphraseAt(): number | null { return this.#snapshot.askPassphraseAt }
  /** How long a lease lasts on this device: the `leaseHours` the vault was made with, in whole milliseconds.
   * A vault that stays unlocked until `lock()` (`Infinity` hours) reads `ForeverMillis`. Fixed for
   * the Vault object's life.
   *
   * @example vault.leaseMillis >= ForeverMillis - MinuteMillis ? 'until you lock it' : `for ${String(Math.round(vault.leaseMillis / MinuteMillis))} minutes`
   */
  get leaseMillis(): number { return this.#leaseMillis }
  // --

  // == [Vault: opening]: hello, refresh, ensureLease

  /** Read storage and settle the vault as `novel`, `locked` or `unlocked`, resolving the vault.
   * Never prompts. Within `opts.staleMinutes` of the last read it re-settles without reading, unless
   * the last read failed or found storage it could not trust. A hello made while a read is under
   * way shares that read, whatever its `staleMinutes`, and starts none of its own. Reads
   * {@link DeviceDB.getDeviceRecord}, then `VaultDB.getVault` beside {@link DeviceDB.getLease}.
   *
   * A hello takes no lease up: the vault's birth took up this device's, and another tab's unlock
   * shows here at the next {@link Vault.ensureLease}. It drops the lease in hand, erasing nothing,
   * once this device's store no longer holds it (another tab locked), or the vault's ways in
   * changed. A read served before a write of this device's own, and answered after it, is ignored:
   * nothing is taken from it, and nothing refused. It raises this device's record of the vault to
   * what it read.
   *
   * A refused hello applies no partial read: the vault stands as its last read left it. Stored vault
   * props it cannot use refuse with 'damaged_vault' (`delDamagedVault` clears them), 'newer_format'
   * or 'vault_behind'. Finding the vault deleted, it refuses 'vault_gone'; deleted and made anew,
   * 'vault_remade': either way this Vault object is gone for good, and the bank hands out the next.
   * A box or way in stored damaged refuses nothing: it lists damaged, and is told as bad news.
   *
   * @example await vault.hello()   // vault.state: 'novel' | 'locked' | 'unlocked'
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

  /** Have the vault unlocked, asking `getProof` for a proof only when it must, resolving the vault.
   * Every call that needs a whisper goes through it; call it yourself to unlock ahead of time, on a
   * button. Once it resolves, the vault is unlocked under a lease that stands. It awaits a hello
   * first. Unlocked, under a lease of the ways in the vault holds that does not end within
   * `opts.renewMinutes` (0 when left out), it resolves at once, with no prompt and no write.
   * Otherwise it takes up this device's lease, when another tab has granted one that fits, and
   * only then hands an {@link Ask} to `getProof` and waits for its answer; a call that finds a
   * prompt up waits on that same one.
   *
   * Refuses 'vault_locked' when the user declines, when there is no `getProof`, when a `lock()`
   * lands while the prompt is up, or when the lease is gone by the time the answer comes;
   * 'vault_gone' when a `del()` lands meanwhile, or the bank lets the vault go, or a read finds it
   * deleted ('vault_remade' for one made anew). A wrong passphrase never reaches here: the dialog
   * meets it, through the ask's `attempt`.
   *
   * @example await vault.ensureLease()   // unlocked, or refused 'vault_locked'
   * @example <button onClick={() => vault.tryEnsureLease()}>Unlock</button>
   * @example await vault.ensureLease({ renewMinutes: 60 })   // ask now if the lease ends within the hour
   */
  async ensureLease(given?: { renewMinutes?: number | undefined }): Promise<Vault> { return valOf(await this.tryEnsureLease(given)) }

  /** Have the vault unlocked, as an {@link Outcome}: the non-throwing form of {@link Vault.ensureLease}. */
  async tryEnsureLease(given?: { renewMinutes?: number | undefined }): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      const leaseOpts = checkEnsureLeaseOpts(given)
      await this.#ensureUnlocked(parseRenewMinutes(leaseOpts?.renewMinutes))
      this.#demandLease('ensureLease')
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: demand]: stamp, demandConsistentWith, consistentWith

  /** The vault's {@link Stamp}, frozen: its scope, and the `vault_tok`, `vault_epoch` and `gate_epoch` of the vault it holds now.
   * Each thing the vault hands out was made under the stamp it held then, and
   * {@link Vault.demandConsistentWith} compares the two.
   *
   * @example vault.stamp?.gate_epoch   // up by one on every change to the ways in
   */
  get stamp(): Stamp {
    return stampOf(this.#scope, this.#vaultProps)
  }

  /** Refuse unless `thing` is consistent with the vault as it stands now: what each call asks before and after each wait.
   * `thing` is something the vault handed out (a box, a lease, a listing's entry) or a
   * {@link Stamp}. Each field it carries is compared with the vault's own {@link Vault.stamp}, in
   * this order, and the first that disagrees refuses. The vault is gone: 'vault_gone'.
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
   * @example vault.demandConsistentWith({ ...stamp, gate_epoch: 0 })      // throws 'gate_moved' for a vault with a way in
   */
  demandConsistentWith(thing: Stamped, opts?: { leaseBound?: boolean | undefined }): void {
    const demandOpts = checkDemandOpts(opts)
    this.#demand(checkedStamped(thing), { leaseBound: demandOpts?.leaseBound === true, call: 'demandConsistentWith' })
  }

  /** True while `thing` is consistent with the vault as it stands now: the question {@link Vault.demandConsistentWith} refuses on, asked without refusing.
   * It compares as the demand does, and with `opts.leaseBound` asks also for a lease in hand that
   * has not ended. It changes nothing, not even an ended lease, and logs nothing. A thing missing
   * its `vault_tok`, or an option it does not take, throws 'bad_option', as misuse.
   *
   * @example if (! vault.consistentWith(box)) { box = await vault.getBox(box.boxlabel) }   // read it again once the vault moved on
   */
  consistentWith(thing: Stamped, opts?: { leaseBound?: boolean | undefined }): boolean {
    const leaseBound = checkDemandOpts(opts)?.leaseBound === true
    const leaseStands = this.#lease !== null && ! this.#lease.endsBy(this.#clockNow())
    return this.#inconsistencyWith(checkedStamped(thing)) === null && (! leaseBound || leaseStands)
  }
  // --

  // == [Vault: locking]: unlock, lock

  /** Open the vault with a proof, its passphrase or a passkey's answer, granting this device a lease for `leaseHours`.
   * It does what an ask's `attempt` does, outside any prompt: how an app with no `getProof`
   * unlocks once it has asked the user itself. Once it resolves, the vault is `unlocked`
   * until `askPassphraseAt`; then the vaultKey is dropped, work in hand or not. A passphrase costs
   * one key derivation (about half a second with the browser's deriver). Reads storage afresh, and
   * writes the lease with {@link DeviceDB.putLease}.
   *
   * On a `novel` vault, a passphrase becomes its first way in, through a first write of its gate,
   * `VaultDB.putVaultProps`. It must pass {@link Vault.checkPassphrase} first, or the unlock
   * refuses 'weak_passphrase' and writes nothing. Setting it costs a second key derivation. A vault
   * with its passphrase never refuses it as weak.
   *
   * A wrong passphrase refuses 'wrong_passphrase', and changes nothing. The vault learns it from the
   * way in failing to decrypt, never from a comparison, so a way in altered in storage refuses the
   * same way; the message names both. A passkey's answer refuses 'wrong_passkey' when it is another
   * credential's or does not open the vault, 'absent_wayin' when the vault has no passkey, and
   * 'absent_vault' on a `novel` vault. A way in stored damaged refuses 'damaged_wayin', untried.
   *
   * A first unlock can lose a race to another device setting the vault's first passphrase: it
   * refuses 'gate_made_elsewhere', whatever passphrase that device chose. Nothing was set here; the
   * next `hello()` shows the vault `locked`, and the user enters the passphrase chosen there. A
   * vault deleted, made anew, or with its ways in changed while the unlock is under way refuses as
   * {@link Vault.demandConsistentWith} finds it ('vault_gone', 'vault_remade' or 'gate_moved'), and
   * no lease is taken up; a passphrase this call set stays set, the vault locked. A `lock()` landing
   * meanwhile does not stop the unlock.
   *
   * @example await vault.unlock(passphrase)
   * @example await vault.unlock(passkey)  // the answer from askPasskey(vault.getSnapshot().passkey)
   * @example
   *   try { await vault.unlock(passphrase) } catch (err) {
   *     if (isVaultError(err, 'gate_made_elsewhere')) { showAdvice(err.message) }  // say hello, and ask for the passphrase chosen there
   *   }
   */
  async unlock(givenProof: string | PasskeyAnswer): Promise<void> { valOf(await this.tryUnlock(givenProof)) }

  /** Open the vault with a proof, as an {@link Outcome}: the non-throwing form of {@link Vault.unlock}. */
  async tryUnlock(givenProof: string | PasskeyAnswer): Promise<Outcome<void>> {
    try {
      await this.#unlockWith(givenProof)
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Forget the unlock, in memory and on this device: the vault is `locked` at once, storage reachable or not.
   * All a caller can see happens before it returns, synchronously: the lease is dropped and its
   * expiry disarmed; a prompt up for a proof ends, every call waiting on it refusing 'vault_locked'
   * and its ask's `lockLanded` settling; and the snapshot reads `locked`. What it returns is this
   * device's lease being erased, with {@link DeviceDB.delLease}. It awaits no hello.
   *
   * A call under way ends by its own rule. A `getWhisper()` or `useWhisper()` refuses 'vault_locked'
   * once storage answers or the box opens, unless an unlock has put a lease back in hand meanwhile;
   * a `getBox()` hands back the box, which holds nothing secret. A `putBox()` refuses
   * 'vault_locked', writing nothing, when the lock lands while it waits on `getProof`, reads and
   * opens the box (`VaultDB.getBox`, `box.extractWhisper()`), or seals it (`Box.seal`); a
   * `delBox()` does when it lands while it waits on `getProof`. Only the write itself is past a
   * lock's reach: once `VaultDB.putBox` or `VaultDB.delBox` is sent, it lands or refuses as storage
   * decides, a stale `putBox()` refusing 'stale_write' as ever. An
   * ask's `attempt` under way takes nothing up. An `unlock()` or `putWayin()` under way is not
   * stopped, and leaves the vault unlocked.
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

  // == [Vault: ways in]: checkPassphrase, putWayin, delWayin

  /** How strong `typed` is as a new passphrase for this vault, by the `strengthChecker` it was made with.
   * The first `unlock()` and `putWayin()` refuse a weak one by this verdict, so a field asking it as
   * the user types decides alike. The `reason` of a weak one is written for the user. A blank
   * passphrase is weak before the checker hears it. Reads nothing, and awaits no hello.
   *
   * A checker that breaks its contract is refused here, and by every call that asks it:
   * 'bad_option' for an answer that is no verdict, and 'unexpected_error' for a throw. That refusal
   * carries nothing of what the checker threw, as the checker heard the passphrase.
   *
   * @example
   *   const verdict = await vault.checkPassphrase(typed)
   *   setHint(verdict.strong ? '' : verdict.reason)
   * @example await vault.checkPassphrase('   ')   // { strong: false, reason: "A new passphrase can't be empty or only spaces: ..." }
   * @example await vault.checkPassphrase(42)   // throws 'bad_option'
   */
  checkPassphrase = async (typed: string): Promise<PassphraseVerdict> => {
    if (typeof typed !== 'string') {
      throw new VaultError('bad_option', "checkPassphrase takes the passphrase as the text the user typed, as a string.")
    }
    return this.#strengthChecker(typed)
  }

  /** Refuse a new passphrase too easy to guess, by the `strengthChecker` the vault was made with: 'weak_passphrase', the checker's reason its message.
   * It is {@link Vault.checkPassphrase}'s verdict as a refusal: a blank passphrase is weak before
   * the checker hears it, and a checker that breaks its contract refuses as there. What a chain
   * asks of a new passphrase before it becomes a way in. Reads nothing, and awaits no hello.
   *
   * @example await vault.checkStrength(chosen)   // throws 'weak_passphrase' with the checker's reason
   * @example await vault.checkStrength('correct horse battery staple')   // resolves
   */
  async checkStrength(passphrase: string): Promise<void> { valOf(await this.tryCheckStrength(passphrase)) }

  /** Refuse a new passphrase too easy to guess, as an {@link Outcome}: the non-throwing form of {@link Vault.checkStrength}. */
  async tryCheckStrength(passphrase: string): Promise<Outcome<void>> {
    try {
      const verdict = await this.checkPassphrase(passphrase)
      if (! verdict.strong) { throw new VaultError('weak_passphrase', verdict.reason) }
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Put a new way into the vault, proven by its standing `passphrase`, resolving the new way in's summary.
   * A new passphrase replaces the passphrase, and removes the passkey, if any: the user adds a
   * passkey again under the new passphrase. A passkey's answer puts the vault's passkey, replacing
   * any; the snapshot's `passkey` says which, so the host can warn the user first. Only the
   * standing passphrase proves a change to the ways in, never a passkey. Boxes are untouched, so the
   * call costs the same however many there are. Writes with `VaultDB.putVaultProps`.
   *
   * A passkey is made before the call, over a fresh salt: `safebyok-react`'s `createPasskey` makes
   * one. The core never calls WebAuthn itself.
   *
   * It works locked or unlocked. Once it resolves, the change is in storage. The gate epoch moves,
   * so every other device locks, and asks again at its next look. This device is left unlocked, its
   * lease starting again from now; should it fail to keep that, the logger says so, and the vault
   * asks for the passphrase at its next open.
   *
   * Refuses, changing nothing: 'weak_passphrase' for a new passphrase {@link Vault.checkPassphrase}
   * finds weak, before any key derivation or read; 'wrong_passphrase' for a `passphrase` that does
   * not open the vault; 'damaged_wayin' when the passphrase is stored damaged, so nothing can prove
   * a change; 'absent_vault' while the vault is `novel`; and 'stale_write' when another device
   * changed the vault first. A passkey made for a refused call stays on its authenticator, a way
   * into nothing: make another to try again.
   *
   * Replacing is not revoking: whoever holds the old passphrase or passkey, and kept a copy of the
   * vault props from before, can still open that copy. The vaultKey inside it is the one the vault
   * still uses.
   *
   * @example await vault.putWayin(passphrase, newPassphrase)   // the passphrase is replaced, and any passkey removed
   * @example
   *   const answer = await createPasskey({ rp: { name: 'Acme' }, user: { name: email, displayName } })
   *   if (answer !== null) { await vault.putWayin(passphrase, answer) }   // the vault's passkey, replacing any
   */
  async putWayin(passphrase: string, newProof: string | PasskeyAnswer): Promise<WayinSummary> { return valOf(await this.tryPutWayin(passphrase, newProof)) }

  /** Put a new way into the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.putWayin}. */
  async tryPutWayin(passphrase: string, newProof: string | PasskeyAnswer): Promise<Outcome<WayinSummary>> {
    try {
      this.#checkStanding()
      checkStandingPassphrase(passphrase, 'putWayin')
      if (typeof newProof === 'string') {
        await this.checkStrength(newProof)
      } else {
        checkFreshSalt(checkedPasskeyAnswer(newProof))
      }
      // The proof is made against the vault props as storage holds them now, not a picture a change
      // elsewhere has outdated: a passphrase replaced there proves nothing here.
      this.#checkStanding()
      await this.#helloWithin(0)
      this.#checkStanding()
      const standing = this.#gatedProps()
      const base = Gate.of(this, standing)
      const current = await PassphraseProving.seal(this, headerOf(standing.passphrase), passphrase)
      const next = typeof newProof === 'string'
        ? await PassphraseProving.seal(this, { slotlabel: 'passphrase' }, newProof)
        : await PasskeyProving.seal(this, { slotlabel: 'passkey' }, newProof)
      const wayin = await current.resealWayinFor(next)
      // A new passphrase takes the passkey with it: a passkey is matched to the passphrase that
      // proved it, and the user makes a new one under the new passphrase. A new passkey leaves
      // the passphrase as it stood.
      const wayins = wayin.wayinkind === 'passphrase' ? { passphrase: wayin, passkey: null } : { passphrase: base.passphrase, passkey: wayin }
      const gate = Gate.make(this, { base, ...wayins })
      const stored = await this.#putGate(gate, 'putWayin')
      // A new passphrase grants the lease by itself; a new passkey's change by the passphrase that stays.
      await this.#grantAfterChange(next instanceof PassphraseProving ? next : current, 'putWayin')
      return good(wayin.wayinkind === 'passphrase' ? stored.passphrase.toJSON() : (stored.passkey ?? stored.passphrase).toJSON())
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Take away the vault's passkey, proven by its standing `passphrase`, resolving the vault.
   * The passphrase itself is never removed. Refuses 'absent_wayin' when the vault has no passkey,
   * before any key derivation, and otherwise as {@link Vault.putWayin} does. Like `putWayin()`, it
   * moves the gate epoch, so every other device locks and must unlock again with the passphrase;
   * this one is left unlocked, its lease starting again from now.
   *
   * Removing is not revoking: whoever holds the removed passkey, and kept a copy of the vault props
   * from before, can still open that copy. The vaultKey inside it is the one the vault still uses.
   *
   * @example await vault.delWayin(passphrase)   // the passkey is gone
   */
  async delWayin(passphrase: string): Promise<Vault> { return valOf(await this.tryDelWayin(passphrase)) }

  /** Take away the vault's passkey, as an {@link Outcome}: the non-throwing form of {@link Vault.delWayin}. */
  async tryDelWayin(passphrase: string): Promise<Outcome<Vault>> {
    try {
      this.#checkStanding()
      checkStandingPassphrase(passphrase, 'delWayin')
      await this.#helloWithin(0)
      this.#checkStanding()
      const standing = this.#gatedProps()
      if (standing.passkey === null) {
        throw new VaultError('absent_wayin', "This vault has no passkey to remove: it may have been removed on another device. Nothing was changed.")
      }
      const base = Gate.of(this, standing)
      // The passphrase proves it: the passkey's wayin is the one leaving, and the lease is granted
      // by a wayin that stays.
      const proving = await PassphraseProving.seal(this, headerOf(standing.passphrase), passphrase)
      await proving.checkWayin()
      await this.#putGate(Gate.make(this, { base, passphrase: base.passphrase, passkey: null }), 'delWayin')
      await this.#grantAfterChange(proving, 'delWayin')
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: boxes]: putBox, getBox, getWhisper, useWhisper, delBox

  /** Seal `whisper` into the box `props.boxlabel` and store it, creating or replacing it, resolving the {@link Box} as stored.
   * Once it resolves, the box holds this whisper, and the snapshot lists its new revision. It goes
   * through {@link Vault.ensureLease}, which may prompt, only once the boxlabel, sidecar and whisper
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
   * on `getProof`, reads and opens the box (`VaultDB.getBox`, `box.extractWhisper()`), or seals it
   * (`Box.seal`) refuses 'vault_locked', writing nothing. Once `VaultDB.putBox` is
   * sent, a lock does not stop it: the write lands or refuses as storage decides. Once it lands, the
   * listing takes the box as storage stored it; a vault made anew meanwhile refuses 'vault_remade'
   * after the write landed.
   *
   * Every store stamps `written_at`, the same whisper stored again included; `registered_at` keeps
   * the box's first store. A box that will not read or open is written over as new, keeping neither
   * its sidecar nor its `registered_at`, when the whisper is given; a store keeping its whisper
   * refuses 'damaged_box'. One listed damaged with no revision refuses 'damaged_box', writing
   * nothing: {@link Vault.delBox} it first. A boxlabel the vault's check refuses is refused
   * 'bad_label', even where a box stands under it: the check gates writes alone.
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
      // The host's check gates every name written; reads and deletes hold a name to the floor alone.
      const label = Names.check(this.#rules, 'boxlabel', boxlabel)
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
   * goes through {@link Vault.ensureLease}, which may prompt, and reads `VaultDB.getBox` under the
   * vault this device holds.
   *
   * Refuses 'damaged_box' when its record fails its checks. It does not open the whisper, so a
   * whisper that will not open shows only at `extractWhisper()` or `getWhisper()`. A vault deleted
   * or made anew elsewhere refuses 'vault_gone', reading no box of the vault that stands now, and
   * this Vault object is gone with it: ask the bank for the vault again (`bank.ensureVault`).
   * Deleted or made anew while storage is read, it refuses
   * 'vault_gone' or 'vault_remade', as when the bank lets the vault go; a lock landing then lets the box
   * through, as it holds nothing secret. The boxlabel is held to the floor alone, 'bad_label'
   * below it: the vault's boxlabel check gates only writes, so a name it refuses reads as any other.
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
   * 'absent_box' at once for a box the snapshot does not list, or 'bad_label', as {@link Vault.getBox}
   * does; 'absent_box' too when another device or tab deleted it first. Writes with
   * `VaultDB.delBox`, which keeps no record of what it removed.
   *
   * The delete lands only in the vault this device last read. If that vault was deleted, or made
   * anew, elsewhere, nothing is removed, and the call refuses 'stale_write': `hello()` to see what
   * stands. Within that vault the delete wins: a revision another device or tab wrote meanwhile
   * is deleted all the same, its `outcome` 'deleted_other', and the logger warns. Deleted is gone: a
   * later `putBox()` from a device that never saw the delete is refused as stale. A lock landing
   * while the call waits on `getProof` refuses 'vault_locked', removing nothing. Once `VaultDB.delBox`
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
      const label = Names.checkFloor('boxlabel', boxlabel)
      // Checked before the user is asked for anything: a call that cannot land never prompts.
      if (! await this.#ensureUnlocked(0, () => this.#isListed(label))) { throw absentBox() }
      const lease = this.#demandLease('delBox')
      // Lands only in the vault this device holds a lease for, whatever revision of the box stands:
      // a vault deleted and made anew elsewhere refuses it. The revision the listing shows only
      // lets storage say whether it removed that one or another.
      const expected = { vault_tok: lease.vault_tok, revision_tok: this.#listedRevisionOf(label) }
      const showedDamaged = this.#isListedDamaged(label)
      const deleted = await outcomeOf(() => this.#vaultDB.delBox(this.#scope, label, expected), unexpectedError)
      // A lock landing meanwhile lets the deletion land.
      this.#demandAfterWait(deleted, { vault_tok: lease.vault_tok }, { call: 'delBox' })
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
      return good(this.#dropBoxListingOf({ boxlabel: label, vault_tok: lease.vault_tok, outcome }))
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: deleting]: del

  /** Delete the vault: every record it has in storage, and this device's lease of it, as the vault half of deleting an account.
   * Storage keeps a tombstone of the scope, which carries the vault's counter into any vault made
   * there later, and this device raises its record of the vault to it. It needs no unlock: an
   * authenticated owner can always delete their own rows server-side, so requiring one would only
   * look like protection. Writes with `VaultDB.delVault`, then locks as `lock()` does. Once it
   * resolves, this Vault object is gone: every call on it refuses 'vault_gone', and the bank hands
   * out a new one, `novel`, when asked for the vault again.
   *
   * It deletes only the vault this Vault object holds, at the ways in it holds. If that one was
   * deleted, made anew, or had its ways in changed elsewhere, storage keeps what stands there now,
   * and the call refuses 'stale_write', or as {@link Vault.demandConsistentWith} finds the vault
   * moved on, locking nothing: `hello()`, and a second `del()` deletes the vault the snapshot then
   * shows. A device store that cannot erase the lease refuses 'storage_unavailable' once the vault
   * is deleted and gone all the same.
   *
   * @example await vault.del()   // storage holds a tombstone; bank.ensureVault(draft) births the next life, novel
   */
  async del(): Promise<void> { valOf(await this.tryDel()) }

  /** Delete the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.del}. */
  async tryDel(): Promise<Outcome<void>> {
    try {
      this.#checkStanding()
      const doomed = this.#vaultProps
      const deleted = await outcomeOf(() => this.#vaultDB.delVault(this.#scope, { vault_tok: doomed.vault_tok, gate_epoch: doomed.gate_epoch }), unexpectedError)
      // A deletion storage refused is told as the vault now stands. One that landed is this
      // vault's, by its expectation, whatever a read has made of it meanwhile.
      if (! deleted.ok) {
        this.#demandAfterWait(deleted, { vault_tok: doomed.vault_tok }, { call: 'del' })
        throw deleted.err
      }
      const erased = this.#lockNow()
      // The bank hears it, and births the next life when asked.
      this.#letGo(goneError())
      await this.#raiseRecordAfter(deleted.val.vault_epoch, 'del')
      valOf(await erased)
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The bank lets this Vault object go: it is gone, every call refusing 'vault_gone', as `bank.closeVault` says. Not a lock: nothing stored is erased, and the lease stays for the next Vault object. */
  [letGo](): void { this.#letGo(null) }
  // --

  // == [Options and setup]: bear, the constructor, scope, parsed options, limits, vaultDB, onBadNews, getProof, onGone, clockNow

  readonly #scope: VaultScope
  readonly #rules: Names.NameRules
  // Every storage refusal, whichever call met it, passes by the refusal policy on its way out.
  readonly #vaultDB: RefusalPolicy.HeededVaultDB
  // Every failure of the device's own storage reaches the vault's callers as a condition, with a kind.
  readonly #deviceDB: DeviceDB
  // The vault reads its own lease length, and calls its own hello: a host writing over the public
  // `hello` on the Vault object changes nothing inside the vault.
  readonly #leaseMillis: number
  // How long a hello trusts the last read when its call says nothing: see hello().
  readonly #staleMillis: number
  readonly #onBadNews: BadNewsHandler | null
  readonly #getProof: GetProof | null
  readonly #logger: VaultLogger
  readonly #clock: Clock
  readonly #keyDeriver: KeyDeriver
  readonly #strengthChecker: GuardedStrengthChecker
  readonly #whisperByteLimit: number
  readonly #boxLimit: number
  readonly #vaultByteLimit: number
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
    this.#scope = parts.scope
    this.#rules = parts.rules
    this.#vaultDB = RefusalPolicy.heed(parts.vaultDB, async (refusal) => { await this.#heedRefusal(refusal) })
    this.#deviceDB = deviceTroubleAsConditions(parts.deviceDB)
    this.#leaseMillis = parts.leaseMillis
    this.#staleMillis = parts.staleMillis
    this.#onBadNews = parts.onBadNews
    this.#getProof = parts.getProof
    this.#logger = parts.logger
    this.#clock = parts.clock
    this.#keyDeriver = parts.keyDeriver
    this.#strengthChecker = parts.strengthChecker
    this.#whisperByteLimit = parts.whisperByteLimit
    this.#boxLimit = parts.boxLimit
    this.#vaultByteLimit = parts.vaultByteLimit
    this.#onGone = onGone
    this.#vaultProps = frozenVaultProps(born.vaultProps)
    this.#deviceId = born.record.device_id
    this.#snapshot = this.#picture()
    registerLeaseReader(this, () => this.#lease)
    registerProvingInside(this, {
      vaultProps: () => this.#vaultProps,
      deviceId:   () => this.#deviceId,
      putLease:   async (record) => {
        // A take-up under way stands down before this lease is written, not after: one that read an
        // older lease could otherwise erase this one as it discards that.
        this.#standDownTakeUp()
        return valOf(await this.#deviceDB.putLease(record))
      },
      holdLease: (stored) => this.#holdLease(stored),
    })
    this.#takePicture({ fresh: this.#vaultProps, listed: born.listed, leaseKept: null, readAt: born.readAt })
    this.#takeUpAtBirth(born.leaseKept)
    this.#watchStorage()
  }

  /** The host's clock, read now, rounded down to whole milliseconds: every time a record keeps is an integer. */
  #clockNow(): number { return Math.floor(this.#clock.now()) }
  // --

  // == [State and snapshot]: vaultProps, lease, expiry, unlockStands, listeners, snapshot, picture, replaceSnapshot

  // The vault props in hand, frozen: gateless while novel, and of one vault_tok for the Vault object's life.
  #vaultProps: VaultProps
  // This device's id for the scope, from its device record: every way in it seals carries it.
  #deviceId: string
  #boxes: readonly (BoxSummary | DamagedBox)[] = []
  // The lease this Vault object holds, opened: the one place it keeps the vaultKey. Dropping it locks.
  #lease: Lease | null = null
  // When the lease in hand was granted or taken up, by the vault's clock: a read of this device's
  // store begun before then is older than it, and cannot say it was revoked.
  #leaseSince = FarPast
  // Set once the bank lets the Vault object go, or it is deleted, or found deleted or made anew:
  // what every call refuses with from then on, 'vault_remade' for a vault made anew, else 'vault_gone'.
  #goneBy: (() => VaultError) | null = null
  // The timer that drops the lease at askPassphraseAt. Null when none is held, or the one held
  // lasts until lock().
  #expiry: ReturnType<typeof setTimeout> | null = null

  readonly #listeners = new Set<() => void>()
  #vaultState(now: number): VaultState {
    if (! isGated(this.#vaultProps)) { return 'novel' }
    return this.#unlockStands(now) ? 'unlocked' : 'locked'
  }
  #freshness(now: number): VaultFreshness {
    if (this.#readRefused) { return 'refused' }
    return now - this.#readAt >= this.#staleMillis ? 'aged' : 'timely'
  }
  /** True while a lease is held that has not ended by `now`. */
  #unlockStands(now: number): boolean {
    return this.#lease !== null && ! this.#lease.endsBy(now)
  }
  // The ways in of each vault props record the vault has held, made once per record. Every record
  // the vault holds is frozen as it takes it up (see frozenVaultProps), so the ways in made of one,
  // and the vault props they are bound to, never change under it.
  readonly #modelled = new WeakMap<GatedVaultProps, HeldWayins>()
  #wayinsOf(standing: GatedVaultProps): HeldWayins {
    const known = this.#modelled.get(standing)
    if (known !== undefined) { return known }
    const wayins = Object.freeze({
      passphrase: Wayin.make(this, standing.vault_tok, standing.passphrase),
      passkey:    standing.passkey === null ? null : Wayin.make(this, standing.vault_tok, standing.passkey),
    })
    this.#modelled.set(standing, wayins)
    return wayins
  }
  /** The ways in of `standing`, the passphrase's first, as a list: none for gateless vault props. */
  #wayinListOf(standing: VaultProps | null): readonly (PassphraseWayin | PasskeyWayin)[] {
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
  // The vault props the snapshot was last settled from, whose ways in it shows as summaries: the
  // vault's alone, as their salts and wraps are what an offline guess at a passphrase needs.
  #shownProps: VaultProps | null = null

  /** The snapshot the private state makes at `now`, frozen: the clock read now, unless the caller knows the time without it. */
  #picture(now = this.#clockNow()): VaultSnapshot {
    const state = this.#vaultState(now)
    const standing = this.#vaultProps
    const wayins = isGated(standing) ? this.#wayinsOf(standing) : null
    const { boxes, bytes } = this.#capacity()
    return Object.freeze({
      ...this.#scope,
      vault_tok:       standing.vault_tok,
      registered_at:   standing.registered_at,
      gate_epoch:      standing.gate_epoch,
      passphrase:      wayins === null ? null : Object.freeze(wayins.passphrase.toJSON()),
      passkey:         wayins?.passkey ? Object.freeze(wayins.passkey.toJSON()) : null,
      state,
      boxes:           Object.freeze(this.#boxes.map((box) => Object.freeze(box))),
      capacity:        Object.freeze({ boxes: Object.freeze(boxes), bytes: Object.freeze(bytes) }),
      askPassphraseAt: state === 'unlocked' ? this.#lease?.ask_passphrase_at ?? null : null,
      trouble:         this.#trouble,
      freshness:       this.#freshness(now),
    })
  }

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped.
   * It keeps its identity, and tells nobody, until something really changed: useSyncExternalStore's
   * contract, and what spares React a render after a refresh that found nothing new. `now` is
   * the time it is reckoned at, the clock read now unless the caller knows it.
   */
  #replaceSnapshot(now?: number) {
    this.#shownProps = this.#vaultProps
    const next = this.#picture(now)
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

  /** Fetch the vault props, listing and this device's lease, judge them against the picture in hand, and raise this device's record to what was taken.
   * The device record is read first, so a raise this device's own write made is never held against a
   * read served before that write landed. The judgment is synchronous ({@link Vault.#judgeRead}).
   */
  async #takeStorage() {
    const readAt = this.#clockNow()
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
    this.#takePicture({ fresh: frozenVaultProps(verdict.vaultProps), listed: verdict.boxes, leaseKept: valOf(leaseKept), readAt })
    await this.#raiseRecordAfter(verdict.vaultProps.vault_epoch, 'refresh')
  }

  /** Judge one read of storage against the picture in hand and `record`, this device's record as read before it, synchronously: the read to take, `ignore`, or `behind`.
   * A Vault object let go meanwhile takes nothing. The vault deleted, or made anew under another
   * `vault_tok`, makes this Vault object gone for good, refusing 'vault_gone' or 'vault_remade'. A
   * read older than the picture (the same vault at a lower epoch: one served before this device's
   * own write) is ignored, and judged so before any other check. A read below the record's highest
   * `vault_epoch` is `behind`: the caller refuses it 'vault_behind', taking nothing.
   */
  #judgeRead(read: ListedVault | null, record: DeviceRecord | null): ListedVault | 'ignore' | 'behind' {
    if (this.#goneBy !== null) { return 'ignore' }
    if (read === null) {
      const gone = goneError()
      this.#letGo(gone)
      throw gone
    }
    if (read.vaultProps.vault_tok !== this.#vaultProps.vault_tok) {
      const remade = remadeError()
      this.#letGo(remade)
      throw remade
    }
    if (isOlderPicture(this.#vaultProps, read.vaultProps)) { return 'ignore' }
    if (record !== null && read.vaultProps.vault_epoch < record.highest_vault_epoch) { return 'behind' }
    return read
  }

  /** Replace the picture with what one read found, synchronously: vault props and listing together, never a vault beside another's boxes.
   * The lease in hand is dropped, in memory only, when it no longer fits the vault props' ways in.
   * It is dropped too when this device's store holds no lease (a lock in another tab), or one
   * granted after it (another tab's unlock), unless the read began before the lease in hand was
   * taken, or found the lease the store held before it: a read older than the lease, which changes
   * nothing. None is taken up here. Bad news is told once the snapshot shows it.
   */
  #takePicture(found: { fresh: VaultProps, listed: readonly (ListedSummary | DamagedBox)[], leaseKept: LeaseRecord | null, readAt: number }) {
    const { fresh } = found
    const shown = this.#boxes
    const shownWayins = this.#wayinListOf(this.#shownProps)
    this.#vaultProps = fresh
    this.#boxes = found.listed.map((box) => heldListing(box, fresh.vault_tok))
    this.#readRefused = false
    this.#readAt = found.readAt
    // A read with no damaged box or way in clears the trouble: nothing amiss stands. The listing is
    // published before its news is told, so a handler reading the vault sees what it lists.
    const damagedWayins = this.#wayinListOf(fresh).filter((wayin) => wayin.isDamaged())
    if (this.#boxes.every((box) => ! box.damaged) && damagedWayins.length === 0) { this.#trouble = null }
    const held = this.#lease
    const outdated = held !== null && ! fitsLease(fresh, held)
    const revoked = held !== null && found.readAt >= this.#leaseSince && ! standsBeside(found.leaseKept, held)
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
    const raised = await this.#deviceDB.raiseDeviceRecord({ format: DeviceRecordFormat, ...this.#scope, device_id: this.#deviceId, highest_vault_epoch: vaultEpoch })
    if (raised.ok) { return }
    this.#logger.warn("This device could not note the newest copy of the vault it has seen in its record of the vault: what it did stands, and the record catches up at a later read.", { call }, raised.err)
  }
  // --

  // == [Demand]: checkStanding, demand, demandAfterWait, inconsistencyWith, leaseRefusal, demandLease, gatedProps

  /** Refuse once this Vault object is gone, 'vault_remade' for a vault made anew and 'vault_gone' otherwise: what every call asks first, and again after a wait it has no thing in hand for. */
  #checkStanding() {
    if (this.#goneBy !== null) { throw this.#goneBy() }
  }

  /** Refuse unless `thing` is consistent with the picture in hand, as {@link Vault.demandConsistentWith} says: the one demand, before and after each wait. */
  #demand(thing: Stamped, opts: { leaseBound?: boolean, call: VaultCall }) {
    const refusal = this.#inconsistencyWith(thing) ?? (opts.leaseBound === true ? this.#leaseRefusal() : null)
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
  #demandAfterWait(settled: Outcome<unknown>, thing: Stamped, opts: { leaseBound?: boolean, call: VaultCall }) {
    if (! settled.ok && UntrustedStorageKinds.some((kind) => isVaultError(settled.err, kind))) { throw settled.err }
    this.#demand(thing, { leaseBound: opts.leaseBound === true && settled.ok, call: opts.call })
  }

  /** Why `thing` is not consistent with the picture in hand, the vault half (gone, made anew, ways in moved), or null when it is. */
  #inconsistencyWith(thing: Stamped): VaultError | null {
    if (this.#goneBy !== null) { return this.#goneBy() }
    const held = this.#vaultProps
    const sameScope = (thing.applabel ?? this.#scope.applabel) === this.#scope.applabel
      && (thing.user_id ?? this.#scope.user_id) === this.#scope.user_id
      && (thing.vaultlabel ?? this.#scope.vaultlabel) === this.#scope.vaultlabel
    if (! sameScope || thing.vault_tok !== held.vault_tok) { return remadeError() }
    if (thing instanceof Proving) { return this.#provingInconsistency(thing as Proving) }
    if (thing instanceof Gate) { return thing.base_epoch === held.gate_epoch || thing.isHeldBy(held) ? null : gateMovedError() }
    if ((thing.gate_epoch ?? held.gate_epoch) !== held.gate_epoch || (thing.vault_epoch ?? held.vault_epoch) > held.vault_epoch) { return gateMovedError() }
    return null
  }

  /** Why `proving` is not consistent with the gate in hand: its header is in no wayin of the gate, which moved since it was sealed ('gate_moved'), or its gating landed ('gating_landed').
   * A fresh header is in no gate until the one carrying it is stored: until then the gate it was
   * sealed under must stand.
   */
  #provingInconsistency(proving: Proving): VaultError | null {
    const held = this.#vaultProps
    if (! proving.isCarriedBy(held) && proving.gate_epoch !== held.gate_epoch) { return gateMovedError() }
    if (proving.gating.landed) { return gatingLandedError() }
    return null
  }

  /** Why the lease half refuses: no lease in hand, or one ended, which is dropped as its expiry drops it; null while one stands. */
  #leaseRefusal(): VaultError | null {
    if (this.#lease === null) { return lockedError() }
    if (! this.#lease.endsBy(this.#clockNow())) { return null }
    this.#dropLease()
    return lockedError()
  }

  /** The lease in hand, for `call` about to use it: demanded to stand, consistent with the picture, and not ended, or 'vault_locked'. */
  #demandLease(call: VaultCall): Lease {
    const lease = this.#lease
    if (lease === null) { throw lockedError() }
    this.#demand(lease, { leaseBound: true, call })
    return lease
  }

  /** The vault props in hand, once the vault has its passphrase: 'absent_vault' while it is novel. */
  #gatedProps(): GatedVaultProps {
    if (! isGated(this.#vaultProps)) {
      throw new VaultError('absent_vault', 'This vault has no passphrase yet, so nothing can prove a change to its ways in: the first unlock() sets its passphrase.')
    }
    return this.#vaultProps
  }
  // --

  // == [Asking for a proof]: asking, ensureUnlocked, leaseStandsPast, whyAsk, raiseAsk, landLock, tryAttempt, unlockWith

  // The prompt up now, if any: every call that needs the vault unlocked while it is up waits on its
  // one answer. See ensureLease().
  #asking: RaisedAsk | null = null

  /** Have the vault unlocked: at once while a lease of the ways in held stands past `renewMillis` from now, else by this device's lease, else once the prompt answers.
   * The prompt is the one up, or one raised now. See {@link Vault.ensureLease}. `shouldAsk` runs
   * only when the vault must ask, after the hello and before any prompt: a call checks there what
   * it can know without the key, so a call that cannot land never prompts. It resolves true once
   * unlocked, the prompt answered, demanding nothing after: the call's own operation demands on the
   * lease first. It resolves false, asking nobody, when `shouldAsk` says not to ask.
   */
  async #ensureUnlocked(renewMillis: number, shouldAsk?: () => boolean): Promise<boolean> {
    await this.#helloWithin(this.#staleMillis)
    // The bank letting the vault go during the hello: no ask is raised over a gone Vault object.
    this.#checkStanding()
    if (this.#leaseStandsPast(renewMillis)) { return true }
    // Another tab's unlock, taken up before anyone is asked (see takeUpLease).
    if (this.#lease === null) {
      await this.#takeUpLease()
      // Nor during the take-up.
      this.#checkStanding()
    }
    if (this.#leaseStandsPast(renewMillis)) { return true }
    if (shouldAsk?.() === false) { return false }
    const why = this.#whyAsk()
    const answered = await (this.#asking ?? this.#raiseAsk(why)).answer
    // A let-go ends the prompt as a lock lands, but its waiters hear the Vault object is gone.
    this.#checkStanding()
    const answer = valOf(answered)
    if (answer === 'declined') { throw declinedError(this.#getProof !== null) }
    return true
  }

  /** True while the lease in hand fits the ways in the picture holds and does not end within `renewMillis` from now. */
  #leaseStandsPast(renewMillis: number): boolean {
    const held = this.#lease
    if (held === null) { return false }
    return fitsLease(this.#vaultProps, held) && ! held.endsBy(this.#clockNow() + renewMillis)
  }

  /** Why the vault must ask for a proof, once no lease in hand stands past the call's `renewMinutes`. */
  #whyAsk(): AskWhy {
    if (! isGated(this.#vaultProps)) { return 'novel' }
    // The threshold is the truth: a lease past its deadline goes now, should its timer run late.
    if (this.#lease !== null && this.#lease.endsBy(this.#clockNow())) { this.#dropLease() }
    return this.#lease === null ? 'locked' : 'lease_ending'
  }

  /** Raise a prompt for `why`, up until it is answered or a lock lands. */
  #raiseAsk(why: AskWhy): RaisedAsk {
    const raised = Ask[raiseAsk](why, this, (givenProof, overtaken) => this.#tryAttempt(givenProof, overtaken), this.#getProof)
    this.#asking = raised
    // Answered or refused, the prompt is down: the next call that needs a proof raises another.
    void raised.answer.then(() => { if (this.#asking === raised) { this.#asking = null } })
    return raised
  }

  /** A `lock()` or `del()` has landed, or the vault went gone: the prompt up, if any, refuses its waiters and settles `lockLanded`. */
  #landLock() {
    this.#asking?.landLock()
    this.#asking = null
  }

  /** An ask's `attempt`: one proof's unlock, as an Outcome, taking nothing up once `overtaken` aborts as the prompt ends. */
  async #tryAttempt(givenProof: string | PasskeyAnswer, overtaken: AbortSignal): Promise<Outcome<Vault>> {
    try {
      await this.#unlockWith(givenProof, { get landed() { return overtaken.aborted } })
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Unlock with one proof, as `unlock()` and an ask's `attempt` do, against the vault props as storage holds them now, for `gating`.
   * A novel vault's first passphrase makes its first gate ({@link Vault.#unlockCreating}).
   * Otherwise the proof is sealed over the gate's wayin of its kind, and grants the lease
   * (`proving.grantLease()`), which demands at each step that the vault still stands as proven and
   * that `gating` has not landed: an ask's attempt's gating lands as its prompt ends; `unlock()`'s
   * never does.
   */
  async #unlockWith(givenProof: string | PasskeyAnswer, gating: ProvingGating = StandingGating): Promise<void> {
    this.#checkStanding()
    if (typeof givenProof !== 'string') { checkedPasskeyAnswer(givenProof) }
    // The proof proves itself against the vault props as storage holds them now, not a picture a
    // change elsewhere has outdated: a passphrase replaced there opens nothing here.
    await this.#helloWithin(0)
    this.#checkStanding()
    const held = this.#vaultProps
    if (! isGated(held)) {
      await this.#unlockCreating(givenProof, held, gating)
      return
    }
    const proving = await this.#provingOf(held, givenProof, gating)
    await proving.grantLease()
  }
  // --

  // == [Unlock and ways in]: provingOf, unlockCreating, putGate, takeOwnWrite, grantAfterChange

  /** The proving of `givenProof` over `held`'s wayin of its kind, for `gating`: 'absent_wayin' for a passkey's answer to a vault with no passkey. */
  async #provingOf(held: GatedVaultProps, givenProof: string | PasskeyAnswer, gating: ProvingGating): Promise<Proving> {
    if (typeof givenProof === 'string') { return await PassphraseProving.seal(this, headerOf(held.passphrase), givenProof, { gating }) }
    if (held.passkey === null) {
      throw new VaultError('absent_wayin', "This vault has no passkey: it may have been removed on another device. Unlock with the passphrase.")
    }
    return await PasskeyProving.seal(this, headerOf(held.passkey), givenProof, { gating })
  }

  /** The first unlock of a novel vault, `base`: its first gate, its one wayin `givenProof`'s fresh passphrase around a brand-new vaultKey, stored over `base`, and the lease granted by it.
   * A passkey's answer refuses 'absent_vault'. The passphrase must pass {@link Vault.checkStrength}
   * first. Another device's first gate landing first refuses 'gate_made_elsewhere', whatever its
   * passphrase: nothing was written, and the next hello reads it.
   */
  async #unlockCreating(givenProof: string | PasskeyAnswer, base: GatelessVaultProps, gating: ProvingGating): Promise<void> {
    if (typeof givenProof !== 'string') {
      throw new VaultError('absent_vault', 'This vault has no passphrase yet, so no passkey opens it: the first unlock(), with a passphrase, sets it.')
    }
    await this.checkStrength(givenProof)
    this.#demand(stampOf(this.#scope, base), { call: 'unlock' })
    // Sealed before storage is touched, so a deriver that fails writes nothing.
    const proving = await PassphraseProving.seal(this, { slotlabel: 'passphrase' }, givenProof, { gating })
    const wayins = await proving.sealWayins()
    await this.#putGate(Gate.make(this, { base: null, ...wayins }), 'unlock')
    await proving.grantLease()
  }

  /** Store `gate` over its base, the gate in hand, with `VaultDB.putVaultProps` expecting its `vault_tok` and base epoch, resolving the gate as stored.
   * It demands on the gate before and after the write. The picture takes what was stored, unless
   * a read has already taken a later copy, and the device record is raised to its `vault_epoch`.
   * A first gate losing to another device's refuses 'gate_made_elsewhere', and the next hello reads
   * the gate that stands; any other stale write refuses 'stale_write', naming nothing stored.
   */
  async #putGate(gate: Gate, call: 'unlock' | 'putWayin' | 'delWayin'): Promise<Gate> {
    this.#demand(gate, { call })
    const held = this.#vaultProps
    // `vault_epoch` is the one the store will set, the standing one plus one; the store ignores what it is handed.
    const drafted = frozenVaultProps({ ...held, vault_epoch: held.vault_epoch + 1, ...gate.storedFields })
    const written = await outcomeOf(() => this.#vaultDB.putVaultProps(drafted, { vault_tok: gate.vault_tok, gate_epoch: gate.base_epoch }), unexpectedError)
    // A refused first gate demands the vault half only: a read meanwhile may have taken up the
    // other device's first gate, which is 'gate_made_elsewhere', not a gate moved.
    this.#demandAfterWait(written, gate.base_epoch === 0 && ! written.ok ? { vault_tok: gate.vault_tok } : gate, { call })
    if (! written.ok) { throw this.#gateWriteRefusal(gate, written.err) }
    const next = frozenVaultProps(written.val) as GatedVaultProps
    const stored = Gate.of(this, next)
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
   * stands. Any other stale write is 'stale_write', naming nothing stored.
   */
  #gateWriteRefusal(gate: Gate, err: VaultError): unknown {
    const winner = isVaultError(err, 'stale_write') ? err.meta?.vault_props_stored : undefined
    if (winner !== undefined && winner?.vault_tok !== gate.vault_tok) {
      const told = winner === null ? goneError() : remadeError()
      this.#letGo(told)
      return told
    }
    if (gate.base_epoch > 0 || ! isGateMadeElsewhere(err, gate.vault_tok)) { return strippedOfStoredProps(err) }
    // The gate that stands is another device's: the next hello reads it, whatever staleMinutes says.
    this.#readAt = FarPast
    return gateMadeElsewhereError()
  }

  /** Take `next`, vault props a write of this Vault object's own just stored, into the picture, unless a read has already taken a later copy, or the Vault object went gone meanwhile: then the grant that follows finds the vault moved on, and writes no lease. */
  #takeOwnWrite(next: GatedVaultProps) {
    if (this.#goneBy !== null || isOlderPicture(this.#vaultProps, next)) { return }
    this.#vaultProps = next
    this.#replaceSnapshot()
  }

  /** Grant the lease by `proving` once a change to the ways in has landed: a failure is said through the logger, never thrown as though the change had not landed. */
  async #grantAfterChange(proving: Proving, call: 'putWayin' | 'delWayin') {
    try {
      await proving.grantLease()
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands as it stood here, and asks for the passphrase at its next open.", { call }, asError(err))
    }
    this.#replaceSnapshot()
  }
  // --

  // == [Locking and expiry]: lockNow, heedRefusal, letGo, dropLease, armExpiry, disarmExpiry

  /** Lock, all a caller can see at once and in this order: the lease and its expiry dropped, a take-up under way stood down, the prompt landed on, the snapshot replaced; then the erase, whose promise it returns.
   * Every lock goes through here. Nothing is awaited before the erase is issued, so the device
   * store applies it after any lease write already issued: a grant under way when it lands is
   * erased behind it.
   */
  #lockNow(): Promise<Outcome<void>> {
    this.#standDownTakeUp()
    this.#lease = null
    this.#disarmExpiry()
    this.#landLock()
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
    this.#standDownTakeUp()
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
    this.#landLock()
    // A take-up under way takes nothing up.
    this.#standDownTakeUp()
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

  // == [Lease]: holdLease, takeUpLease, takeUp, standDownTakeUp, takeUpUnder, discardLease

  /** Hold `stored`, a lease record just written to this device's store, as the vault's lease: its expiry armed, the snapshot replaced. */
  #holdLease(stored: LeaseRecord): Lease {
    const lease = Lease.make(this, stored)
    this.#lease = lease
    this.#leaseSince = this.#clockNow()
    this.#armExpiry(lease.ask_passphrase_at, this.#leaseSince)
    this.#replaceSnapshot()
    return lease
  }

  /** Take up this device's lease when it fits the vault props in hand and opens: the vault is then unlocked until its `askPassphraseAt`.
   * The first hello runs it, and `ensureLease()` with no lease in hand, so another tab's unlock is
   * taken up without a prompt. A lease that does not fit or open is discarded. One ending later
   * than this Vault object's `leaseHours` allows from now does not fit: lowering `leaseHours` has
   * each device ask again, and raising it lengthens no lease already granted. A record the
   * deviceDB hands back that fails its check reads as no lease. Nothing here writes a lease, so it
   * never brings back one another tab's `lock()` erased. A lock, a grant or a close landing while
   * the lease is read stands it down, taking nothing up, as does the vault moving on meanwhile.
   */
  async #takeUpLease() {
    this.#standDownTakeUp()
    const takeUp = new AbortController()
    this.#takeUp = takeUp
    try {
      await this.#takeUpUnder(takeUp.signal)
    } finally {
      if (this.#takeUp === takeUp) { this.#takeUp = null }
    }
  }

  // The lease take-up under way, if any. A lock() and a grant stand it down, and one stood down
  // writes nothing: the key change that landed while the lease was read wins. It is the take-up's
  // own guard, which no demand can be: what a lock changes is the lease in hand, and a take-up
  // has none.
  #takeUp: AbortController | null = null

  /** Have a lease take-up under way stand down: a key change has landed since it began. */
  #standDownTakeUp() {
    this.#takeUp?.abort()
    this.#takeUp = null
  }

  /** `#takeUpLease`'s work: it writes nothing once `stoodDown` aborts, or the lease no longer fits the vault props in hand. */
  async #takeUpUnder(stoodDown: AbortSignal) {
    // Read afresh after each wait, as a lock may land during any of them.
    const isStoodDown = () => stoodDown.aborted
    const kept = valOf(await this.#deviceDB.getLease(this.#scope))
    // A key change since the read began makes what was read no lease to take up, nor to discard:
    // the lease standing now may be the one that change wrote.
    if (kept === null || isStoodDown()) { return }
    const standing = this.#vaultProps
    // A record that is no lease, or another vault's, is unreadable.
    const made = await outcomeOf(() => Lease.make(this, kept), unexpectedError)
    if (isStoodDown()) { return }
    if (! made.ok) {
      await this.#discardLease(made.err)
      return
    }
    // One outrun by the vault moving on meanwhile is left alone: the lease standing now may be the
    // change's own, and the next take-up judges it against the vault props then.
    if (this.#inconsistencyWith(stampOf(this.#scope, standing)) !== null) { return }
    const lease = made.val
    // Its wrap is not tried: a damaged one refuses at its first use.
    if (! this.#fitsTakeUp(lease)) {
      await this.#discardLease(null)
      return
    }
    this.#lease = lease
    this.#leaseSince = this.#clockNow()
    this.#armExpiry(lease.ask_passphrase_at, this.#leaseSince)
    this.#replaceSnapshot()
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
    if (! this.#fitsTakeUp(lease)) { return }
    this.#lease = lease
    this.#leaseSince = this.#clockNow()
    this.#armExpiry(lease.ask_passphrase_at, this.#leaseSince)
    this.#replaceSnapshot()
  }

  /** True when `lease`, a stored lease about to be taken up, fits: of the gate in hand (its `vault_tok` and `gate_epoch`), not ended, and ending no later than this vault's `leaseHours` from now.
   * The last is what makes lowering `leaseHours` take hold on each device, and what refuses a lease
   * granted before the clock stepped back. The one predicate wherever a stored lease is taken up;
   * a call's `renewMinutes` is held to the lease taken up after it, by `#leaseStandsPast`.
   */
  #fitsTakeUp(lease: Lease): boolean {
    const now = this.#clockNow()
    return fitsLease(this.#vaultProps, lease) && ! lease.endsBy(now) && lease.endsBy(now + this.#leaseMillis)
  }

  /** Erase this device's lease, which did not fit or open as `refusal` says, or (null) was granted under a longer `leaseHours`.
   * A lease that would not read or open is warned of once erased, so the warning never claims a
   * discard that failed; an expired or outdated one is routine. Neither the record nor what it
   * failed is told: the record holds key material.
   */
  async #discardLease(refusal: VaultError | null) {
    valOf(await this.#deviceDB.delLease(this.#scope))
    if (refusal === null || refusal.refusalkind === 'vault_locked') { return }
    this.#logger.warn("This device's lease could not be read or would not open, so it was discarded: the vault opens locked, and asks for the passphrase again.", { call: 'hello' })
  }
  // --

  // == [Box limits]: boxWeight, capacity, checkWhisperFits, checkRoomFor

  /** What one box counts for against the vault's storage: room for a whisper and sidecar of `maxWhisperBytes`, its fixed fields, and its names as they are.
   * The whisper's room is {@link StoredBytesPerWhisperByte} bytes for each byte of `maxWhisperBytes`.
   */
  #boxWeight(boxlabel: string) {
    return (this.#whisperByteLimit * StoredBytesPerWhisperByte) + BoxFixedBytes + jsonBytes([this.#scope, boxlabel])
  }

  /** The room the vault has, reckoned from the boxes last listed, as `#checkRoomFor` reckons it. */
  #capacity(): Capacity {
    const bytesUsed = this.#boxes.reduce((sum, box) => sum + this.#boxWeight(box.boxlabel), 0)
    return {
      boxes: { used: this.#boxes.length, max: this.#boxLimit },
      bytes: { used: bytesUsed, max: this.#vaultByteLimit },
    }
  }

  /** Refuse 'whisper_too_large' for a whisper whose JSON, with the sidecar's beside it, is over `maxWhisperBytes`, quoting neither; the sidecar alone is weighed when the whisper is left out. */
  #checkWhisperFits(whisper: Whisper | undefined, sidecar: Sidecar) {
    const whisperBytes = whisper === undefined ? new Uint8Array() : whisperBytesOf(whisper)
    const weight = whisperBytes.length + new TextEncoder().encode(stableJsonify(sidecar)).length
    whisperBytes.fill(0)
    if (weight <= this.#whisperByteLimit) { return }
    throw new VaultError('whisper_too_large', `That whisper and its box's sidecar are over this vault's limit of ${String(this.#whisperByteLimit)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Bank.make.`)
  }

  /** Refuse 'vault_full' for a new box while the vault holds `maxBoxes`, or one that would take it past `maxVaultBytes`.
   * Each box is weighed by `#boxWeight`. It counts from the boxes last listed, so a store costs no
   * extra read: a listing a moment stale may refuse, and a hello cures it. A replacement, sealed
   * over a base, always passes.
   */
  #checkRoomFor(boxlabel: string, base: BoxBase | null) {
    // A replacement weighs what it replaces, so it never makes the vault fuller: it always lands.
    if (base !== null) { return }
    const others = this.#boxes.filter((box) => box.boxlabel !== boxlabel)
    if (others.length >= this.#boxLimit) {
      throw new VaultError('vault_full', `This vault already holds its limit of ${String(this.#boxLimit)} boxes: remove one before storing another. A vault meant to hold more can be opened with a larger maxBoxes, up to what its storage adapter allows.`)
    }
    const othersWeight = others.reduce((sum, box) => sum + this.#boxWeight(box.boxlabel), 0)
    if (othersWeight + this.#boxWeight(boxlabel) > this.#vaultByteLimit) {
      throw new VaultError('vault_full', `This vault has no room for that box in the ${String(this.#vaultByteLimit)} bytes its storage holds of one vault, counting each box's boxlabel and room for a whisper and sidecar of maxWhisperBytes: remove a box, or store under a shorter boxlabel.`)
    }
  }
  // --

  // == [Reading boxes]: listedRevisionOf, isListed, isListedDamaged, getBoxUnlocked, readBox, boxReadRefusal, boxUnder

  /** The revision the listing names for the box under `boxlabel`, sound or damaged; null for none listed, or a damaged record that holds none.
   * Storage arbitrates a write that names it, so a listing gone stale costs a refusal and a second
   * store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#boxes.find((box) => box.boxlabel === boxlabel)?.revision_tok ?? null }

  /** True when the snapshot's listing shows a box under `boxlabel`: what a locked vault can know before it asks for a proof. Reads nothing. */
  #isListed(boxlabel: string): boolean { return this.#boxes.some((box) => box.boxlabel === boxlabel) }

  /** True when the snapshot's listing shows the box under `boxlabel` as damaged. */
  #isListedDamaged(boxlabel: string): boolean { return this.#boxes.some((box) => box.boxlabel === boxlabel && box.damaged) }

  /** The box under `boxlabel`, once the vault is unlocked for it; null when there is none, or when a locked vault's listing shows none, asking nobody. */
  async #getBoxUnlocked(boxlabel: string, call: VaultCall): Promise<Box | null> {
    this.#checkStanding()
    const label = Names.checkFloor('boxlabel', boxlabel)
    // Checked before the user is asked for anything: a box the listing does not show is none.
    if (! await this.#ensureUnlocked(0, () => this.#isListed(label))) { return null }
    const lease = this.#demandLease(call)
    return await this.#readBox(label, lease.vault_tok, call)
  }

  /** The box under `boxlabel` as storage holds it in the vault `vaultTok`, or null when none stands; the box demanded after the read, the vault half.
   * A box another device wrote is what storage holds, not drift. A lock meanwhile lets it through:
   * opening it is what demands the lease.
   */
  async #readBox(boxlabel: string, vaultTok: string, call: VaultCall): Promise<Box | null> {
    const read = await outcomeOf(() => this.#vaultDB.getBox(this.#scope, boxlabel, { vault_tok: vaultTok }), unexpectedError)
    // A vault that moved on meanwhile refuses as the demand finds it, never as what its read found.
    this.#demandAfterWait(read, { vault_tok: vaultTok }, { call })
    if (! read.ok) { throw this.#boxReadRefusal(read.err) }
    if (read.val === null) { return null }
    const fetched = this.#boxUnder(read.val, vaultTok)
    this.#demand(fetched, { call })
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

  /** `record` as a {@link Box}, lying in the vault `vaultTok`, which the read or write that handed it back expected; stamped with the picture's scope and epochs.
   */
  #boxUnder(record: BoxRecord, vaultTok: string): Box {
    return Box.make(this, record, { ...this.stamp, vault_tok: vaultTok })
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
      ? await this.#storedBase(boxlabel, lease.vault_tok, givenSidecar, givenWhisper)
      : { base: this.#listedBase(boxlabel), sidecar: givenSidecar, whisper: givenWhisper }
    // A lock landing while the box was read and opened refuses, sealing nothing.
    if (readFirst) { this.#demand(lease, { leaseBound: true, call: 'putBox' }) }
    // A sidecar kept counts toward the limit as one given does, weighed before any key is made.
    this.#checkWhisperFits(whisper, sidecar)
    this.#checkRoomFor(boxlabel, base)
    const sealed = await Box.trySeal(this, { boxlabel, sidecar, base }, whisper)
    // A lock landing during the seal refuses, writing nothing.
    this.#demandAfterWait(sealed, lease, { leaseBound: true, call: 'putBox' })
    const box = valOf(sealed)
    this.#demand(box, { call: 'putBox' })
    // Lands only in the vault this whisper is sealed for, over the revision it was sealed from: a
    // vault reborn elsewhere, or a box written meanwhile by another device, refuses it.
    const written = await outcomeOf(() => this.#writeOver(box, { vault_tok: box.vault_tok, revision_tok: box.baseRevisionTok }), unexpectedError)
    // A lock landing during the write lets it land; the vault moving on meanwhile refuses as the demand finds it.
    this.#demandAfterWait(written, { vault_tok: box.vault_tok }, { call: 'putBox' })
    return this.#updateBoxListingOf(valOf(written), box.vault_tok)
  }

  /** What a whole `putBox()` seals over, reading nothing: the listing's entry for `boxlabel`, its revision and `registered_at` adopted as they stand, or none for a box it does not show, which is a new box.
   * A box listed damaged gives its revision alone; one naming none refuses 'damaged_box'.
   */
  #listedBase(boxlabel: string): BoxBase | null {
    const listed = this.#boxes.find((box) => box.boxlabel === boxlabel)
    if (listed === undefined) { return null }
    if (! listed.damaged) { return { revision_tok: listed.revision_tok, registered_at: listed.registered_at } }
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
  async #storedBase(boxlabel: string, vaultTok: string, givenSidecar: Sidecar | undefined, givenWhisper: Whisper | undefined): Promise<{ base: BoxBase | null, sidecar: Sidecar, whisper: Whisper }> {
    const read = await outcomeOf(() => this.#readBox(boxlabel, vaultTok, 'putBox'), unexpectedError)
    this.#demandAfterWait(read, { vault_tok: vaultTok }, { call: 'putBox' })
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
   * The next hello lists it, with its revision for the next store.
   */
  #damagedBase(boxlabel: string): BoxBase | null {
    const revision = this.#listedRevisionOf(boxlabel)
    if (revision === null && this.#isListedDamaged(boxlabel)) { throw damagedBeyondNaming() }
    return revision === null ? null : { revision_tok: revision }
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

  /** Update the box listing with `stored`, the record a box write just landed in the vault `vaultTok`, once the box it makes is demanded consistent: a lock meanwhile lets it land. Resolves that box. */
  #updateBoxListingOf(stored: BoxRecord, vaultTok: string): Box {
    const box = this.#boxUnder(stored, vaultTok)
    this.#demand(box, { call: 'putBox' })
    const { boxlabel, revision_tok, sidecar, registered_at, written_at } = stored
    const entry = heldListing({ boxlabel, revision_tok, sidecar, registered_at, written_at, damaged: false }, vaultTok)
    this.#boxes = [...this.#boxes.filter((listed) => listed.boxlabel !== boxlabel), entry].toSorted((one, two) => byCodeUnit(one.boxlabel, two.boxlabel))
    this.#replaceSnapshot()
    return box
  }

  /** Drop the box `deleted` names, which a delete just removed, from the listing, once it is demanded consistent: a lock meanwhile lets it land. Resolves it, frozen. */
  #dropBoxListingOf(deleted: DeletedBox): DeletedBox {
    this.#demand(deleted, { call: 'delBox' })
    this.#boxes = this.#boxes.filter((box) => box.boxlabel !== deleted.boxlabel)
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
    const err = isVaultError(thrown) ? thrown : unexpectedError(thrown)
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

  /** Tell each box the published listing shows damaged that `shown`, the listing before it, did not show damaged at the same revision.
   * Each gets one 'damaged_box' news, its `meta.box_listed` the box, and the trouble is published once
   * all are told. The read that lists them succeeds all the same.
   */
  #tellListingNews(shown: readonly (BoxSummary | DamagedBox)[]) {
    const wasShown = (box: DamagedBox) => shown.some((was) => was.damaged && was.boxlabel === box.boxlabel && was.revision_tok === box.revision_tok)
    const news = this.#boxes.filter((box): box is DamagedBox => box.damaged && ! wasShown(box))
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
      this.#tellBadNews(new VaultError('damaged_wayin', "A way into this vault is stored damaged, so it can't be tried: this error's meta.wayin_listed names it. The other way in, if the vault has one, still opens it. A damaged passkey is mended by adding the passkey again; a damaged passphrase only by removing the vault and making it again.", { meta: { wayin_listed: wayin.toJSON() } }))
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

// == [Refusals]: damagedBeyondNaming, lockedError, declinedError, goneError, remadeError, behindError, gateMovedError, gatingLandedError, gateMadeElsewhereError, isGateMadeElsewhere, strippedOfStoredProps

const damagedBeyondNaming = () => new VaultError('damaged_box', "That box is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with delBox() first, then store its whisper again.")

const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call again, and the vault asks for a proof through getProof, or unlock it first.')

/** The refusal of a call whose ask was declined: by the user, or for want of a `getProof` to ask. */
const declinedError = (asked: boolean) => new VaultError('vault_locked', asked
  ? 'The vault is locked, and the user declined to unlock it: nothing was read or written. Ask again when they want the vault.'
  : 'The vault is locked, and there is no getProof to ask the user for a proof (Bank.make was given none): nothing was read or written. Prompt the user, unlock() with their passphrase, and call again.')

const goneError = () => new VaultError('vault_gone', 'This Vault object is gone -- the vault was deleted, here or on another device, or the app let this Vault object go -- so nothing more was read or written. Ask the bank for the vault again (bank.ensureVault) to see what stands now.')

const remadeError = () => new VaultError('vault_remade', 'The vault this call was working on was deleted and made anew on another device, so nothing more was read or written: what the call held belongs to the vault that was deleted. Ask the bank for the vault again (bank.ensureVault), and unlock the one that stands now.')

const behindError = () => new VaultError('vault_behind', "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask the bank for the vault again; otherwise the app's support should look at its storage.")

const gateMovedError = () => new VaultError('gate_moved', "The vault's ways in changed while this call was under way -- its passphrase or passkey was changed, here or on another device -- so nothing more was done. Unlock again to carry on.")

const gatingLandedError = () => new VaultError('gating_landed', 'The prompt ended while this proof was being checked -- a lock landed, or it was answered or declined -- and its end wins: nothing was unlocked. Ask again when the user wants the vault.')


/** The refusal of a first unlock that lost the race to another device setting the vault's first passphrase. It carries nothing of that device's gate. */
const gateMadeElsewhereError = () => new VaultError('gate_made_elsewhere', "This vault's passphrase was just set on another device, so the one you entered was not set here, and nothing was changed. Enter the passphrase chosen there to unlock it.")

/** True when `err`, a first gate's write refused, says another device's first gate stands on the vault `vaultTok`: a stale write whose stored vault props are gated, of that vault. */
const isGateMadeElsewhere = (err: VaultError, vaultTok: string): boolean => {
  const winner = isVaultError(err, 'stale_write') ? err.meta?.vault_props_stored : undefined
  return winner !== undefined && winner !== null && isGated(winner) && winner.vault_tok === vaultTok
}

/** `err` with the vault props a stale write names stripped: a vault's refusal carries no stored vault props record. Any other refusal as it came. */
const strippedOfStoredProps = (err: unknown): unknown => {
  if (! isVaultError(err, 'stale_write') || err.meta?.vault_props_stored === undefined) { return err }
  // Not the VaultDB's message, which sends the reader to a meta this refusal does not carry.
  return new VaultError(err.refusalkind, StaleWayinsMessage, err.cause === undefined ? {} : { cause: err.cause })
}


/** What a change to the ways in says when storage refuses it as stale. */
const StaleWayinsMessage = "The vault changed in storage since this device read it -- its ways in were changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying."

// --

// == [Vocabulary]: BirthRead, frozenVaultProps, stampOf, isOlderPicture, fitsLease, standsBeside, VaultCall, UntrustedStorageKinds

/** One read of storage and this device's store that a Vault object is born of, as `bank.ensureVault` made it.
 * `vaultProps` and `listed` are what `vaultDB.ensureVault` resolved; `leaseKept` what
 * `deviceDB.getLease` found; `record` this device's record of the scope as raised at birth; and
 * `readAt` when the read began, by the bank's clock.
 */
export type BirthRead = Readonly<{
  vaultProps: VaultProps
  listed:     readonly (ListedSummary | DamagedBox)[]
  leaseKept:  LeaseRecord | null
  record:     DeviceRecord
  readAt:     number
}>

/** A copy of `props`, frozen through its ways in: the vault props the vault holds, which no host can write to. */
const frozenVaultProps = (props: VaultProps): VaultProps => {
  if (! isGated(props)) { return Object.freeze({ ...props }) }
  return Object.freeze({ ...props, passphrase: frozenRecord(props.passphrase), passkey: props.passkey === null ? null : frozenRecord(props.passkey) })
}


/** The {@link Stamp} of `props` in `scope`, frozen. */
const stampOf = (scope: VaultScope, props: VaultProps): Stamp => Object.freeze({
  ...scope, vault_tok: props.vault_tok, vault_epoch: props.vault_epoch, gate_epoch: props.gate_epoch,
})

/** True when `fresh`, vault props a read or a write returned, are older than `inHand`: the same vault at a lower epoch.
 * That is a read served before this device's own write and answered after it, or a write a read
 * has already passed. Data cannot tell it from storage restored from an older copy, so it is
 * ignored, never refused.
 */
const isOlderPicture = (inHand: VaultProps, fresh: VaultProps): boolean => (
  inHand.vault_tok === fresh.vault_tok
  && (fresh.vault_epoch < inHand.vault_epoch || fresh.gate_epoch < inHand.gate_epoch)
)

/** True when `lease` was granted under the vault and ways in `standing` holds. */
const fitsLease = (standing: VaultProps, lease: Lease): boolean => lease.vault_tok === standing.vault_tok && lease.gate_epoch === standing.gate_epoch

/** True when `kept`, what this device's store held as its lease when a read looked, leaves `held`, the lease in hand, standing.
 * It does when it is `held` (the same vault, ways in and deadline), or a lease older than it: one
 * of the same vault under earlier ways in, or one ending sooner. That is the lease this device's
 * store held before `held` was granted, read before the grant landed. None, or a newer one
 * (another tab's unlock), does not.
 */
const standsBeside = (kept: unknown, held: Lease): boolean => {
  if (typeof kept !== 'object' || kept === null) { return false }
  const record: Partial<Record<keyof LeaseView, unknown>> = kept
  if (typeof record.ask_passphrase_at !== 'number' || typeof record.gate_epoch !== 'number') { return false }
  const sameVault = record.vault_tok === held.vault_tok
  const isHeld = sameVault && record.gate_epoch === held.gate_epoch && record.ask_passphrase_at === held.ask_passphrase_at
  const isOlder = (sameVault && record.gate_epoch < held.gate_epoch) || record.ask_passphrase_at < held.ask_passphrase_at
  return isHeld || isOlder
}

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'birth' | 'hello' | 'refresh' | 'unlock' | 'del' | 'untrustedStorage' | 'ensureLease' | 'demandConsistentWith'
  | 'putWayin' | 'delWayin' | 'putBox' | 'delBox' | 'getBox' | 'getWhisper'

/** The refusals that say storage cannot be trusted as it stands: 'identity_revoked' and 'vault_behind', which lock the vault, and 'newer_format'.
 * Each asks something of the caller that a stale write does not: the user to sign in again,
 * storage to be looked at, or the app to be updated. Each has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'vault_behind', 'newer_format'] as const satisfies readonly RefusalKind[]
// --

// == [Argument parsers]: eventHint, checkHelloOpts, checkEnsureLeaseOpts, PutBoxProps, checkPutBoxProps, putBoxPropsOf, DeletedBox, checkStandingPassphrase, absentBox, noWhisper

/** What a call that takes options most likely had in place of its bag, and what to do: an event, as `call` was handed to `addEventListener` or `onClick` itself. */
const eventHint = (call: 'hello' | 'ensureLease', tried: 'tryHello' | 'tryEnsureLease') => `${call}() was handed something other than a bag of options: an event, most likely, as ${call} was handed to addEventListener or onClick as the handler itself. Wrap it: \`() => vault.${tried}()\`, whose refusal, being returned, never surfaces as an unhandled rejection.`

/** What `hello()`'s options may hold: `staleMinutes`, which `parseStaleMinutes` checks, and nothing else. */
const checkHelloOpts = optionsCheck({ staleMinutes: Z.optional(Z.unknown()) }, "hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage: check its spelling, and leave out any other.", eventHint('hello', 'tryHello'))

/** What `ensureLease()`'s options may hold: `renewMinutes`, which `parseRenewMinutes` checks, and nothing else. */
const checkEnsureLeaseOpts = optionsCheck({ renewMinutes: Z.optional(Z.unknown()) }, "ensureLease()'s only option is `renewMinutes`, how many minutes before the lease ends to ask for a proof anyway: check its spelling, and leave out any other.", eventHint('ensureLease', 'tryEnsureLease'))

/** What `demandConsistentWith()`'s options may hold: `leaseBound`, a boolean, and nothing else. */
const checkDemandOpts = optionsCheck({ leaseBound: Z.optional(Z.boolean()) }, "demandConsistentWith()'s only option is `leaseBound`, true when the thing must also have a lease in hand to stand: check its spelling, and leave out any other.")

/** What `demandConsistentWith()` judges, checked: a thing carrying a `vault_tok`, and, where it carries them, a scope's labels and epochs of the right types. */
const StampedShape = Z.looseObject({
  vault_tok:   Z.string(),
  applabel:    Z.optional(Z.string()),
  user_id:     Z.optional(Z.string()),
  vaultlabel:  Z.optional(Z.string()),
  vault_epoch: Z.optional(Z.number()),
  gate_epoch:  Z.optional(Z.number()),
})

/** `thing`, as `demandConsistentWith()` was handed it, once it carries a `vault_tok`: 'bad_option' for anything else, quoting none of it. */
const checkedStamped = (thing: unknown): Stamped => {
  if (StampedShape.safeParse(thing).success) { return thing as Stamped }
  throw new VaultError('bad_option', "demandConsistentWith() takes something the vault handed out -- a box, a lease, a listing's entry -- or a stamp: an object carrying the vault_tok it was made under, and its epochs as numbers.")
}

/** What `putBox()` is handed to name the box it seals: its boxlabel, and its sidecar, left out to keep the one it has. */
export type PutBoxProps = { boxlabel: string, sidecar?: Sidecar | undefined }

/** What `putBox()`'s props may hold: a boxlabel, a sidecar, and nothing else. */
const checkPutBoxProps = optionsCheck({ boxlabel: Z.unknown(), sidecar: Z.optional(Z.unknown()) }, "putBox()'s props are `boxlabel`, and `sidecar`, the box's own visible data (it is authenticated but never encrypted): check their spelling, and leave out any other. A note is kept in the sidecar: { boxlabel, sidecar: { note } }.")

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

/** Refuse 'bad_option' for a proof of a change to the ways in, `call`'s, that is not the vault's standing passphrase as text: a passkey's answer among it. */
const checkStandingPassphrase = (given: unknown, call: 'putWayin' | 'delWayin'): void => {
  if (typeof given !== 'string') {
    throw new VaultError('bad_option', `${call} takes the vault's passphrase as it stands, as the text the user typed: only the passphrase proves a change to the vault's ways in, never a passkey.`)
  }
}

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
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
