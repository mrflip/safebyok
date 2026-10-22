import * as Z from 'zod/mini'
import { type Capacity, type Clock, type VaultScope, BoxSummary, type DamagedBox, type ListedSummary, type Stamp, type Stamped, type PasskeyWayinSummary, type PassphraseWayinSummary, type PasskeyAnswer, type WayinSummary, Whisper, Sidecar, type GatedVaultProps, type GatelessVaultProps, type VaultProps, isGated, DeviceMark, MinuteMillis, FarFuture, FarPast } from './types'
import { Box, type BoxRecord, checkedSidecar, heldListing, planSeal, sealPlanned, whisperBytesOf } from './box'
import * as Names from './names'
import { optionsCheck } from './options'
import { VaultError, isVaultError, type RefusalKind } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { makeVaultKey, randomId } from './crypto'
import { Wayin, frozenRecord, type PasskeyWayin, type PassphraseWayin, type VaultKeyPair } from './wayin'
import { Proof, PassphraseProof, PasskeyProof, checkSaltShape } from './proof'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import { byCodeUnit, jsonBytes, type BoxExpectation } from './vault-db'
import { type VaultLogger, asError } from './logger'
import * as RefusalPolicy from './refusal-policy'
import type { GuardedStrengthChecker, PassphraseVerdict } from './passphrase-strength'
import { type BadNewsHandler, type MakeVaultOpts, parseMakeVaultOpts, parseRenewMinutes, parseStaleMinutes, StoredBytesPerWhisperByte, BoxFixedBytes } from './vault-opts'
import { reportToPlatform } from './report-error'
import { type DeviceDB, deviceTroubleAsConditions } from './device-db'
import type { KeyDeriver } from './key-deriver'
import { Lease, type LeaseView } from './lease'
import { Ask, type AskWhy, type GetProof, type RaisedAsk, raiseAsk } from './ask'

// == [Public types]: VaultState, VaultSnapshot

/** Where the vault stands, as a UI branches on it.
 *  * `opening`: no hello has read storage yet. Also after a read refused `rolled_back`, until the
 *    host accepts the older copy (see {@link Vault}); the snapshot's `trouble` says so.
 *  * `absent`: never created. The first passphrase proof, through `getProof` or `unlock()`,
 *    creates it.
 *  * `locked`: exists; box summaries are readable, whispers not.
 *  * `unlocked`: whispers are readable until `askPassphraseAt` or `lock()`.
 */
export type VaultState = 'opening' | 'absent' | 'locked' | 'unlocked'

/** The vault's fields, frozen in one plain object for `useSyncExternalStore`, each as the vault shows it.
 * It is replaced whole when any field changes, and is otherwise the same object. It holds nothing
 * an offline guess at a passphrase could start from: ways in show as summaries, never a
 * passphrase's salt or a wrapped vaultKey. A passkey's PRF salt does show, as its authenticator
 * is asked with it. Box summaries show even while locked. Each field about the stored vault is
 * null until a read finds one.
 */
export type VaultSnapshot = Readonly<{
  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  applabel:        string
  /** The signed-in user the vault is found under, as `Vault.make` was given it. Fixed for the Vault object's life. */
  user_id:         string
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  vaultlabel:      string
  /** The stored vault's token, minted when it was made. */
  vault_tok:       string | null
  /** When the stored vault was made, in epoch milliseconds. */
  registered_at:   number | null
  /** Up by one on every change to the ways in, which sends every other device back to `locked`. */
  gate_epoch:      number | null
  /** The vault's passphrase, as its {@link PassphraseWayinSummary}: when it was set, and from which device. */
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
   * Bad news is a refusal of the `bad_news` family: `damaged_vault` or `rolled_back`, say, or a box
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
  /** False while the vault's last read of storage failed, so what it shows may be behind storage; true otherwise.
   * The vault keeps working either way: every write still lands only where storage stands as this
   * device last read it.
   */
  syncing:         boolean
}>
// --

/** What `#vaultProps` holds before storage's first answer: distinct from null, which says the vault was never created. */
const UnreadVaultProps = Symbol('UnreadVaultProps')

/** The ways in of vault props, as the vault holds them: the passphrase's, and the passkey's or null. */
type HeldWayins = Readonly<{ passphrase: PassphraseWayin, passkey: PasskeyWayin | null }>

/** One user's vault of boxes, for as long as the app holds it: every read and write of a whisper goes through here.
 * `Vault.make` returns one, touching nothing. Its fields (`state`, `boxes`, `passkey`,
 * `capacity`, `trouble` and the rest) are live and read-only. A UI renders from `getSnapshot()`,
 * the same fields frozen in one object, and re-renders on `subscribe()`. Every call that reads
 * storage awaits a first {@link Vault.hello}, starting one if none has.
 *
 * A call that needs a whisper goes through {@link Vault.ensureLease}: a vault that is not unlocked
 * asks the host's `getProof` for a proof, one prompt at a time. Nothing prompts on open.
 *
 * Every call holds to these, unless its own doc says otherwise:
 *  * A malformed argument or option is refused 'bad_option' ('bad_label' for a name) before
 *    anything is read, asked for or written. Its message names the field, never the value.
 *  * A call refuses with what storage refuses, as it came.
 *  * After `close()`, every call but `close()`, `subscribe()`, `getSnapshot()` and
 *    `checkPassphrase()` refuses 'vault_closed'.
 *  * A throw that is no refusal (a bug, in safebyok or in a function handed to it) is refused
 *    'unexpected_error', what was thrown its cause. It is never logged.
 *
 * This device keeps a mark of the newest vault props it has seen (its device mark, in the
 * deviceDB: `lock()` leaves it, `del()` erases it). A read of vault props older than the ones a
 * Vault object holds is ignored: it takes nothing from them, refuses nothing, and keeps the newer.
 * Any other read older than the mark, at a lower gate epoch, refuses 'rolled_back', taking nothing
 * from them and writing nothing: older vault props could bring back a way in that was removed. It
 * locks the vault, as 'identity_revoked' from storage does, and leaves the Vault object holding no
 * vault props, its state `opening`. A host that restored storage from an older copy on purpose
 * accepts it on this device by erasing the mark (`valOf(await deviceDB.delMark(scope))`) and
 * making a new Vault object. A Vault object that goes on refusing changes to the ways in as
 * 'stale_write' after a restore, or after its device mark could not be written, is to be closed,
 * and a new one made.
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
 * `onBadNews` once, whichever form met it. `Vault.make`, `subscribe()`, `checkPassphrase()` and
 * `useWhisper()` come in the throwing form alone.
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
  // == [Vault: fields]: applabel, user_id, vaultlabel, vault_tok, registered_at, gate_epoch, passphrase, passkey, state, boxes, capacity, askPassphraseAt, trouble, syncing, snapshot, getSnapshot, subscribe, leaseMillis, logger, keyDeriver, now

  // Each field reads the snapshot `#replaceSnapshot()` last published, so the fields and the snapshot always
  // agree. A getter with no setter: a host cannot write over one, and the vault never reads one back.
  // Its boxes, ways in and lease read back only what is fixed for the handle's life -- its scope, its
  // key deriver, its lease length -- and the time; each holds the token and epoch of the vault props it is bound to.

  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  get applabel(): string { return this.#snapshot.applabel }
  /** The signed-in user the vault is found under. Fixed for the Vault object's life. */
  get user_id(): string { return this.#snapshot.user_id }
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  get vaultlabel(): string { return this.#snapshot.vaultlabel }
  /** The stored vault's token; null until a read finds a vault. */
  get vault_tok(): string | null { return this.#snapshot.vault_tok }
  /** When the stored vault was made, in epoch milliseconds; null until a read finds a vault. */
  get registered_at(): number | null { return this.#snapshot.registered_at }
  /** Up by one on every change to the ways in, which sends every other device back to `locked`; null until a read finds a vault. */
  get gate_epoch(): number | null { return this.#snapshot.gate_epoch }
  /** The vault's passphrase, as its summary; null until a read finds a vault. See {@link VaultSnapshot}. */
  get passphrase(): PassphraseWayinSummary | null { return this.#snapshot.passphrase }
  /** The vault's passkey, as its summary; null while it has none. See {@link VaultSnapshot}. */
  get passkey(): PasskeyWayinSummary | null { return this.#snapshot.passkey }
  /** Where the vault stands: see {@link VaultState}. */
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
  /** How long a lease lasts on this device: the `leaseHours` the vault was made with, in whole milliseconds.
   * A vault that stays unlocked until `lock()` (`Infinity` hours) reads `ForeverMillis`. Fixed for
   * the Vault object's life.
   *
   * @example vault.leaseMillis >= ForeverMillis - MinuteMillis ? 'until you lock it' : `for ${String(Math.round(vault.leaseMillis / MinuteMillis))} minutes`
   */
  get leaseMillis(): number { return this.#leaseMillis }
  /** The logger the vault was made with, which its boxes and ways in log through. */
  get logger(): VaultLogger { return this.#logger }
  /** The key deriver the vault was made with, which its ways in derive through. */
  get keyDeriver(): KeyDeriver { return this.#keyDeriver }
  /**
   * The time it is by the clock the vault was made with, in whole epoch milliseconds (a reading's
   * fraction rounded down): what the vault's boxes, ways in and lease are stamped and judged by.
   *
   * @example lease.endsBy(vault.now())   // true once the lease has ended
   */
  now(): number { return this.#clockNow() }
  // --

  // == [Vault: opening]: hello, refresh, ensureLease

  /** Read storage and settle the vault as `absent`, `locked` or `unlocked`, resolving the vault.
   * Never prompts. Optional: every call that reads storage awaits a first hello. Call it again to
   * refresh: within `opts.staleMinutes` of the last read it re-settles without reading, unless the
   * last read failed or found storage it could not trust. A hello made while a read is under way
   * shares that read, whatever its `staleMinutes`, and starts none of its own. Reads
   * `VaultDB.getVault` and {@link DeviceDB.getLease}; the first hello also starts the vault's watch,
   * `VaultDB.subscribe`.
   *
   * Only the first hello takes up this device's lease. A later one takes none up, so another tab's
   * unlock shows here at the next {@link Vault.ensureLease}; it drops the lease in hand, erasing
   * nothing, once this device's store no longer holds it (another tab locked), or the vault's ways
   * in changed, or the vault was deleted or made anew. A read served before a write of this
   * device's own, and answered after it, is ignored: nothing is taken from it, and nothing refused.
   *
   * A refused hello applies no partial read: the vault stands as its last read left it, `locked`
   * when the lease could not be taken up after it, and `opening` after 'rolled_back' (see
   * {@link Vault}). Stored vault props it cannot use refuse with 'damaged_vault'
   * (`delDamagedVault` clears them), 'newer_format' or 'rolled_back'. A box or way in stored
   * damaged refuses nothing: it lists damaged, and is told as bad news. A strength checker whose
   * `load` fails refuses the hello 'unexpected_error', and no lease is taken up.
   *
   * @example await vault.hello()   // vault.state: 'absent' | 'locked' | 'unlocked'
   * @example
   *   try { await vault.hello() } catch (err) {
   *     if (isVaultError(err, 'damaged_vault') && userConfirmedStartingOver()) { await delDamagedVault(opts) }
   *   }
   * @example document.addEventListener('visibilitychange', () => { if (! document.hidden) { void vault.tryHello() } })
   * @example window.addEventListener('focus', () => vault.tryHello())   // wrapped: vault.hello itself would refuse the event as its options
   * @example await vault.hello({ staleMinutes: 0 })   // read now, whatever was read a moment ago
   */
  async hello(given?: { staleMinutes?: number | undefined }): Promise<Vault> { return valOf(await this.tryHello(given)) }

  /** Read storage and settle the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.hello}. */
  async tryHello(given?: { staleMinutes?: number | undefined }): Promise<Outcome<Vault>> {
    try {
      this.#checkOpen()
      const helloOpts = checkHelloOpts(given)
      const staleMillis = helloOpts?.staleMinutes === undefined ? this.#staleMillis : parseStaleMinutes(helloOpts.staleMinutes, 'hello')
      await this.#helloWithin(staleMillis)
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
      this.#checkOpen()
      await this.#helloWithin(0)
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
   * Refuses 'vault_locked' when the user declines, when there is no `getProof`, when a `lock()`,
   * `close()` or `del()` lands while the prompt is up, or when the lease is gone by the time the
   * answer comes. A wrong passphrase never reaches here: the dialog meets it, through the ask's
   * `attempt`.
   *
   * @example await vault.ensureLease()   // unlocked, or refused 'vault_locked'
   * @example <button onClick={() => vault.tryEnsureLease()}>Unlock</button>
   * @example await vault.ensureLease({ renewMinutes: 60 })   // ask now if the lease ends within the hour
   */
  async ensureLease(given?: { renewMinutes?: number | undefined }): Promise<Vault> { return valOf(await this.tryEnsureLease(given)) }

  /** Have the vault unlocked, as an {@link Outcome}: the non-throwing form of {@link Vault.ensureLease}. */
  async tryEnsureLease(given?: { renewMinutes?: number | undefined }): Promise<Outcome<Vault>> {
    try {
      this.#checkOpen()
      const leaseOpts = checkEnsureLeaseOpts(given)
      await this.#ensureUnlocked(parseRenewMinutes(leaseOpts?.renewMinutes))
      this.#demandLease('ensureLease')
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: demand]: stamp, demandConsistentWith

  /** The vault's {@link Stamp}, frozen: its scope, and the `vault_tok`, `vault_epoch` and `gate_epoch` of the vault it holds now; null while it holds none.
   * Each thing the vault hands out was made under the stamp it held then, and
   * {@link Vault.demandConsistentWith} compares the two.
   *
   * @example vault.stamp?.gate_epoch   // up by one on every change to the ways in
   */
  get stamp(): Stamp | null {
    const standing = this.#vaultProps
    if (standing === null || standing === UnreadVaultProps) { return null }
    return stampOf(this.#scope, standing)
  }

  /** Refuse unless `thing` is consistent with the vault as it stands now: what each call asks before and after each wait.
   * `thing` is something the vault handed out (a box, a lease, a listing's entry) or a
   * {@link Stamp}. Each field it carries is compared with the vault's own {@link Vault.stamp}, in
   * this order, and the first that disagrees refuses. The vault holds no vault: 'vault_gone'.
   * Another scope or `vault_tok`, the vault deleted and made anew: 'vault_remade'. Another
   * `gate_epoch`, or a `vault_epoch` past the vault's: 'gate_moved'. With `opts.leaseBound`, the
   * vault must also hold a lease that has not ended: 'vault_locked'; one found ended is dropped,
   * as its expiry drops it. After `close()` it refuses 'vault_closed'.
   *
   * It is synchronous, reads nothing, and changes nothing but an ended lease. The logger hears
   * each refusal's kind, never the thing's fields. A thing missing its `vault_tok` is 'bad_option'.
   *
   * @example vault.demandConsistentWith(box)                              // the vault half: 'vault_gone' or 'vault_remade' once it moved on
   * @example vault.demandConsistentWith(box, { leaseBound: true })        // and 'vault_locked' once a lock lands
   * @example vault.demandConsistentWith({ ...stamp, gate_epoch: 0 })      // throws 'gate_moved' for a vault with a way in
   */
  demandConsistentWith(thing: Stamped, opts?: { leaseBound?: boolean | undefined }): void { valOf(this.tryDemandConsistentWith(thing, opts)) }

  /** Refuse unless `thing` is consistent with the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.demandConsistentWith}. */
  tryDemandConsistentWith(thing: Stamped, opts?: { leaseBound?: boolean | undefined }): Outcome<void> {
    try {
      const demandOpts = checkDemandOpts(opts)
      this.#demand(checkedStamped(thing), { leaseBound: demandOpts?.leaseBound === true, call: 'demandConsistentWith' })
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
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
   * On an `absent` vault, a passphrase creates the vault, with itself as the way in, through
   * `VaultDB.ensureVault` and a first write of its gate, `VaultDB.putVaultProps`. It must pass {@link Vault.checkPassphrase} first, or the unlock
   * refuses 'weak_passphrase' and creates nothing. Creating costs a second key derivation. A vault
   * that stands never refuses its passphrase as weak.
   *
   * A wrong passphrase refuses 'wrong_passphrase', and changes nothing. The vault learns it from the
   * way in failing to decrypt, never from a comparison, so a way in altered in storage refuses the
   * same way; the message names both. A passkey's answer refuses 'wrong_passkey' when it is another
   * credential's or does not open the vault, 'absent_wayin' when the vault has no passkey, and
   * 'absent_vault' on an `absent` vault. A way in stored damaged refuses 'damaged_wayin', untried.
   *
   * A first unlock can lose a race to another device creating the vault. When this passphrase does
   * not open that device's vault, it refuses 'created_elsewhere': nothing was created here, and the
   * vault now shows `locked`. A vault deleted, made anew, or with its ways in changed while the
   * unlock is under way refuses as {@link Vault.demandConsistentWith} finds it ('vault_gone',
   * 'vault_remade' or 'gate_moved'), and no lease is taken up; a vault this call was creating stays
   * created, locked. A `lock()` landing meanwhile does not stop the unlock.
   *
   * @example await vault.unlock(passphrase)
   * @example await vault.unlock(passkey)  // the answer from askPasskey(vault.getSnapshot().passkey)
   * @example
   *   try { await vault.unlock(passphrase) } catch (err) {
   *     if (isVaultError(err, 'created_elsewhere')) { showAdvice(err.message) }  // the vault now shows `locked`: ask again
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
   * A call under way ends by its own rule. A `getBox()`, `getWhisper()` or `useWhisper()` refuses
   * 'vault_locked' once storage answers, unless an unlock has put a lease back in hand meanwhile. A
   * `putBox()` refuses so when the lock lands before it seals, and lands when it comes during the
   * seal or the write; a `delBox()` lands. An ask's `attempt` under way takes nothing up. An
   * `unlock()` or `putWayin()` under way is not stopped, and leaves the vault unlocked.
   *
   * Refuses 'storage_unavailable' ('storage_blocked' when the browser withholds the store) when the
   * device store cannot erase the lease; the vault is locked all the same.
   *
   * The vault also locks of itself: when the lease ends, at `del()`, for storage it cannot trust,
   * and at a read that finds its ways in changed, the vault gone, or the lease gone from this
   * device's store.
   *
   * @example document.addEventListener('visibilitychange', () => { if (document.hidden) { void vault.lock() } })
   */
  async lock(): Promise<void> { valOf(await this.tryLock()) }

  /** Forget the unlock, as an {@link Outcome}: the non-throwing form of {@link Vault.lock}. */
  async tryLock(): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
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
   * a change; 'absent_vault' before the vault is made; and 'stale_write' when another device
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
      this.#checkOpen()
      const proof = standingPassphraseOf(this, passphrase, 'putWayin')
      const putting = await newProofOf(this, newProof)
      const stored = await this.#reviseWayins(proof, {
        call:   'putWayin',
        // A new passphrase takes the passkey with it: a passkey is matched to the passphrase that
        // proved it, and the user makes a new one under the new passphrase. A new passkey leaves
        // the passphrase as it stood.
        revise: async (standing, proven, deviceId) => {
          const wayin = await Wayin.seal(this, standing.vault_tok, putting, deviceId, proven.transientKey)
          return wayin.wayinkind === 'passphrase' ? { passphrase: wayin.record, passkey: null } : { passphrase: standing.passphrase, passkey: wayin.record }
        },
      })
      const { passphrase: storedPassphrase, passkey: storedPasskey } = this.#wayinsOf(stored)
      return good(storedPasskey === null || putting.kind === 'passphrase' ? storedPassphrase.toJSON() : storedPasskey.toJSON())
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
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: boxes]: putBox, getBox, getWhisper, decryptWhisper, useWhisper, delBox

  /** Write `whisper` into the box `boxlabel`, creating or replacing it.
   * Once it resolves, the box holds this whisper, and the snapshot lists its new revision. It goes
   * through {@link Vault.ensureLease}, which may prompt, only once the whisper, boxlabel and sidecar
   * have passed their checks: a store that cannot land never prompts. It is one write, with
   * `VaultDB.putBox`, over the revision of the box this device last read.
   *
   * Refuses 'whisper_too_large' when the whisper's JSON and the sidecar's are together over
   * `maxWhisperBytes`; a sidecar kept from the box counts as one given does. Refuses 'vault_full'
   * for a new boxlabel when the vault holds `maxBoxes`, or has no room left in what storage holds of
   * one vault, as the listing in hand counts them: one a moment stale may refuse, and a hello
   * cures it. Replacing a box is never refused so by the vault's own limits, though storage may
   * refuse it 'vault_full' by its own. Storage refuses 'box_too_large' for a box heavier than one
   * record holds.
   *
   * Refuses 'stale_write' when another call, here or on another device, wrote, created or deleted
   * this box between this call's read of it and its write: nothing was written, and the refusal's
   * `meta.box_stored` is what stands. Call again if this whisper should still replace it: the call
   * reads the box afresh. A vault deleted or made anew elsewhere refuses 'stale_write' too, writing
   * nothing. A lock landing while the box is read refuses 'vault_locked', writing nothing; one
   * landing during the seal or the write lets it land. Once the write lands, the listing takes the
   * box as storage stored it; a vault made anew meanwhile refuses 'vault_remade' after the write
   * landed, and calling again writes the same whisper over itself, harmlessly.
   *
   * Every store stamps `written_at`, the same whisper stored again included; `registered_at` keeps
   * the box's first store. A box that will not read or open is overwritten as new, carrying over
   * neither its sidecar nor its `registered_at`. One listed damaged with no revision refuses
   * 'damaged_box', writing nothing: {@link Vault.delBox} it first. A boxlabel the vault's check
   * refuses is refused 'bad_label', even where a box stands under it: the check gates writes alone.
   *
   * @param storeOpts - `sidecar`, the box's {@link Sidecar}: your app's own JSON object beside the
   *   whisper, shown in the snapshot while locked, and never interpreted by the vault. Anything but
   *   a JSON object, a bare string, array or null among them, refuses 'bad_option'. It is stored in
   *   the clear, readable by anyone who can read the database: never put secret material in it. It
   *   is authenticated, so a sidecar altered in storage makes the box refuse to open. Left out, the
   *   box keeps the sidecar it has, and a new box gets `{}`; `{}` empties it.
   *
   * @example await vault.putBox('anthropic_api_key', 'sk-ant-...', { sidecar: { note: 'work account' } })
   * @example await vault.putBox('anthropic_api_key', 'sk-ant-...')              // keeps the sidecar it has
   * @example await vault.putBox('anthropic_api_key', 'sk-ant-...', { sidecar: {} }) // and empties it
   */
  async putBox(boxlabel: string, whisper: Whisper, storeOpts?: { sidecar?: Sidecar | undefined }): Promise<void> { valOf(await this.tryPutBox(boxlabel, whisper, storeOpts)) }

  /** Write `whisper` into the box `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.putBox}. */
  async tryPutBox(boxlabel: string, whisper: Whisper, storeOpts?: { sidecar?: Sidecar | undefined }): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
      // The host's check gates every name written; reads and deletes hold a name to the floor alone.
      const label = Names.check(this.#rules, 'boxlabel', boxlabel)
      const givenSidecar = sidecarOf(storeOpts)
      // The refusal never quotes its input: a whisper stays out of error messages.
      const whisperBytes = whisperBytesOf(whisper)
      this.#checkWhisperFits(whisperBytes, givenSidecar ?? {})
      // Checked before the user is asked for anything: a call that cannot land never prompts.
      await this.#ensureUnlocked(0)
      const lease = this.#demandLease('putBox')
      const standing = await this.#getBoxOrDamaged(label, lease)
      // A lock landing while storage was read refuses, writing nothing; one during the seal or the write lands.
      this.#demand(lease, { leaseBound: true, call: 'putBox' })
      // A store is one write, over a revision storage arbitrates. A box listed damaged naming none
      // could be cleared only by a delete before it, a second call another device's write could
      // fall between and be lost: the user deletes it, then stores.
      if (standing === 'damaged' && this.#isListedDamaged(label) && this.#listedRevisionOf(label) === null) { throw damagedBeyondNaming() }
      // A damaged box is overwritten as a fresh store: nothing in it can be carried forward.
      const prev = standing === 'damaged' ? null : standing
      this.#checkRoomFor(label, prev)
      // Lands only in the vault this whisper is sealed for, over the revision just read -- for a
      // damaged box, the one the listing names -- : a vault reborn elsewhere, or a box written
      // meanwhile by another device, refuses it.
      const overRevision = standing === 'damaged' ? this.#listedRevisionOf(label) : prev?.revision_tok ?? null
      // A damaged box the listing does not show yet is written as over none, which storage refuses
      // while it stands; the next hello lists it, with its revision for the next store.
      // The sidecar a store keeps from the box it replaces, when none is given, counts toward the
      // limit too: known once the plan has vouched for that box, and weighed before any key is made.
      const plan = await planSeal(lease, { boxlabel: label, whisperBytes, sidecar: givenSidecar, over: prev })
      this.#checkWhisperFits(plan.whisperBytes, plan.sidecar)
      const box = await sealPlanned(this, lease, plan)
      const stored = await this.#writeOver(box, { vault_tok: box.vault_tok, revision_tok: overRevision })
      this.#takeStoredBox(stored, lease)
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  /** The {@link Box} under `boxlabel`, still sealed: its visible fields, sidecar among them, and its ciphered whisper.
   * {@link Vault.decryptWhisper} opens the whisper. The call goes through {@link Vault.ensureLease},
   * which may prompt, only once the listing in hand shows a box under `boxlabel`; otherwise it
   * refuses at once. That listing is as fresh as `staleMinutes` keeps it. Reads `VaultDB.getBox`.
   *
   * Refuses 'absent_box' when there is none, and 'damaged_box' when its record fails its checks. It
   * does not open the whisper, so a whisper that will not open shows only at `decryptWhisper()` or
   * `getWhisper()`. A lock or the lease ending while storage is read refuses 'vault_locked', handing
   * nothing back, unless an unlock has put a lease back in hand meanwhile; the vault deleted or made
   * anew meanwhile refuses 'vault_gone' or 'vault_remade', and a `close()` 'vault_closed'. The boxlabel is held to the floor alone, 'bad_label' below it:
   * the vault's boxlabel check gates only writes, so a name it refuses reads as any other.
   *
   * @example const box = await vault.getBox('anthropic_api_key')
   */
  async getBox(boxlabel: string): Promise<Box> { return valOf(await this.tryGetBox(boxlabel)) }

  /** The box under `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.getBox}. */
  async tryGetBox(boxlabel: string): Promise<Outcome<Box>> {
    try {
      const { box } = await this.#getBoxUnlocked(boxlabel, 'getBox')
      return good(box)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The whisper in `boxlabel`, opened under the vault's key.
   * Asks, reads and refuses as {@link Vault.getBox} does. It also refuses 'damaged_box' for a box
   * that will not open under the vault's key: {@link Vault.delBox} it, or {@link Vault.putBox} over
   * it.
   */
  async getWhisper(boxlabel: string): Promise<Whisper> { return valOf(await this.tryGetWhisper(boxlabel)) }

  /** The whisper in `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.getWhisper}. */
  async tryGetWhisper(boxlabel: string): Promise<Outcome<Whisper>> {
    try {
      const { box, lease } = await this.#getBoxUnlocked(boxlabel, 'getWhisper')
      const whisper = await box.open(lease)
      // A lock landing while the box opened refuses, handing nothing back.
      this.#demand(box, { leaseBound: true, call: 'getWhisper' })
      return good(whisper)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The whisper `box` holds, opened under the lease in hand: a {@link Box} from {@link Vault.getBox}, or its stored record.
   * Reads nothing, prompts nobody and awaits no hello: call {@link Vault.ensureLease} first. A
   * record lies under the vault props the lease in hand opens; a box, under the ones it was read or
   * sealed under. Refuses 'vault_locked' when no lease is in hand, before it looks at what it was
   * handed, when a lock lands while the box opens, or for a box of another vault than the lease
   * opens (one deleted and made anew since). Refuses 'bad_record' for a record this package does not
   * write, before it is opened, and 'damaged_box' for a box that will not open under the vault's key.
   *
   * @example const whisper = await vault.decryptWhisper(box)
   */
  async decryptWhisper(box: Box | BoxRecord): Promise<Whisper> { return valOf(await this.tryDecryptWhisper(box)) }

  /** The whisper `box` holds, as an {@link Outcome}: the non-throwing form of {@link Vault.decryptWhisper}. */
  async tryDecryptWhisper(box: Box | BoxRecord): Promise<Outcome<Whisper>> {
    try {
      this.#checkOpen()
      const lease = this.#demandLease('decryptWhisper')
      // Made anew for this vault, its record checked once, by Box.make: a box opens under this
      // vault's scope, whichever it came from, and under the vault props it was read under; a
      // record, under those the lease opens.
      const held = box instanceof Box ? Box.make(this, box.record, box.vault_tok) : Box.make(this, box, lease.vault_tok)
      const whisper = valOf(await held.tryOpen(lease))
      // A lock landing while the box opened refuses, handing nothing back.
      this.#demand(held, { leaseBound: true, call: 'decryptWhisper' })
      return good(whisper)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Hand the whisper in `boxlabel` to `callback`, resolving its result: the shape that discourages parking a secret in state.
   * Asks, reads and refuses as {@link Vault.getWhisper} does. A throw from `callback` rejects as it
   * came, and is never told as bad news.
   *
   * @example await vault.useWhisper('anthropic_api_key', (whisper) => callAnthropic(whisper))
   */
  async useWhisper<ResultT>(boxlabel: string, callback: (whisper: Whisper) => ResultT | Promise<ResultT>): Promise<ResultT> {
    if (typeof callback !== 'function') { throw new VaultError('bad_option', 'use needs a callback function to hand the whisper to.') }
    // The callback's own throw is the host's, and is never told as the vault's bad news.
    const whisper = valOf(await this.tryGetWhisper(boxlabel))
    return await callback(whisper)
  }


  /** Remove the box `boxlabel`, whatever revision of it stands: a damaged one too, as deleting is its remedy.
   * Once it resolves, storage holds no box under `boxlabel`. It asks for a proof, and refuses
   * 'absent_box' or 'bad_label', as {@link Vault.getBox} does; 'absent_box' too when another device
   * or tab deleted it first. Writes with `VaultDB.delBox`.
   *
   * The delete lands only in the vault this device last read. If that vault was deleted, or made
   * anew, elsewhere, nothing is removed, and the call refuses 'stale_write': `hello()` to see what
   * stands. Within that vault the delete wins: a revision another device or tab wrote meanwhile
   * is deleted all the same, and the logger warns. Deleted is gone: a later `putBox()` from a device
   * that never saw the delete is refused as stale. Once it lands, the listing drops the box; a lock
   * landing meanwhile lets it land.
   */
  async delBox(boxlabel: string): Promise<void> { valOf(await this.tryDelBox(boxlabel)) }

  /** Remove the box `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.delBox}. */
  async tryDelBox(boxlabel: string): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
      const label = Names.checkFloor('boxlabel', boxlabel)
      // Checked before the user is asked for anything: a call that cannot land never prompts.
      await this.#ensureUnlocked(0, () => { this.#checkListed(label) })
      const lease = this.#demandLease('delBox')
      // Lands only in the vault this device holds a lease for, whatever revision of the box stands:
      // a vault deleted and made anew elsewhere refuses it. The revision the listing shows only
      // lets storage say whether it removed that one or another.
      const expected = { vault_tok: lease.vault_tok, revision_tok: this.#listedRevisionOf(label) }
      const showedDamaged = this.#isListedDamaged(label)
      const { outcome } = await this.#vaultDB.delBox(this.#scope, label, expected)
      // Storage arbitrates: nothing stood there to delete.
      if (outcome === 'absent') { throw absentBox() }
      if (outcome === 'deleted_other') {
        if (showedDamaged) {
          this.#logger.warn("The box this device showed was a damaged one, and the box deleted was not that record: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox', damaged: true })
        } else {
          this.#logger.warn("The box deleted was not the revision this device showed: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox' })
        }
      }
      this.#takeBoxDeletion(label, lease)
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: deleting and closing]: del, close

  /** Delete the vault: every record it has, in storage and on this device, as the vault half of deleting an account.
   * Storage keeps a tombstone of the scope, which carries the vault's counter into any vault made there later. It needs no unlock: an authenticated owner can always delete their own rows
   * server-side, so requiring one would only look like protection. It locks as `lock()` does, and
   * erases this device's mark. Writes with `VaultDB.delVault` and {@link DeviceDB.delMark}. Once it
   * resolves, the vault shows `absent`.
   *
   * It deletes only the vault this Vault object last read, at the ways in it last read. If that one
   * was deleted, made anew, or had its ways in changed elsewhere, storage keeps what stands there
   * now, and the call refuses 'stale_write', the vault locked all the same: `hello()`, and a second
   * `del()` deletes the vault the snapshot then shows. A Vault object that has seen no vault reads
   * storage first, and deletes whatever stands: "delete my vault" never reports success over a
   * vault still standing.
   */
  async del(): Promise<void> { valOf(await this.tryDel()) }

  /** Delete the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.del}. */
  async tryDel(): Promise<Outcome<void>> {
    try {
      await this.#ensureBorn()
      // A Vault object that holds no vault -- it has seen none, or forgot one refused as an older
      // copy -- reads storage first: "delete my vault" must not report success over one standing.
      if (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps) { await this.#helloWithin(0) }
      const doomed = this.#vaultProps
      valOf(await this.#lockNow())
      if (doomed !== null && doomed !== UnreadVaultProps) {
        await this.#vaultDB.delVault(this.#scope, { vault_tok: doomed.vault_tok, gate_epoch: doomed.gate_epoch })
        this.#takeDeletion(doomed)
      }
      // This device forgets the vault it had seen, too: one made later under this scope is another.
      valOf(await this.#deviceDB.delMark(this.#scope))
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  /** Release subscriptions, drop the vaultKey from memory, and refuse further calls.
   * It is not a lock, and erases nothing stored: this device's lease stays, and the next Vault made
   * for this scope takes it up. An `unlock()` still under way takes nothing up, and refuses
   * 'vault_closed'; a lease it already wrote stays. A `getWhisper()` or `useWhisper()` under way
   * hands back nothing, and refuses 'vault_closed'. A prompt up for a proof ends as a `lock()` ends
   * it. A second `close()` does nothing.
   */
  close(): void { valOf(this.tryClose()) }

  /** Release subscriptions and refuse further calls, as an {@link Outcome}: the non-throwing form of {@link Vault.close}.
   * Synchronous, and never a refusal.
   */
  tryClose(): Outcome<void> {
    // A second close does nothing: an adapter's unsubscribe may count down a watch it shares.
    if (this.#closed) { return good(undefined) }
    this.#closed = true
    this.#landLock()
    // Not a lock of the vault: nothing this device remembers is erased, and a take-up under way
    // takes nothing up.
    this.#standDownTakeUp()
    this.#dropLease()
    this.#unsubscribeDB?.()
    this.#listeners.clear()
    return good(undefined)
  }
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
  readonly #strengthChecker: GuardedStrengthChecker
  readonly #whisperByteLimit: number
  readonly #boxLimit: number
  readonly #vaultByteLimit: number

  /** Make a Vault object for one user's vault, in state `opening`: its options checked, and nothing else done.
   * It reads nothing, starts no timer or watch, and prompts nobody until a call asks. So it may be
   * used at once, and making one the app then drops costs nothing.
   *
   * It throws its misuse at once, synchronously, as there is no vault yet to return it from.
   * 'bad_label' is for a label or `userId` that fails its check (`validators`). 'bad_option' is for
   * any other option: one it does not take (a misspelling, or a retired name, which it names), a
   * `vaultDB` or `deviceDB` short of a verb, or a `vaultDB` that is not an instance of the `VaultDB`
   * class. 'insecure_context', checked first, is for a page that is not a secure context (plain http,
   * anywhere but localhost), where the browser withholds WebCrypto.
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

  /** The Vault object {@link Vault.make} makes: its options checked, its first snapshot `opening`, and nothing else done. */
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

  /** The host's clock, read now, rounded down to whole milliseconds: every time a record keeps is an integer. */
  #clockNow(): number { return Math.floor(this.#clock.now()) }
  // --

  // == [State and snapshot]: vaultProps, lease, expiry, unlockStands, listeners, snapshot, picture, replaceSnapshot

  #vaultProps: GatedVaultProps | null | typeof UnreadVaultProps = UnreadVaultProps
  // This device's mark for the vault props in hand, set with them, so the two always name one vault.
  #deviceMark: DeviceMark | null = null
  // The vault this handle last drafted, and the device_id its first way in carries: whichever of
  // this handle's reads starts the vault's mark -- the unlock making it, or a refresh its write
  // set off -- starts it under that id.
  #drafted: { vault_tok: string, device_id: string } | null = null
  #boxes: readonly (BoxSummary | DamagedBox)[] = []
  // The lease this handle holds, opened: the one place it keeps the vaultKey. Dropping it locks.
  #lease: Lease | null = null
  // When the lease in hand was granted or taken up, by the vault's clock: a read of this device's
  // store begun before then is older than it, and cannot say it was revoked.
  #leaseSince = FarPast
  #closed = false
  // The timer that drops the lease at askPassphraseAt. Null when none is held, or the one held
  // lasts until lock().
  #expiry: ReturnType<typeof setTimeout> | null = null

  readonly #listeners = new Set<() => void>()
  #vaultState(): VaultState {
    if (this.#vaultProps === UnreadVaultProps) { return 'opening' }
    if (this.#vaultProps === null) { return 'absent' }
    return this.#unlockStands() ? 'unlocked' : 'locked'
  }
  /** True while a lease is held that has not ended, by the clock read now. */
  #unlockStands(): boolean {
    return this.#lease !== null && ! this.#lease.endsBy(this.#clockNow())
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
  /** The ways in of `standing`, the passphrase's first, as a list: none for no vault props. */
  #wayinListOf(standing: GatedVaultProps | null): readonly (PassphraseWayin | PasskeyWayin)[] {
    if (standing === null) { return [] }
    const { passphrase, passkey } = this.#wayinsOf(standing)
    return passkey === null ? [passphrase] : [passphrase, passkey]
  }
  // Whether the last read of storage succeeded, as the snapshot says; whether the storage watch
  // has warned of a failing streak of reads it has not yet seen end; and of hellos, likewise.
  #syncing = true
  #watchWarned = false
  #watchHelloWarned = false
  // The latest bad news, or what the handler threw at it: the snapshot's trouble. See [Bad news].
  #trouble: VaultError | null = null
  #snapshot: VaultSnapshot
  // The vault props the snapshot was last settled from, whose ways in it shows as summaries: the
  // vault's alone, as their salts and wraps are what an offline guess at a passphrase needs.
  #shownProps: GatedVaultProps | null = null

  /** The snapshot the private state makes now, frozen. */
  #picture(): VaultSnapshot {
    const state = this.#vaultState()
    const standing = this.#vaultProps === UnreadVaultProps ? null : this.#vaultProps
    const wayins = standing === null ? null : this.#wayinsOf(standing)
    const { boxes, bytes } = this.#capacity()
    return Object.freeze({
      ...this.#scope,
      vault_tok:       standing?.vault_tok ?? null,
      registered_at:   standing?.registered_at ?? null,
      gate_epoch:      standing?.gate_epoch ?? null,
      passphrase:      wayins === null ? null : Object.freeze(wayins.passphrase.toJSON()),
      passkey:         wayins?.passkey ? Object.freeze(wayins.passkey.toJSON()) : null,
      state,
      boxes:           Object.freeze(this.#boxes.map((box) => Object.freeze(box))),
      capacity:        Object.freeze({ boxes: Object.freeze(boxes), bytes: Object.freeze(bytes) }),
      askPassphraseAt: state === 'unlocked' ? this.#lease?.ask_passphrase_at ?? null : null,
      trouble:         this.#trouble,
      syncing:         this.#syncing,
    })
  }

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped.
   * It keeps its identity, and tells nobody, until something really changed: useSyncExternalStore's
   * contract, and what spares React a render after a refresh that found nothing new.
   */
  #replaceSnapshot() {
    this.#shownProps = this.#vaultProps === UnreadVaultProps ? null : this.#vaultProps
    const next = this.#picture()
    // Trouble is told apart by identity, as two refusals of one kind read alike as JSON.
    if (next.trouble === this.#snapshot.trouble && stableJsonify({ ...next, trouble: null }) === stableJsonify({ ...this.#snapshot, trouble: null })) { return }
    this.#snapshot = next
    this.#listeners.forEach((listener) => { listener() })
  }
  // --

  // == [Reading storage]: refresh, readStorage, takeStorage, takePicture, readAt, birth, ensureBorn, beBorn, helloWithin, watchStorage

  /** Bring the picture up to what storage holds, one read at a time: a refresh asked for while one runs shares it. */
  readonly #refresh = oneAtATime(() => this.#readStorage())

  /** One read of storage into the picture. One that fails leaves the picture as it stood, but for `syncing`, and has the next hello read afresh. */
  async #readStorage() {
    try {
      await this.#takeStorage()
    } catch (err) {
      this.#syncing = false
      this.#readAt = FarPast
      this.#replaceSnapshot()
      throw err
    }
    if (! this.#watchWarned) { return }
    this.#watchWarned = false
    this.#logger.log('Storage reads again after the failures the vault warned of: what it shows has caught up with storage.', { call: 'refresh' })
  }

  /** Fetch the vault props, listing and this device's lease, and judge them against the picture in hand.
   * The judgment is synchronous: a read older than the picture is ignored; otherwise the picture is
   * replaced whole, and the lease in hand dropped when it no longer fits.
   */
  async #takeStorage() {
    const readAt = this.#clockNow()
    // The mark the vault props are held to is read before them (see heedMark), so a mark this
    // device's own write raised is never held against a read served before that write landed.
    const seenBefore = this.#checkedMark(valOf(await this.#deviceDB.getMark(this.#scope)))
    const [read, leaseKept] = await Promise.all([this.#vaultDB.getVault(this.#scope), this.#deviceDB.getLease(this.#scope)])
    // A read served before a write of this device's own, and answered after it: nothing is taken
    // from it, and it is never judged older than this device has seen.
    if (isOlderPicture(this.#vaultProps, read?.vaultProps ?? null)) { return }
    // Gateless vault props have no way in to try: this vault reads them as no vault yet.
    const fresh = read === null || ! isGated(read.vaultProps) ? null : frozenVaultProps(read.vaultProps)
    const mark = fresh === null ? null : await this.#heedMark(fresh, { seenBefore, call: 'refresh' })
    // The mark's own wait lets this device's own write land meanwhile: the same judgment again.
    if (isOlderPicture(this.#vaultProps, read?.vaultProps ?? null)) { return }
    this.#takePicture({ fresh, mark, listed: fresh === null ? [] : read?.boxes ?? [], leaseKept: valOf(leaseKept), readAt })
  }

  /** Replace the picture with what one read found, synchronously: vault props, mark and listing together, never a vault beside another's boxes.
   * The lease in hand is dropped, in memory only, when it no longer fits: the vault gone or made
   * anew, or its ways in changed. It is dropped too when this device's store holds no lease (a
   * lock in another tab), or one granted after it (another tab's unlock), unless the read began
   * before the lease in hand was taken, or found the lease the store held before it: a read older
   * than the lease, which changes nothing. None is taken up here. Bad news is told once the
   * snapshot shows it.
   */
  #takePicture(found: { fresh: GatedVaultProps | null, mark: DeviceMark | null, listed: readonly (ListedSummary | DamagedBox)[], leaseKept: unknown, readAt: number }) {
    const { fresh } = found
    const shown = this.#boxes
    const shownWayins = this.#wayinListOf(this.#shownProps)
    this.#vaultProps = fresh
    this.#deviceMark = found.mark
    this.#boxes = fresh === null ? [] : found.listed.map((box) => heldListing(box, fresh.vault_tok))
    this.#syncing = true
    this.#readAt = found.readAt
    // A read with no damaged box or way in clears the trouble: nothing amiss stands. The listing is
    // published before its news is told, so a handler reading the vault sees what it lists.
    const damagedWayins = this.#wayinListOf(fresh).filter((wayin) => wayin.isDamaged())
    if (this.#boxes.every((box) => ! box.damaged) && damagedWayins.length === 0) { this.#trouble = null }
    const held = this.#lease
    const outdated = held !== null && (fresh === null || ! fitsLease(fresh, held))
    const revoked = held !== null && found.readAt >= this.#leaseSince && ! standsBeside(found.leaseKept, held)
    if (outdated || revoked) { this.#dropLease() }
    this.#replaceSnapshot()
    this.#tellListingNews(shown)
    this.#tellWayinNews(damagedWayins, shownWayins)
  }

  // When the last read of storage to succeed began, by the vault's clock: what a hello's
  // staleMinutes are counted from. FarPast after a read that failed, so the next hello reads.
  #readAt = FarPast

  // The first hello, under way or done: what every call awaits before it reads storage, and
  // whether it has succeeded. Vault.make hands out a Vault object that has read nothing.
  #birth: Promise<void> | null = null
  #born = false

  /** The first hello, shared while it runs and kept once it succeeds: every call awaits it. It starts the watch on storage. */
  #ensureBorn(): Promise<void> {
    if (this.#closed) { return Promise.reject(closedError()) }
    this.#watchStorage()
    this.#birth ??= this.#beBorn()
    return this.#birth
  }

  /** The first hello: the strength checker loaded and storage read together, then this device's lease taken up.
   * A load that fails refuses the hello, and no lease is taken up; bad news the read met is still
   * told. A first hello that fails is forgotten, so the next one loads and reads afresh.
   */
  async #beBorn(): Promise<void> {
    try {
      // Both settle before either refuses: no read is left running unheard.
      const [loaded, read] = await Promise.allSettled([this.#strengthChecker.load(), this.#refresh()])
      if (loaded.status === 'rejected') {
        // The load's failure is the hello's, but bad news the read met is still told.
        if (read.status === 'rejected') { this.#hearBadNews(read.reason) }
        throw loaded.reason
      }
      if (read.status === 'rejected') { throw read.reason }
      await this.#takeUpLease()
    } catch (err) {
      this.#birth = null
      this.#replaceSnapshot()
      throw err
    }
    this.#born = true
    this.#watchHelloWarned = false
    this.#replaceSnapshot()
  }

  /** The host's hello: the first, or a read once the last began `staleMillis` ago or more; the snapshot replaced either way, so a lease run out meanwhile shows. */
  async #helloWithin(staleMillis: number): Promise<void> {
    if (! this.#born) {
      await this.#ensureBorn()
      return
    }
    if (this.#clockNow() - this.#readAt >= staleMillis) { await this.#refresh() }
    this.#replaceSnapshot()
  }

  /** Start the vault's watch on storage, once: the first hello does, and `close()` ends it. */
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

  /** This device's mark for the vault, as kept: one that fails its check, or names another scope, reads as none, and the logger says so. */
  async #keptMark(call: VaultCall): Promise<DeviceMark | null> {
    const kept = valOf(await this.#deviceDB.getMark(this.#scope))
    if (kept === null) { return null }
    const checked = this.#checkedMark(kept)
    if (checked !== null) { return checked }
    this.#logger.warn("This device's mark of the newest copy of the vault it had seen could not be read, so it starts again from the copy storage holds now.", { call })
    return null
  }

  /** This device's mark for `fresh`, vault props storage handed back, raised to them: older ones refuse 'rolled_back'.
   * Older means of the vault the mark names, at a `gate_epoch` below what this device has seen.
   * Nothing is written or taken from them, and the vault locks. `opts.seenBefore` is the mark as
   * the caller read it before `fresh`, to hold them to.
   */
  async #heedMark(fresh: GatedVaultProps, opts: { seenBefore?: DeviceMark | null, call: VaultCall }): Promise<DeviceMark> {
    // The vaultKey's epoch is bound into every way in and held to the vault props', so storage
    // cannot raise it on older vault props and still have a way in open. The gate epoch is bound
    // into nothing, so older vault props at the same vaultKey under a raised gate epoch pass.
    // Held to `seenBefore` when given: storage held that epoch when the mark was written, so vault
    // props read after it are older only if storage went back. The mark as it stands now could hold
    // a newer epoch, written meanwhile by another tab or this one, and refuse vault props that were
    // the newest when they were read.
    const kept = await this.#keptMark(opts.call)
    const held = (opts.seenBefore === undefined ? kept : opts.seenBefore)?.seen ?? null
    const older = held !== null && held.vault_tok === fresh.vault_tok
      && fresh.gate_epoch < held.gate_epoch
    if (older) {
      const refusal = new VaultError('rolled_back', "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it by forgetting what it saw of the vault (its deviceDB's delMark) and opening the vault again; otherwise the app's support should look at its storage.")
      // Storage that hands back an older copy is not to be trusted with an unlocked vault.
      await this.#heedRefusal(refusal)
      throw refusal
    }
    return await this.#raiseMark(kept, fresh)
  }

  /** The mark this device keeps once it has seen `fresh`, as `#markSeeing` makes it, written first when it is not `kept`. */
  async #raiseMark(kept: DeviceMark | null, fresh: GatedVaultProps): Promise<DeviceMark> {
    const mark = this.#markSeeing(kept, fresh)
    if (mark.seen !== kept?.seen) { valOf(await this.#deviceDB.putMark(mark)) }
    return mark
  }

  /** The mark that has seen `kept`'s vault and `fresh`: each epoch the higher, or `kept` itself when nothing is raised.
   * It keeps the `device_id` `kept` has for that vault; a vault not seen gets `#newDeviceIdFor`'s.
   */
  #markSeeing(kept: DeviceMark | null, fresh: GatedVaultProps): DeviceMark {
    const seen = kept?.seen.vault_tok === fresh.vault_tok ? kept.seen : null
    if (kept !== null && seen !== null && seen.gate_epoch >= fresh.gate_epoch) { return kept }
    return {
      format: MarkFormat,
      ...this.#scope,
      seen:   {
        device_id:  seen?.device_id ?? this.#newDeviceIdFor(fresh.vault_tok),
        vault_tok:  fresh.vault_tok,
        gate_epoch: Math.max(seen?.gate_epoch ?? 0, fresh.gate_epoch),
      },
    }
  }

  /** The `device_id` a mark of `vaultTok` starts under: the one this Vault object drafted it under, or a new one. */
  #newDeviceIdFor(vaultTok: string): string { return this.#drafted?.vault_tok === vaultTok ? this.#drafted.device_id : randomId() }

  /** This device's id for the vault `standing` is, which every way in it adds carries: the one the mark held with the vault props in hand names.
   * Refuses 'stale_write' when the vault props in hand have moved on to another vault meanwhile.
   */
  #deviceIdFor(standing: GatedVaultProps): string {
    if (this.#deviceMark?.seen.vault_tok === standing.vault_tok) { return this.#deviceMark.seen.device_id }
    throw new VaultError('stale_write', 'The vault changed in storage while this device was reading it -- it was deleted or made anew elsewhere -- so nothing was written. Read the vault again before retrying.')
  }
  // --

  // == [Demand]: checkOpen, demand, inconsistencyWith, leaseRefusal, demandLease, currentVaultProps

  #checkOpen() {
    if (this.#closed) { throw closedError() }
  }

  /** Refuse unless `thing` is consistent with the picture in hand, as {@link Vault.demandConsistentWith} says: the one demand, before and after each wait. */
  #demand(thing: Stamped, opts: { leaseBound?: boolean, call: VaultCall }) {
    const refusal = this.#inconsistencyWith(thing) ?? (opts.leaseBound === true ? this.#leaseRefusal() : null)
    if (refusal === null) { return }
    // The thing's fields never reach the logger: a lease's are its scope and epoch, but the rule is one.
    this.#logger.log(`A call found the vault moved on from what it held, and refused it: ${refusal.refusalkind}.`, { call: opts.call, refusalkind: refusal.refusalkind })
    throw refusal
  }

  /** Why `thing` is not consistent with the picture in hand, the vault half (closed, gone, made anew, ways in moved), or null when it is. */
  #inconsistencyWith(thing: Stamped): VaultError | null {
    if (this.#closed) { return closedError() }
    const held = this.#vaultProps
    if (held === null || held === UnreadVaultProps) { return goneError() }
    const sameScope = (thing.applabel ?? this.#scope.applabel) === this.#scope.applabel
      && (thing.user_id ?? this.#scope.user_id) === this.#scope.user_id
      && (thing.vaultlabel ?? this.#scope.vaultlabel) === this.#scope.vaultlabel
    if (! sameScope || thing.vault_tok !== held.vault_tok) { return remadeError() }
    if ((thing.gate_epoch ?? held.gate_epoch) !== held.gate_epoch || (thing.vault_epoch ?? held.vault_epoch) > held.vault_epoch) { return gateMovedError() }
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

  #currentVaultProps(): GatedVaultProps {
    if (this.#vaultProps === UnreadVaultProps || this.#vaultProps === null) {
      throw new VaultError('absent_vault', 'This vault has not been created yet: the first unlock() creates it.')
    }
    return this.#vaultProps
  }
  // --

  // == [Asking for a proof]: asking, ensureUnlocked, leaseStandsPast, whyAsk, raiseAsk, landLock, tryAttempt, unlockWith

  // The prompt up now, if any: every call that needs the vault unlocked while it is up waits on its
  // one answer. See ensureLease().
  #asking: RaisedAsk | null = null

  /** Have the vault unlocked: at once while a lease of the ways in held stands past `renewMillis` from now, else by this device's lease, else once the prompt answers.
   * The prompt is the one up, or one raised now. See {@link Vault.ensureLease}. `beforeAsking` runs
   * only when the vault must ask, after the hello and before any prompt: a call checks there what
   * it can know without the key, so a call that cannot land never prompts. It resolves once the
   * prompt answers, demanding nothing after: the call's own operation demands on the lease first.
   */
  async #ensureUnlocked(renewMillis: number, beforeAsking?: () => void): Promise<void> {
    await this.#helloWithin(this.#staleMillis)
    // A close() during the hello: no ask is raised over a closed handle.
    this.#checkOpen()
    if (this.#leaseStandsPast(renewMillis)) { return }
    // Another tab's unlock, taken up before anyone is asked (see takeUpLease).
    if (this.#lease === null) { await this.#takeUpLease() }
    if (this.#leaseStandsPast(renewMillis)) { return }
    const why = this.#whyAsk()
    beforeAsking?.()
    const answer = valOf(await (this.#asking ?? this.#raiseAsk(why)).answer)
    if (answer === 'declined') { throw declinedError(this.#getProof !== null) }
  }

  /** True while the lease in hand fits the ways in the picture holds and does not end within `renewMillis` from now. */
  #leaseStandsPast(renewMillis: number): boolean {
    const standing = this.#vaultProps
    const held = this.#lease
    if (held === null || standing === null || standing === UnreadVaultProps) { return false }
    return fitsLease(standing, held) && ! held.endsBy(this.#clockNow() + renewMillis)
  }

  /** Why the vault must ask for a proof, once no lease in hand stands past the call's `renewMinutes`. */
  #whyAsk(): AskWhy {
    if (this.#vaultProps === null) { return 'absent' }
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

  /** A `lock()`, `close()` or `del()` has landed: the prompt up, if any, refuses its waiters and settles `lockLanded`. */
  #landLock() {
    this.#asking?.landLock()
    this.#asking = null
  }

  /** An ask's `attempt`: one proof's unlock, as an Outcome, taking nothing up once `overtaken` aborts as the prompt ends. */
  async #tryAttempt(givenProof: string | PasskeyAnswer, overtaken: AbortSignal): Promise<Outcome<Vault>> {
    try {
      await this.#unlockWith(givenProof, overtaken)
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Unlock with one proof, as `unlock()` and an ask's `attempt` do, against the vault props as storage holds them now.
   * It creates the vault when absent, and grants a lease, demanding at each step that the vault
   * still stands as proven and, for an ask's attempt, that its prompt has not ended.
   */
  async #unlockWith(givenProof: string | PasskeyAnswer, overtaken?: AbortSignal): Promise<void> {
    this.#checkOpen()
    const proof = Proof.parse(this, givenProof)
    // The proof proves itself against the vault props as storage holds them now, not a picture a
    // change elsewhere has outdated: a passphrase replaced there opens nothing here.
    await this.#helloWithin(0)
    const unlocked = await this.#settleUnlock(proof)
    await this.#grantLease(unlocked, unlocked.standing, overtaken)
  }
  // --

  // == [Unlock and ways in]: unwrapWith, draftGate, settleUnlock, unlockCreating, gatedFrom, gated, reviseWayins, raiseMarkAfter

  /** The vaultKey out of `standing`'s way in of `proof`'s kind, whose refusal is the passphrase or passkey check.
   * Refuses 'absent_wayin' for a passkey's answer to a vault with no passkey.
   */
  async #unwrapWith(standing: GatedVaultProps, proof: Proof): Promise<VaultKeyPair> {
    const { passphrase, passkey } = this.#wayinsOf(standing)
    const wayin = proof.kind === 'passphrase' ? passphrase : passkey
    if (wayin === null) {
      throw new VaultError('absent_wayin', "This vault has no passkey: it may have been removed on another device. Unlock with the passphrase.")
    }
    return valOf(await wayin.tryOpen(proof))
  }

  /** The gate for a gateless vault: its one way in `passphrase`'s, sealed under `deviceId` around a brand-new vaultKey, at `gate_epoch` 1.
   * The vaultKey is not handed back: the vault takes it out of the way in as stored, as any unlock
   * does. `vault_epoch` is the one the store will set, the standing one plus one; the store
   * ignores what it is handed.
   */
  async #draftGate(base: GatelessVaultProps, passphrase: PassphraseProof, deviceId: string): Promise<GatedVaultProps> {
    const wayin = await Wayin.seal(this, base.vault_tok, passphrase, deviceId, await makeVaultKey())
    return {
      ...base,
      vault_epoch:         base.vault_epoch + 1,
      gate_epoch:          1,
      passphrase:          wayin.record,
      passkey:             null,
    }
  }

  /** The vaultKey for an unlock, and the vault props it was proven against, this device's or another's: the vault created first when absent.
   * Only a passphrase creates, and it must pass the strength check as a new passphrase; a passkey's
   * answer refuses 'absent_vault'. Refuses 'created_elsewhere' when another device created the
   * vault meanwhile under a passphrase this one does not open.
   */
  async #settleUnlock(proof: Proof): Promise<{ standing: GatedVaultProps } & VaultKeyPair> {
    if (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps) { return await this.#unlockCreating(proof) }
    const standing = this.#vaultProps
    return { standing, ...await this.#unwrapWith(standing, proof) }
  }

  /** The first unlock of a vault this device has seen none of: the vault ensured, its gate written, and `proof`'s passphrase tried against whichever vault stands. */
  async #unlockCreating(proof: Proof): Promise<{ standing: GatedVaultProps } & VaultKeyPair> {
    if (! (proof instanceof PassphraseProof)) {
      throw new VaultError('absent_vault', 'This vault has not been created yet, so no passkey opens it: the first unlock(), with a passphrase, creates it.')
    }
    await proof.checkStrongEnough()
    const deviceId = randomId()
    const draft: GatelessVaultProps = {
      format: 'safebyok-vault-v6', ...this.#scope, vault_tok: randomId(), vault_epoch: 0, registered_at: this.#clockNow(), gate_epoch: 0, passphrase: null, passkey: null,
    }
    // Sealed before storage is touched, so a deriver that fails creates nothing.
    const sealed = await this.#draftGate(draft, proof, deviceId)
    // Another device's vault, if one was made meanwhile, is held to the mark as it was before it.
    const seenBefore = this.#checkedMark(valOf(await this.#deviceDB.getMark(this.#scope)))
    const { vaultProps: ensured } = await this.#vaultDB.ensureVault(draft)
    const settled = frozenVaultProps(await this.#gatedFrom(ensured, sealed, proof, deviceId))
    const mark = await this.#heedMark(settled, { seenBefore, call: 'unlock' })
    // The picture takes the vault as written, unless a read took up one meanwhile: should it
    // differ, the grant that follows finds the vault moved on, and takes nothing up.
    if (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps) {
      this.#vaultProps = settled
      this.#deviceMark = mark
      this.#replaceSnapshot()
    }
    // The vaultKey comes out of the way in as stored, so the lease keeps only the non-extractable
    // handle an unwrap makes. Should another device have created the vault between our look and
    // our write, the settled vault props are theirs, and the passphrase proves itself against
    // them like any other.
    try {
      return { standing: settled, ...await this.#unwrapWith(settled, proof) }
    } catch (err) {
      if (this.#drafted?.vault_tok !== settled.vault_tok && isVaultError(err, 'wrong_passphrase')) { throw createdElsewhereError(err) }
      throw err
    }
  }

  /** The vault props `ensured` comes to once gated: themselves if another device gated them, else with `sealed` as the gate, sealed afresh where the vault is another's gateless one. */
  async #gatedFrom(ensured: VaultProps, sealed: GatedVaultProps, proof: PassphraseProof, deviceId: string): Promise<GatedVaultProps> {
    if (isGated(ensured)) { return ensured }
    const gate = ensured.vault_tok === sealed.vault_tok ? sealed : await this.#draftGate(ensured, proof, deviceId)
    return await this.#gated(gate, deviceId)
  }

  /** The vault props of a gateless vault, once its first gate, `gate`, is written: this passphrase's, or the winner's where another device gated them first.
   * The first gate is written over the gateless props expecting `gate_epoch` 0, so of two devices
   * gating one vault at once, one lands and the other hears whose won, as `meta.vault_props_stored`.
   */
  async #gated(gate: GatedVaultProps, deviceId: string): Promise<GatedVaultProps> {
    this.#drafted = { vault_tok: gate.vault_tok, device_id: deviceId }
    try {
      const stored = await this.#vaultDB.putVaultProps(gate, { vault_tok: gate.vault_tok, gate_epoch: 0 })
      return stored as GatedVaultProps
    } catch (err) {
      const winner = isVaultError(err, 'stale_write') ? err.meta?.vault_props_stored : undefined
      if (winner === undefined || winner === null || ! isGated(winner) || winner.vault_tok !== gate.vault_tok) { throw err }
      // The gate that stands is another device's, so this device drafted nothing of the vault: a passphrase it does not open is 'created_elsewhere'.
      this.#drafted = null
      return winner
    }
  }

  /** Rewrite the vault's ways in, proven by `proof`, the standing passphrase, resolving the vault props as stored.
   * Every change to the ways in goes through here. It proves `proof` against the vault props as
   * storage holds them now, and writes the ways in `plan.revise` makes under the next gate epoch,
   * only if no other device changed them meanwhile. It then takes up the unlock under them, the
   * lease starting again from now, unless the vault moved on meanwhile. `plan.check` runs first, on the standing vault props, so a
   * change refused for what it asks costs no key derivation.
   */
  async #reviseWayins(
    proof: PassphraseProof,
    plan: {
      call:    'putWayin' | 'delWayin'
      check?:  (standing: GatedVaultProps) => void
      // Runs once the proof holds, given this device's id for the vault.
      revise:  (standing: GatedVaultProps, proven: VaultKeyPair, deviceId: string) => StandingWayins | Promise<StandingWayins>
    },
  ): Promise<GatedVaultProps> {
    // The proof is made against the vault props as storage holds them now, not a picture a change
    // elsewhere has outdated: a passphrase replaced there proves nothing here.
    await this.#helloWithin(0)
    const standing = this.#currentVaultProps()
    const deviceId = this.#deviceIdFor(standing)
    plan.check?.(standing)
    const proven = await this.#unwrapWith(standing, proof)
    const drafted = frozenVaultProps({
      ...standing,
      gate_epoch:       standing.gate_epoch + 1,
      ...await plan.revise(standing, proven, deviceId),
    })
    const stored = await withoutStoredVaultProps(this.#vaultDB.putVaultProps(drafted, { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch }))
    // The vault as storage now holds it, its counter moved by the store.
    const next = frozenVaultProps(stored as GatedVaultProps)
    // The change has landed, whatever happens now: what follows is this device's own, and a
    // failure of it is said through the logger, never thrown as though the change had not landed.
    const raised = await this.#raiseMarkAfter(next, plan.call)
    // The picture takes what was written, unless a read took up a later one meanwhile: should it
    // differ, the grant below finds the vault moved on, and takes nothing up.
    if (! isOlderPicture(this.#vaultProps, next)) {
      this.#deviceMark = raised
      this.#vaultProps = next
    }
    try {
      await this.#grantLease(proven, next)
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands as it stood here, and asks for the passphrase at its next open.", { call: plan.call }, asError(err))
    }
    this.#replaceSnapshot()
    return next
  }

  /** This device's mark raised to `next`, vault props its own write just landed: never a refusal.
   * A device store that fails to keep it is warned of, and the mark is held in memory as raised.
   */
  async #raiseMarkAfter(next: GatedVaultProps, call: VaultCall): Promise<DeviceMark> {
    try {
      return await this.#raiseMark(await this.#keptMark(call), next)
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not note it in its mark of the vault: the change stands, and the mark catches up at a later read.", { call }, asError(err))
      // A missed mark only weakens the rollback check, until a later read raises it.
      return this.#markSeeing(this.#deviceMark, next)
    }
  }
  // --

  // == [Locking and expiry]: lockNow, heedRefusal, forgetVaultProps, takeDeletion, dropLease, armExpiry, disarmExpiry

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
    const why = refusal.refusalkind === 'rolled_back'
      ? 'Storage handed back an older copy of the vault than this device has seen'
      : 'Storage no longer serves the user this vault was opened for -- signed out, or another user signed in --'
    const wasUnlocked = this.#lease !== null
    // An older copy refused, the vault props in hand are forgotten too, before any wait: the next
    // hello takes up what storage holds, once the host has accepted it (see the class doc). The
    // older copy is never taken for a stale read of these.
    if (refusal.refusalkind === 'rolled_back') { this.#forgetVaultProps() }
    this.#standDownTakeUp()
    this.#dropLease()
    const erased = await this.#deviceDB.delLease(this.#scope)
    if (! erased.ok) {
      this.#logger.warn(`${why} so the vault locked, but this device's lease could not be revoked: the next vault made on this device, as at the next page load, may take it up.`, { call: 'untrustedStorage' }, erased.err)
    }
    if (wasUnlocked) {
      this.#logger.log(`${why} so the vault locked, as it always does when storage cannot be trusted with it. It asks for the passphrase again once storage is sound.`, { call: 'untrustedStorage' })
    }
  }

  /** Forget the vault props in hand, as though storage had not been read, with their mark and their boxes. */
  #forgetVaultProps() {
    this.#vaultProps = UnreadVaultProps
    this.#deviceMark = null
    this.#boxes = []
  }

  /** Take up the deletion of `doomed`, which storage just confirmed: the picture holds no vault, unless a read took up another meanwhile. */
  #takeDeletion(doomed: GatedVaultProps) {
    const held = this.#vaultProps
    if (held === null || held === UnreadVaultProps || held.vault_tok !== doomed.vault_tok) { return }
    this.#vaultProps = null
    this.#deviceMark = null
    this.#boxes = []
    this.#replaceSnapshot()
  }

  /** Drop the lease from memory, erasing nothing, and say so: what the expiry, `close()`, a demand finding the lease ended, and a read finding it revoked do.
   * Another tab may hold a lease renewed under the same scope, so nothing in the device store is
   * touched, and no prompt is landed on: an attempt made as the lease ends completes.
   */
  #dropLease() {
    this.#lease = null
    this.#disarmExpiry()
    this.#replaceSnapshot()
  }

  /** Arm the one expiry timer, in place of any, to drop the lease at `until`, counted from `now`; none for a lease that lasts until `lock()`. */
  #armExpiry(until: number, now: number) {
    this.#disarmExpiry()
    if (isFarFuture(until)) { return }
    this.#expiry = unrefTimeout(() => { this.#dropLease() }, until - now)
  }

  #disarmExpiry() {
    if (this.#expiry === null) { return }
    clearTimeout(this.#expiry)
    this.#expiry = null
  }
  // --

  // == [Lease]: grantLease, demandGranting, takeUpLease, takeUp, standDownTakeUp, takeUpUnder, discardLease

  /** Grant this device a lease, `leaseHours` from now, write it, and hold it: the vault is then unlocked, resolving the lease.
   * {@link Lease.grant} makes the lease, opened around the vaultKey's non-extractable handle, and
   * {@link DeviceDB.putLease} writes it. Before each wait and after the last it demands that the
   * vault still stands at `standing`, the vault props the key was proven against, and that
   * `overtaken` (an ask's attempt, which its prompt's end stands down) has not aborted; one that
   * refuses takes nothing up. A lock that lands during the write erases the lease behind it, as
   * the device store applies one scope's calls in the order made. A lease written before some
   * other refusal stays in the device store, naming vault props that no longer stand, and is
   * never taken up.
   *
   * Every proof passes through here: an `unlock()`, or a change to the ways in. Nothing else moves
   * the deadline.
   */
  async #grantLease(unlocked: VaultKeyPair, standing: GatedVaultProps, overtaken?: AbortSignal): Promise<Lease> {
    const proven = stampOf(this.#scope, standing)
    this.#demandGranting(proven, overtaken)
    // A take-up under way stands down before this lease is written, not after: one that read an
    // older lease could otherwise erase this one as it discards that.
    this.#standDownTakeUp()
    // The transient's last act: wrapped into this device's lease, then dropped. The deadline is
    // leaseHours from now, and never past FarFuture, which is how leaseHours: Infinity reads.
    const lease = await Lease.grant(this, standing, unlocked)
    // Nothing is awaited between this demand and the write.
    this.#demandGranting(proven, overtaken)
    valOf(await this.#deviceDB.putLease(lease.record))
    this.#demandGranting(proven, overtaken)
    this.#lease = lease
    this.#leaseSince = this.#clockNow()
    this.#armExpiry(lease.ask_passphrase_at, this.#leaseSince)
    this.#replaceSnapshot()
    return lease
  }

  /** Demand, for a lease being granted, that the vault still stands at `proven`, and that the prompt the attempt answers, if any, has not ended. */
  #demandGranting(proven: Stamp, overtaken: AbortSignal | undefined) {
    this.#demand(proven, { call: 'unlock' })
    if (overtaken?.aborted === true) { throw promptEndedError() }
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
    const standing = this.#vaultProps
    if (kept === null || standing === null || standing === UnreadVaultProps || isStoodDown()) { return }
    // A record that is no lease, or another vault's, is unreadable.
    const made = await outcomeOf(() => Lease.make(this, kept), unexpectedError)
    if (isStoodDown()) { return }
    if (! made.ok) {
      await this.#discardLease(made.err)
      return
    }
    const lease = made.val
    // Granted under a longer leaseHours than this handle's: it does not fit. Otherwise the lease
    // judges itself against the vault props in hand, and the clock.
    const opened = lease.endsBy(this.#clockNow() + this.#leaseMillis) ? await lease.tryOpen(standing) : null
    // One stood down, or outrun by the vault moving on meanwhile, is left alone: the lease standing
    // now may be the change's own, and the next take-up judges it against the vault props then.
    if (isStoodDown() || this.#inconsistencyWith(stampOf(this.#scope, standing)) !== null) { return }
    if (! opened?.ok) {
      await this.#discardLease(opened?.err ?? null)
      return
    }
    this.#lease = opened.val
    this.#leaseSince = this.#clockNow()
    this.#armExpiry(lease.ask_passphrase_at, this.#leaseSince)
    this.#replaceSnapshot()
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

  /** Refuse 'whisper_too_large' for a whisper whose JSON, with the sidecar's beside it, is over `maxWhisperBytes`, quoting neither. */
  #checkWhisperFits(whisperBytes: Uint8Array, sidecar: Sidecar) {
    const sidecarBytes = new TextEncoder().encode(stableJsonify(sidecar)).length
    if (whisperBytes.length + sidecarBytes <= this.#whisperByteLimit) { return }
    throw new VaultError('whisper_too_large', `That whisper and its box's sidecar are over this vault's limit of ${String(this.#whisperByteLimit)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Vault.make.`)
  }

  /** Refuse 'vault_full' for a new box while the vault holds `maxBoxes`, or one that would take it past `maxVaultBytes`.
   * Each box is weighed by `#boxWeight`. It counts from the boxes last listed, so a store costs no
   * extra read: a listing a moment stale may refuse, and a hello cures it. A replacement always
   * passes.
   */
  #checkRoomFor(boxlabel: string, prev: Box | null) {
    // A replacement weighs what it replaces, so it never makes the vault fuller: it always lands.
    if (prev !== null) { return }
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

  // == [Reading boxes]: listedRevisionOf, isListedDamaged, checkListed, getBoxOrDamaged, getBoxUnlocked

  /** The revision the listing names for the box under `boxlabel`, sound or damaged; null for none listed, or a damaged record that holds none.
   * Storage arbitrates a write that names it, so a listing gone stale costs a refusal and a second
   * store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#boxes.find((box) => box.boxlabel === boxlabel)?.revision_tok ?? null }

  /** True when the snapshot's listing shows the box under `boxlabel` as damaged. */
  #isListedDamaged(boxlabel: string): boolean { return this.#boxes.some((box) => box.boxlabel === boxlabel && box.damaged) }

  /** Refuse `boxlabel` as 'absent_box' when the listing in hand shows no box under it.
   * That is what a locked vault can know before it asks for a proof. Reads nothing: the listing is
   * as fresh as `staleMinutes` keeps it.
   */
  #checkListed(boxlabel: string) {
    if (this.#boxes.every((box) => box.boxlabel !== boxlabel)) { throw absentBox() }
  }

  /** The box under `boxlabel`, lying under `lease`'s vault; null when there is none, and 'damaged' when storage refuses its record as 'damaged_box'. */
  async #getBoxOrDamaged(boxlabel: string, lease: Lease): Promise<Box | 'damaged' | null> {
    try {
      const record = await this.#vaultDB.getBox(this.#scope, boxlabel)
      return record === null ? null : Box.make(this, record, lease.vault_tok)
    } catch (err) {
      if (! isVaultError(err, 'damaged_box')) { throw err }
      return 'damaged'
    }
  }

  /** The box under `boxlabel`, with the lease it was read under, once the vault is unlocked for it: 'absent_box' when there is none.
   * It demands the lease before the read, and the box after it, lease-bound: a lock or a `close()`
   * meanwhile refuses 'vault_locked' or 'vault_closed', handing nothing back.
   */
  async #getBoxUnlocked(boxlabel: string, call: VaultCall): Promise<{ box: Box, lease: Lease }> {
    this.#checkOpen()
    const label = Names.checkFloor('boxlabel', boxlabel)
    // Checked before the user is asked for anything: a call that cannot land never prompts.
    await this.#ensureUnlocked(0, () => { this.#checkListed(label) })
    const lease = this.#demandLease(call)
    const record = await this.#vaultDB.getBox(this.#scope, label)
    if (record === null) { throw absentBox() }
    // A box another device wrote is what storage holds, not drift: the box is held to its vault alone.
    const box = Box.make(this, record, lease.vault_tok)
    this.#demand(box, { leaseBound: true, call })
    return { box, lease }
  }
  // --

  // == [Writing boxes]: writeOver, takeStoredBox, takeBoxDeletion

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

  /** Take `stored`, the record a box write just landed, into the listing, once the vault is demanded to stand under `lease`'s vault: a lock meanwhile lets it land. */
  #takeStoredBox(stored: BoxRecord, lease: Lease) {
    this.#demand({ vault_tok: lease.vault_tok }, { call: 'putBox' })
    const { boxlabel, revision_tok, sidecar, registered_at, written_at } = stored
    const entry = heldListing({ boxlabel, revision_tok, sidecar, registered_at, written_at, damaged: false }, lease.vault_tok)
    this.#boxes = [...this.#boxes.filter((box) => box.boxlabel !== boxlabel), entry].toSorted((one, two) => byCodeUnit(one.boxlabel, two.boxlabel))
    this.#replaceSnapshot()
  }

  /** Drop the box under `boxlabel`, which a delete just removed, from the listing, once the vault is demanded to stand under `lease`'s vault: a lock meanwhile lets it land. */
  #takeBoxDeletion(boxlabel: string, lease: Lease) {
    this.#demand({ vault_tok: lease.vault_tok }, { call: 'delBox' })
    this.#boxes = this.#boxes.filter((box) => box.boxlabel !== boxlabel)
    this.#replaceSnapshot()
  }
  // --

  // == [Watching]: watchRefresh, unsubscribeDB

  // Watch the backend so boxes written elsewhere (another tab, the inspector's reset button) show
  // up without a manual refresh: through the first hello while none is under way or has succeeded,
  // so a lease is taken up as the vault settles, and otherwise through the refresh, joining one
  // under way. A
  // failure here has nobody to throw to, so it leaves the snapshot standing and tells any bad news
  // it met. A first hello's failure is warned of as itself, in the words `tryHello()` would refuse
  // with, once until a hello succeeds. A refresh's leaves the snapshot saying `syncing: false`, and
  // warns once for a failing streak; the next read that succeeds says so once.
  async #watchRefresh() {
    if (this.#birth === null) {
      const { ok, err } = await outcomeOf(() => this.#ensureBorn(), unexpectedError)
      if (ok) { return }
      this.#hearBadNews(err)
      if (this.#watchHelloWarned) { return }
      this.#watchHelloWarned = true
      this.#logger.warn(err.message, { call: 'hello' }, err)
      return
    }
    try {
      await this.#refresh()
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
    this.#trouble = new VaultError('bad_option', "The onBadNews handler passed to Vault.make threw as it was told of bad news: fix the handler. What it threw is this error's cause. The call that met the news went on as it would have.", { cause: err })
    this.#logger.error("The onBadNews handler threw as it was told of bad news: the vault's trouble keeps what it threw. The call that met the news went on as it would have.", { call: 'onBadNews' }, asError(err))
    reportToPlatform(err)
  }
  // --
}

// == [Refusals]: damagedBeyondNaming, lockedError, declinedError, closedError, goneError, remadeError, gateMovedError, promptEndedError, createdElsewhereError, withoutStoredVaultProps

const damagedBeyondNaming = () => new VaultError('damaged_box', "That box is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with delBox() first, then store its whisper again.")

const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call again, and the vault asks for a proof through getProof, or unlock it first.')

/** The refusal of a call whose ask was declined: by the user, or for want of a `getProof` to ask. */
const declinedError = (asked: boolean) => new VaultError('vault_locked', asked
  ? 'The vault is locked, and the user declined to unlock it: nothing was read or written. Ask again when they want the vault.'
  : 'The vault is locked, and there is no getProof to ask the user for a proof (Vault.make was given none): nothing was read or written. Prompt the user, unlock() with their passphrase, and call again.')

const closedError = () => new VaultError('vault_closed', 'This vault handle was closed: make another with Vault.make.')

const goneError = () => new VaultError('vault_gone', 'The vault this call was working on is gone from storage -- it was deleted, here or on another device -- so nothing more was read or written. Read the vault again (hello) to see what stands now.')

const remadeError = () => new VaultError('vault_remade', 'The vault this call was working on was deleted and made anew on another device, so nothing more was read or written: what the call held belongs to the vault that was deleted. Read the vault again (hello), and unlock the one that stands now.')

const gateMovedError = () => new VaultError('gate_moved', "The vault's ways in changed while this call was under way -- its passphrase or passkey was changed, here or on another device -- so nothing more was done. Unlock again to carry on.")

const promptEndedError = () => new VaultError('vault_locked', 'The prompt ended while this proof was being checked -- a lock landed, or it was answered -- and its end wins: nothing was unlocked. Ask again when the user wants the vault.')

/** The refusal of a first unlock whose passphrase `wrong` refused against a vault another device created meanwhile. The vault shows that one, `locked`. */
const createdElsewhereError = (wrong: VaultError) => new VaultError('created_elsewhere', 'A vault was just created for this label on another device, with a different passphrase than the one you entered. Nothing was created on this device. Enter the passphrase you chose there to unlock it.', { cause: wrong })

/** What `writing` resolves, or its refusal with the vault props a stale write names stripped: a vault's refusal carries no stored vault props record. */
const withoutStoredVaultProps = async (writing: Promise<VaultProps>): Promise<VaultProps> => {
  try {
    return await writing
  } catch (err) {
    if (! isVaultError(err, 'stale_write') || err.meta?.vault_props_stored === undefined) { throw err }
    // Not the VaultDB's message, which sends the reader to a meta this refusal does not carry.
    throw new VaultError(err.refusalkind, StaleWayinsMessage, err.cause === undefined ? {} : { cause: err.cause })
  }
}

/** What a change to the ways in says when storage refuses it as stale. */
const StaleWayinsMessage = "The vault changed in storage since this device read it -- its ways in were changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying."

// --

// == [Vocabulary]: frozenVaultProps, StandingWayins, stampOf, isOlderPicture, fitsLease, standsBeside, MarkFormat, VaultCall, UntrustedStorageKinds

/** A copy of `props`, frozen through its ways in: the vault props the vault holds, which no host can write to. */
const frozenVaultProps = (props: GatedVaultProps): GatedVaultProps => Object.freeze({
  ...props,
  passphrase: frozenRecord(props.passphrase),
  passkey:    props.passkey === null ? null : frozenRecord(props.passkey),
})

/** The ways in of vault props, as a change to them writes them anew. */
type StandingWayins = Pick<GatedVaultProps, 'passphrase' | 'passkey'>

/** The {@link Stamp} of `props` in `scope`, frozen. */
const stampOf = (scope: VaultScope, props: GatedVaultProps): Stamp => Object.freeze({
  ...scope, vault_tok: props.vault_tok, vault_epoch: props.vault_epoch, gate_epoch: props.gate_epoch,
})

/** True when `fresh`, vault props a read or a write returned, are older than `inHand`: the same vault at a lower epoch.
 * That is a read served before this device's own write and answered after it, or a write a read
 * has already passed. Data cannot tell it from storage restored from an older copy, so it is
 * ignored, never refused.
 */
const isOlderPicture = (inHand: GatedVaultProps | null | typeof UnreadVaultProps, fresh: VaultProps | null): boolean => (
  fresh !== null && inHand !== null && inHand !== UnreadVaultProps && inHand.vault_tok === fresh.vault_tok
  && (fresh.vault_epoch < inHand.vault_epoch || fresh.gate_epoch < inHand.gate_epoch)
)

/** True when `lease` was granted under the vault and ways in `standing` holds. */
const fitsLease = (standing: GatedVaultProps, lease: Lease): boolean => lease.vault_tok === standing.vault_tok && lease.gate_epoch === standing.gate_epoch

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

/** The device mark's format, as each mark carries it. */
const MarkFormat = 'safebyok-mark-v5'

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'make' | 'hello' | 'refresh' | 'unlock' | 'del' | 'untrustedStorage' | 'ensureLease' | 'demandConsistentWith'
  | 'putWayin' | 'delWayin' | 'putBox' | 'delBox' | 'getBox' | 'getWhisper' | 'decryptWhisper'

/** The refusals that say storage cannot be trusted as it stands: 'identity_revoked' and 'rolled_back', which lock the vault, and 'newer_format'.
 * Each asks something of the caller that a stale write does not: the user to sign in again,
 * storage to be looked at, or the app to be updated. Each has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'rolled_back', 'newer_format'] as const satisfies readonly RefusalKind[]
// --

// == [Argument parsers]: eventHint, checkHelloOpts, checkEnsureLeaseOpts, checkStoreOpts, sidecarOf, standingPassphraseOf, newProofOf, absentBox

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

/** What `putBox()`'s options may hold: a sidecar, which {@link sidecarOf} checks, and nothing else. */
const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, "putBox()'s only option is `sidecar`, the box's own visible data (it is authenticated but never encrypted): check its spelling, and leave out any other. A note is kept in the sidecar: { sidecar: { note } }.")

/** The sidecar a `putBox()` was handed, checked; undefined when it was handed none.
 * Refuses 'bad_option' for anything but a JSON object, quoting none of it, and for options beside
 * it.
 */
const sidecarOf = (storeOpts: { sidecar?: Sidecar | undefined } | undefined): Sidecar | undefined => {
  checkStoreOpts(storeOpts)
  if (storeOpts?.sidecar === undefined) { return undefined }
  return checkedSidecar(storeOpts.sidecar)
}

/** The proof of a change to the ways in, `call`'s: the vault's standing passphrase, as text.
 * Refuses 'bad_option' for anything else, a passkey's answer among it, and as
 * {@link PassphraseProof.parse} refuses.
 */
const standingPassphraseOf = (vault: Vault, given: unknown, call: 'putWayin' | 'delWayin'): PassphraseProof => {
  if (typeof given !== 'string') {
    throw new VaultError('bad_option', `${call} takes the vault's passphrase as it stands, as the text the user typed: only the passphrase proves a change to the vault's ways in, never a passkey.`)
  }
  return PassphraseProof.parse(vault, given)
}

/** `putWayin`'s new way in, checked: a new passphrase strong enough by the vault's strength checker, or a passkey's answer over a salt of a new passkey's shape.
 * Refuses as {@link Proof.parse}, `proof.checkStrongEnough()` and `checkSaltShape` do.
 */
const newProofOf = async (vault: Vault, given: unknown): Promise<PassphraseProof | PasskeyProof> => {
  const proof = Proof.parse(vault, given)
  if (proof instanceof PasskeyProof) {
    checkSaltShape(proof)
  } else {
    await proof.checkStrongEnough()
  }
  return proof
}

// The refusal never quotes the boxlabel: a host's validators may admit any text, a mistaken paste among it.
const absentBox = () => new VaultError('absent_box', 'No box stands under that boxlabel in this vault: its snapshot lists the ones it holds.')

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
