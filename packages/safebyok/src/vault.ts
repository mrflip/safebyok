import * as Z from 'zod/mini'
import pLimit from 'p-limit'
import { type Capacity, type Clock, type VaultScope, BoxSummary, type DamagedBox, type PasskeyWayinSummary, type PassphraseWayinSummary, type PasskeyAnswer, type WayinSummary, Whisper, Sidecar, type GatedVaultProps, isGated, DeviceMark, type LeaseRecord, MinuteMillis, FarFuture } from './types'
import { Box, type BoxRecord, checkedSidecar, heldListing, planSeal, sealPlanned, whisperBytesOf } from './box'
import * as Names from './names'
import { optionsCheck } from './options'
import { VaultError, isVaultError, type RefusalKind } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { makeVaultKey, randomId } from './crypto'
import { Wayin, frozenRecord, type PasskeyWayin, type PassphraseWayin, type VaultKeyPair } from './wayin'
import { Proof, PassphraseProof, PasskeyProof, checkSaltShape } from './proof'
import { stableJsonify } from './stable-jsonify'
import { byCodeUnit, jsonBytes, type BoxExpectation } from './vault-db'
import { type VaultLogger, asError } from './logger'
import * as RefusalPolicy from './refusal-policy'
import type { GuardedStrengthChecker, PassphraseVerdict } from './passphrase-strength'
import { type BadNewsHandler, type MakeVaultOpts, parseMakeVaultOpts, parseRenewMinutes, parseStaleMinutes, StoredBytesPerWhisperByte, BoxFixedBytes } from './vault-opts'
import { reportToPlatform } from './report-error'
import { type DeviceDB, deviceTroubleAsConditions } from './device-db'
import type { KeyDeriver } from './key-deriver'
import { Lease } from './lease'
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

/** The vault props a Vault object holds, with this device's mark that has seen them. */
type HeldVault = Readonly<{ vaultProps: GatedVaultProps, mark: DeviceMark }>

/** One user's vault of boxes, for as long as the app holds it: every read and write of a whisper goes through here.
 * `Vault.make` returns one, touching nothing. Its fields (`state`, `boxes`, `passkey`,
 * `capacity`, `trouble` and the rest) are live and read-only. A UI renders from `getSnapshot()`,
 * the same fields frozen in one object, and re-renders on `subscribe()`. Every call that reads
 * storage awaits a {@link Vault.hello} first, which reads nothing within `staleMinutes` of the
 * last read.
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
 * deviceDB: `lock()` leaves it, `del()` erases it). Any read of vault props older than that mark,
 * at a lower gate epoch, refuses 'rolled_back', taking nothing from them and writing nothing:
 * older vault props could bring back a way in that was removed. It locks the vault, as
 * 'identity_revoked' from storage does, and leaves the Vault object holding no vault props, its
 * state `opening`. A host that restored storage from an older copy on purpose accepts it on this
 * device by erasing the mark (`valOf(await deviceDB.delMark(scope))`) and calling `hello()` again.
 * A Vault object that goes on refusing changes to the ways in as 'stale_write' after a restore is
 * to be closed, and a new one made.
 *
 * Storage alone settles a race. When it refuses a write as stale, the call refuses at once,
 * reading nothing, and the next hello reads afresh, whatever its `staleMinutes`. A box that will
 * not open under the lease in hand is 'damaged_box' at once, with no read of storage first.
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

  // Each field reads the snapshot `#settle()` last published, so the fields and the snapshot always
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

  // == [Vault: opening]: hello, ensureLease

  /** Read storage and settle the vault as `absent`, `locked` or `unlocked`, resolving the vault.
   * Never prompts. Optional: every call that reads storage awaits a hello first. Call it again to
   * refresh: within `opts.staleMinutes` of the last read it re-settles without reading, unless what
   * it read may no longer stand (a read failed, a write was refused as stale, storage was not to be
   * trusted, or the vault was deleted). It reads `VaultDB.getVault`, {@link DeviceDB.getLease} and
   * the device mark together, in one turn; the first hello also starts the vault's watch,
   * `VaultDB.subscribe`, each of whose rings is a hello that reads.
   *
   * A refused hello applies no partial read: the vault stands as its last read left it, and
   * `opening` after 'rolled_back' (see
   * {@link Vault}). Stored vault props it cannot use refuse with 'damaged_vault'
   * (`delDamagedVault` clears them), 'newer_format' or 'rolled_back'. A box or way in stored
   * damaged refuses nothing: it lists damaged, and is told as bad news. A strength checker whose
   * `load` fails refuses the hello 'unexpected_error', and nothing read is taken up.
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
      await this.#hello(staleMillis)
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Have the vault unlocked, asking `getProof` for a proof only when it must, resolving the vault.
   * Every call that needs a whisper goes through it; call it yourself to unlock ahead of time, on a
   * button. Once it resolves, the vault is unlocked under a lease that stands. It awaits a hello
   * first. Unlocked, with the lease not ending within `opts.renewMinutes` (0 when left out) nor
   * within the vault's `staleMinutes`, it resolves at once, with no prompt and no write. Otherwise
   * it hands an {@link Ask} to `getProof` and waits for its answer, `lease_ending` while the lease
   * still stands; a call that finds a prompt up waits on that same one.
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
      return good(await this.#ensureLease(parseRenewMinutes(leaseOpts?.renewMinutes)))
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: locking]: unlock, lock

  /** Open the vault with a proof, its passphrase or a passkey's answer, granting this device a lease for `leaseHours`.
   * It does what an ask's `attempt` does, outside any prompt: how an app with no `getProof`
   * unlocks once it has asked the user itself. Once it resolves, the vault is `unlocked`
   * until `askPassphraseAt`; then the vaultKey is dropped, work in hand or not. A passphrase costs
   * one key derivation (about half a second with the browser's deriver). It proves against the
   * vault as its hello left it, at the vault's `staleMinutes`: after a change to the ways in
   * elsewhere, `hello({ staleMinutes: 0 })` first. Writes the lease with {@link DeviceDB.putLease}.
   *
   * On an `absent` vault, a passphrase creates the vault, with itself as the way in, through
   * `VaultDB.ensureVaultProps`. It must pass {@link Vault.checkPassphrase} first, or the unlock
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
   * vault now shows `locked`, its boxes read at the next hello. A `lock()` landing meanwhile does
   * not stop the unlock.
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

  // lock() does not wait for hello(): it locks at once, storage reachable or not.
  /** Forget the unlock, in memory and on this device: the vault is `locked` at once, storage reachable or not.
   * It awaits no hello, and erases this device's lease with {@link DeviceDB.delLease}. A prompt up
   * for a proof ends: every call waiting on it refuses 'vault_locked', its ask's `lockLanded`
   * settles, and an `attempt` under way takes nothing up. A `getWhisper()` or `useWhisper()` under
   * way refuses 'vault_locked' once storage answers, unless an unlock has put a key back in hand
   * meanwhile. An `unlock()` or `putWayin()` under way is not stopped, and leaves the vault
   * unlocked. A write already sent to storage lands.
   *
   * Refuses 'storage_unavailable' ('storage_blocked' when the browser withholds the store) when the
   * device store cannot erase the lease; the vault is locked all the same.
   *
   * The vault also locks of itself: when the lease ends, at `del()`, for storage it cannot trust,
   * and at a read that finds its ways in changed or the vault gone.
   *
   * @example document.addEventListener('visibilitychange', () => { if (document.hidden) { void vault.lock() } })
   */
  async lock(): Promise<void> { valOf(await this.tryLock()) }

  /** Forget the unlock, as an {@link Outcome}: the non-throwing form of {@link Vault.lock}. */
  async tryLock(): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
      this.#landLock()
      await this.#turn(() => this.#shutAndSay())
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
   * one vault. Replacing a box is never refused so by the vault's own limits, though storage may
   * refuse it 'vault_full' by its own. Storage refuses 'box_too_large' for a box heavier than one
   * record holds.
   *
   * Refuses 'stale_write' when another device or tab wrote, created or deleted this box first, or
   * deleted or made the vault anew: nothing was written, and its `meta.box_stored` is what stands
   * under the boxlabel. The next hello reads afresh, so calling again writes this whisper over what
   * stands. The vault's own limits count from the listing in hand, read no more than `staleMinutes`
   * ago.
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
      await this.#ensureLease(0)
      await this.#turn(async () => {
        const read = await this.#getBoxOrDamaged(label)
        // The lease, which holds the key and names the vault it opens, checked once the box is read:
        // the box is sealed under its key and lies under its vault_tok, which its write names.
        const lease = this.#checkUnlocked()
        const standing = read === null || read === 'damaged' ? read : Box.make(this, read, lease.vault_tok)
        // A store is one write, over a revision storage arbitrates. A box listed damaged naming none
        // could be cleared only by a delete before it, a second call another device's write could
        // fall between and be lost: the user deletes it, then stores.
        if (standing === 'damaged' && this.#isListedDamaged(label) && this.#listedRevisionOf(label) === null) { throw damagedBeyondNaming() }
        // A damaged box is overwritten as a fresh store: nothing in it can be carried forward.
        const prev = standing === 'damaged' ? null : standing
        this.#checkRoomFor(label, prev)
        // Lands only in the vault this whisper is sealed for, over the revision just read -- for a
        // damaged box, the one the listing names -- : a vault reborn elsewhere, or a box written
        // meanwhile by another device, refuses it. A damaged box the listing does not show yet is
        // written as over none, which storage refuses while it stands.
        const overRevision = standing === 'damaged' ? this.#listedRevisionOf(label) : prev?.revision_tok ?? null
        // The sidecar a store keeps from the box it replaces, when none is given, counts toward the
        // limit too: known once the plan has vouched for that box, and weighed before any key is made.
        const plan = await planSeal(lease, { boxlabel: label, whisperBytes, sidecar: givenSidecar, over: prev })
        this.#checkWhisperFits(plan.whisperBytes, plan.sidecar)
        const box = await sealPlanned(this, lease, plan)
        await this.#writeOver(box, { vault_tok: box.vault_tok, revision_tok: overRevision })
        this.#listWritten(box)
        this.#settle()
      })
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
   * `getWhisper()`. A lock, a `del()` or the lease ending while storage is read refuses
   * 'vault_locked', handing nothing back, unless an unlock has put a key back in hand meanwhile; a
   * `close()` refuses 'vault_closed'. The boxlabel is held to the floor alone, 'bad_label' below it:
   * the vault's boxlabel check gates only writes, so a name it refuses reads as any other.
   *
   * @example const box = await vault.getBox('anthropic_api_key')
   */
  async getBox(boxlabel: string): Promise<Box> { return valOf(await this.tryGetBox(boxlabel)) }

  /** The box under `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.getBox}. */
  async tryGetBox(boxlabel: string): Promise<Outcome<Box>> {
    try {
      return good(await this.#readBox(boxlabel, (box) => box))
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
      return good(await this.#readBox(boxlabel, (box, lease) => box.open(lease)))
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
      return good(await this.#turn(async () => {
        const lease = this.#checkUnlocked()
        // Made anew for this vault, its record checked once, by Box.make: a box opens under this
        // vault's scope, whichever it came from, and under the vault props it was read under; a
        // record, under those the lease opens.
        const held = box instanceof Box ? Box.make(this, box.record, box.vault_tok) : Box.make(this, box, lease.vault_tok)
        return valOf(await held.tryOpen(lease))
      }))
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
   * anew, elsewhere, nothing is removed, and the call refuses 'stale_write'; the next hello reads
   * afresh. Within that vault the delete wins: a revision another device or tab wrote meanwhile
   * is deleted all the same, and the logger warns. Deleted is gone: a later `putBox()` from a device
   * that never saw the delete is refused as stale.
   */
  async delBox(boxlabel: string): Promise<void> { valOf(await this.tryDelBox(boxlabel)) }

  /** Remove the box `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.delBox}. */
  async tryDelBox(boxlabel: string): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
      const label = Names.checkFloor('boxlabel', boxlabel)
      // Checked before the user is asked for anything: a call that cannot land never prompts.
      await this.#ensureLease(0, () => { this.#checkListed(label) })
      await this.#turn(async () => {
        this.#checkUnlocked()
        // Lands only in the vault this device holds keys for, whatever revision of the box stands:
        // a vault deleted and made anew elsewhere refuses it. The revision the listing shows only
        // lets storage say whether it removed that one or another.
        const expected = { vault_tok: this.#currentVaultProps().vault_tok, revision_tok: this.#listedRevisionOf(label) }
        const showedDamaged = this.#isListedDamaged(label)
        const { outcome } = await this.#vaultDB.delBox(this.#scope, label, expected)
        this.#unlist(label)
        this.#settle()
        // Storage arbitrates: nothing stood there to delete.
        if (outcome === 'absent') { throw absentBox() }
        if (outcome === 'deleted_other') {
          if (showedDamaged) {
            this.#logger.warn("The box this device showed was a damaged one, and the box deleted was not that record: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox', damaged: true })
          } else {
            this.#logger.warn("The box deleted was not the revision this device showed: another device or tab had written over it since. That write was deleted all the same.", { call: 'delBox' })
          }
        }
      })
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Vault: deleting and closing]: del, close

  /** Delete the vault: every record it has, in storage and on this device, as the vault half of deleting an account.
   * No tombstone is kept. It needs no unlock: an authenticated owner can always delete their own rows
   * server-side, so requiring one would only look like protection. It locks as `lock()` does, and
   * erases this device's mark. Writes with `VaultDB.delVault` and {@link DeviceDB.delMark}.
   *
   * It deletes only the vault this Vault object last read. If that one was deleted, or made anew,
   * elsewhere, storage keeps what stands there now, and the call refuses 'stale_write': the next
   * hello reads afresh, and a second `del()` deletes the vault it then finds. A Vault object that
   * holds no vault reads storage first, and deletes whatever stands: "delete my vault" never
   * reports success over a vault still standing.
   */
  async del(): Promise<void> { valOf(await this.tryDel()) }

  /** Delete the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.del}. */
  async tryDel(): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
      // A Vault object that holds no vault reads storage first: "delete my vault" must not report
      // success over one standing.
      await this.#hello(this.#holdsVault() ? this.#staleMillis : 0)
      await this.#turn(async () => {
        const doomed = this.#vaultProps
        // Vault props are forgotten only for an older copy refused (see #heedRefusal): delete nothing then, the mark least of all.
        if (doomed === UnreadVaultProps) { throw rolledBackHeldError() }
        this.#landLock()
        await this.#shutAndSay()
        if (doomed !== null) {
          await this.#vaultDB.delVault(this.#scope, { vault_tok: doomed.vault_tok })
        }
        // This device forgets the vault it had seen, too: one made later under this scope is another.
        valOf(await this.#deviceDB.delMark(this.#scope))
        this.#held = null
        this.#boxes = []
        this.#readAt = null
        this.#settle()
      })
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
    // Not a lock of the vault: nothing this device remembers is erased. The key goes once the turn
    // in flight has ended.
    void this.#turns(() => { this.#dropKey() })
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
  // How long before its askPassphraseAt a lease is in its twilight: still unlocked, but ensureLease
  // asks for a proof. The vault's staleMinutes, or none when that is as long as a lease itself.
  readonly #twilightMillis: number
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
    this.#twilightMillis = parsed.staleMillis < parsed.leaseMillis ? parsed.staleMillis : 0
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

  // == [State and snapshot]: held, vaultProps, lease, standingLease, listeners, snapshot, picture, settle

  // The vault props in hand, with the device mark that has seen them: set together, so the two
  // always name one vault. Null for no vault; UnreadVaultProps before storage's first answer.
  #held: HeldVault | null | typeof UnreadVaultProps = UnreadVaultProps
  /** The vault props in hand, as `#held` holds them. */
  get #vaultProps(): GatedVaultProps | null | typeof UnreadVaultProps {
    return this.#held === null || this.#held === UnreadVaultProps ? this.#held : this.#held.vaultProps
  }
  #boxes: readonly (BoxSummary | DamagedBox)[] = []
  // The lease this handle holds, opened: the one place it keeps the vaultKey. Dropping it locks.
  #lease: Lease | null = null
  #closed = false
  // The timer that queues the expiry's turn. Null when no lease is held, or the one held lasts
  // until lock().
  #pendingShut: ReturnType<typeof setTimeout> | null = null

  readonly #listeners = new Set<() => void>()
  #vaultState(): VaultState {
    if (this.#vaultProps === UnreadVaultProps) { return 'opening' }
    if (this.#vaultProps === null) { return 'absent' }
    return this.#standingLease() === null ? 'locked' : 'unlocked'
  }
  /** The lease in hand while it stands: held, and not ended by the clock read now. */
  #standingLease(): Lease | null {
    return this.#lease !== null && this.#stands(this.#lease) ? this.#lease : null
  }
  /** True while `lease` has not ended, by the clock read now. */
  #stands(lease: Lease): boolean { return ! lease.endsBy(this.#clockNow()) }
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
  // Whether the last read of storage succeeded, as the snapshot says; and whether the storage watch
  // has warned of a failing streak of reads it has not yet seen end.
  #syncing = true
  #watchWarned = false
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

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is written.
   * It keeps its identity, and tells nobody, until something really changed: useSyncExternalStore's
   * contract, and what spares React a render after a refresh that found nothing new.
   */
  #settle() {
    this.#shownProps = this.#vaultProps === UnreadVaultProps ? null : this.#vaultProps
    const next = this.#picture()
    // Trouble is told apart by identity, as two refusals of one kind read alike as JSON.
    if (next.trouble === this.#snapshot.trouble && stableJsonify({ ...next, trouble: null }) === stableJsonify({ ...this.#snapshot, trouble: null })) { return }
    this.#snapshot = next
    this.#listeners.forEach((listener) => { listener() })
  }
  // --

  // == [Turns]: turns, turn, readAt, isTimely, hello, read, takeRead, judgeLease, openKept, holdLease, watchStorage, watchRefresh

  // The vault's one queue. Every piece of work against the vault's fields -- a read, an unlock, a
  // change to the ways in, a box read or written, a lock, a delete, the expiry -- is a turn in it:
  // it awaits its I/O, judges what came back against what is in hand, and commits, alone. A turn
  // never queues another turn and awaits it.
  readonly #turns = pLimit(1)

  /** Run `work` as the vault's next turn, once every turn queued before it has ended; it refuses 'vault_closed' when the vault has closed by then. */
  #turn<ValT>(work: () => Promise<ValT>): Promise<ValT> {
    return this.#turns(async () => {
      this.#checkOpen()
      return await work()
    })
  }

  // When the last read of storage to succeed began, by the vault's clock: what a hello's
  // staleMinutes are counted from. Null when the next hello reads whatever its staleMinutes: before
  // the first read, after one that failed, and once storage has refused a write as stale or as not
  // to be trusted.
  #readAt: number | null = null

  /** True when the last read succeeded within `staleMillis` of now: what a hello settles on without reading. */
  #isTimely(staleMillis: number): boolean { return this.#readAt !== null && this.#clockNow() - this.#readAt < staleMillis }

  /** The hello every call awaits: one turn that reads storage unless the picture in hand is timely within `staleMillis`, and settles the snapshot either way.
   * The first starts the vault's watch on storage. A hello queued behind another's read finds its
   * picture timely, and reads nothing.
   */
  async #hello(staleMillis: number): Promise<void> {
    this.#checkOpen()
    this.#watchStorage()
    await this.#turn(async () => {
      if (! this.#isTimely(staleMillis)) { await this.#read() }
      this.#settle()
    })
  }

  /** One read of storage, judged and taken up. One that fails takes nothing up: the snapshot stands as it was, but for `syncing`, and the next hello reads afresh. */
  async #read() {
    try {
      await this.#takeRead()
    } catch (err) {
      this.#syncing = false
      this.#readAt = null
      this.#settle()
      throw err
    }
    if (! this.#watchWarned) { return }
    this.#watchWarned = false
    this.#logger.log('Storage reads again after the failures the vault warned of: what it shows has caught up with storage.', { call: 'refresh' })
  }

  /** The read turn's work: the strength checker loaded, and the vault, its listing, this device's lease and its mark read in one round; judged; committed at once.
   * The vault and its listing come from one `VaultDB.getVault`, so they agree as they come. A load
   * that fails refuses the read, taking nothing up; bad news the read met is still told. After the
   * commit, the mark is raised and a lease dropped or discarded is erased, each logged if it fails.
   */
  async #takeRead() {
    const readAt = this.#clockNow()
    const [loaded, round] = await Promise.allSettled([this.#strengthChecker.load(), this.#readRound()])
    if (loaded.status === 'rejected') {
      if (round.status === 'rejected') { this.#hearBadNews(round.reason) }
      throw loaded.reason
    }
    if (round.status === 'rejected') { throw round.reason }
    const [listed, keptLease, keptMark] = round.value
    // Gateless vault props have no way in to try: this vault reads them as no vault yet.
    const fresh = listed === null || ! isGated(listed.vaultProps) ? null : frozenVaultProps(listed.vaultProps)
    const markKept = this.#checkedMark(keptMark, 'refresh')
    const held = fresh === null ? null : { vaultProps: fresh, mark: await this.#judgedMark(fresh, markKept) }
    const judged = await this.#judgeLease(fresh, keptLease)
    const shown = this.#boxes
    const shownWayins = this.#wayinListOf(this.#shownProps)
    this.#held = held
    this.#boxes = listed === null || held === null ? [] : listed.boxes.map((box) => heldListing(box, held.vaultProps.vault_tok))
    this.#holdLease(judged.lease)
    this.#syncing = true
    this.#readAt = readAt
    // A read with no damaged box or way in clears the trouble: nothing amiss stands. The listing is
    // published before its news is told, so a handler reading the vault sees what it lists.
    const damagedWayins = this.#wayinListOf(fresh).filter((wayin) => wayin.isDamaged())
    if (this.#boxes.every((box) => ! box.damaged) && damagedWayins.length === 0) { this.#trouble = null }
    this.#settle()
    this.#tellListingNews(shown)
    this.#tellWayinNews(damagedWayins, shownWayins)
    if (held !== null) { await this.#raiseMark(markKept, held.mark, 'refresh') }
    if (judged.erase) { await this.#eraseLease(judged.why) }
  }

  /** The read turn's one round of I/O: the vault and its listing, this device's lease, and its mark, read all at once. */
  #readRound() {
    const leaseKept = valOfAnswer(this.#deviceDB.getLease(this.#scope))
    const markKept = valOfAnswer(this.#deviceDB.getMark(this.#scope))
    return Promise.all([this.#vaultDB.getVault(this.#scope), leaseKept, markKept])
  }

  /** The lease a read takes up against `fresh`, and whether the device store's lease is erased after it, with what it failed.
   * `kept`, the lease this device keeps, is taken up when it fits and opens (see `#openKept`). A
   * kept lease that does not is erased, and the lease in hand stays only while it is of `fresh` and
   * stands. With none kept -- another tab's `lock()` erased it -- the lease in hand stays alike.
   */
  async #judgeLease(fresh: GatedVaultProps | null, kept: LeaseRecord | null): Promise<{ lease: Lease | null, erase: boolean, why: VaultError | null }> {
    const inHand = this.#lease
    const stays = inHand !== null && fresh !== null && inHand.vault_tok === fresh.vault_tok && inHand.gate_epoch === fresh.gate_epoch && this.#stands(inHand) ? inHand : null
    if (kept === null) { return { lease: stays, erase: false, why: null } }
    const opened = await this.#openKept(kept, fresh, stays)
    if (opened instanceof Lease) { return { lease: opened, erase: false, why: null } }
    return { lease: stays, erase: true, why: opened }
  }

  /** `kept`, this device's lease, opened against `fresh` when it fits; otherwise the refusal it met, or null when it simply no longer fits.
   * It fits when it is of `fresh`'s `vault_tok` and `gate_epoch`, stands, and ends within this
   * Vault object's `leaseHours` from now: lowering `leaseHours` has each device ask again at its
   * next read, and raising it lengthens no lease already granted. A record that is no lease, or one
   * that will not open, is the refusal. The grant `stays`, the lease in hand, is it already opened.
   */
  async #openKept(kept: LeaseRecord, fresh: GatedVaultProps | null, stays: Lease | null): Promise<Lease | VaultError | null> {
    if (fresh === null) { return null }
    const made = await outcomeOf(() => Lease.make(this, kept), unexpectedError)
    if (! made.ok) { return made.err }
    if (stays !== null && isSameGrant(made.val.record, stays.record)) { return stays }
    if (! made.val.endsBy(this.#clockNow() + this.#leaseMillis)) { return null }
    const opened = await made.val.tryOpen(fresh)
    if (! opened.ok) { return opened.err.refusalkind === 'vault_locked' ? null : opened.err }
    return opened.val
  }

  /** Hold `lease` as the vault's lease, or none: what every turn that grants, takes up or drops a lease commits. Its expiry is armed anew only for a new deadline. */
  #holdLease(lease: Lease | null) {
    if (lease === null) {
      this.#dropKey()
      return
    }
    const rearm = this.#lease?.ask_passphrase_at !== lease.ask_passphrase_at
    this.#lease = lease
    if (rearm) { this.#armExpiry(lease.ask_passphrase_at) }
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

  // A ring of the watch is a hello that reads, so boxes written elsewhere (another tab, the
  // inspector's reset button) show without a call. Its failure has nobody to throw to: it leaves the
  // snapshot standing, tells any bad news it met, and warns once for a failing streak; the next
  // read that succeeds says so once.
  async #watchRefresh() {
    if (this.#closed) { return }
    const { ok, err } = await outcomeOf(() => this.#hello(0), unexpectedError)
    if (ok) { return }
    this.#hearBadNews(err)
    if (this.#watchWarned) { return }
    this.#watchWarned = true
    this.#logger.warn('Storage rang with a change the vault could not read, so what it shows may lag behind storage (syncing: false). It says nothing more of this until a read succeeds; its next call meets the same trouble, and throws it.', { call: 'refresh' }, err)
  }
  // The adapter's watch on the vault, which the first hello starts and close() ends, and whether
  // it was begun.
  #unsubscribeDB: (() => void) | null = null
  #watching = false
  // --

  // == [Mark]: checkedMark, judgedMark, markSeeing, raiseMark, heldMark

  /** `kept`, the mark the deviceDB handed back, when it passes its check and is of this scope; otherwise none, and the logger says so. */
  #checkedMark(kept: unknown, call: VaultCall): DeviceMark | null {
    if (kept === null) { return null }
    const checked = DeviceMark.safeParse(kept)
    if (checked.success && Names.sameScope(checked.data, this.#scope)) { return checked.data }
    this.#logger.warn("This device's mark of the newest copy of the vault it had seen could not be read, so it starts again from the copy storage holds now.", { call })
    return null
  }

  /** This device's mark once it has seen `fresh`, vault props storage just handed back, judged against `kept`, the mark read beside them: older ones refuse 'rolled_back'.
   * Older means of the vault the mark, or the vault props in hand, name, at a lower `gate_epoch`.
   * Nothing is taken from them, and the vault locks. A vault the mark has not seen is marked under
   * `deviceId`.
   */
  async #judgedMark(fresh: GatedVaultProps, kept: DeviceMark | null, deviceId: string = randomId()): Promise<DeviceMark> {
    // The gate epoch is bound into nothing a way in opens with, so older vault props pass every
    // check but this one.
    const older = [kept, this.#heldMark()].some((mark) => mark?.seen.vault_tok === fresh.vault_tok && fresh.gate_epoch < mark.seen.gate_epoch)
    if (older) {
      const refusal = new VaultError('rolled_back', "This device has already seen a newer copy of this vault than storage offers now, so it won't use this one, and the vault locked: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it by forgetting what it saw of the vault (its deviceDB's delMark) and opening the vault again; otherwise the app's support should look at its storage.")
      // Storage that hands back an older copy is not to be trusted with an unlocked vault.
      await this.#heedRefusal(refusal)
      throw refusal
    }
    return this.#markSeeing(kept, fresh, deviceId)
  }

  /** The mark that has seen `kept`'s vault and `fresh`: each epoch the higher, or `kept` itself when nothing is raised.
   * It keeps the `device_id` `kept` has for that vault; a vault it has not seen gets `deviceId`.
   */
  #markSeeing(kept: DeviceMark | null, fresh: GatedVaultProps, deviceId: string = randomId()): DeviceMark {
    const seen = kept?.seen.vault_tok === fresh.vault_tok ? kept.seen : null
    if (kept !== null && seen !== null && seen.gate_epoch >= fresh.gate_epoch) { return kept }
    return {
      format: MarkFormat,
      ...this.#scope,
      seen:   {
        device_id:  seen?.device_id ?? deviceId,
        vault_tok:  fresh.vault_tok,
        gate_epoch: Math.max(seen?.gate_epoch ?? 0, fresh.gate_epoch),
      },
    }
  }

  /** Write `mark` to the device store when it is not `kept`, what it was raised from: a turn does this after its commit, and a store that fails it is warned of, the mark held in memory as raised. */
  async #raiseMark(kept: DeviceMark | null, mark: DeviceMark, call: VaultCall) {
    if (mark === kept) { return }
    try {
      valOf(await this.#deviceDB.putMark(mark))
    } catch (err) {
      this.#logger.warn("This device could not note the vault as it now stands in its mark of the vault: what it holds stands, and the mark catches up at a later read.", { call }, asError(err))
    }
  }

  /** The mark held with the vault props in hand; null when none are held. */
  #heldMark(): DeviceMark | null { return this.#held === null || this.#held === UnreadVaultProps ? null : this.#held.mark }
  // --

  // == [Guards]: checkOpen, leaseInHand, currentHeld, currentVaultProps

  #checkOpen() {
    if (this.#closed) { throw closedError() }
  }

  /** The lease a turn that touches a secret works under: the one in hand while it stands, checked within the turn before the lease is used.
   * Past `askPassphraseAt` it drops the lease and refuses 'vault_locked', whatever any timer has done.
   */
  #checkUnlocked(): Lease {
    const lease = this.#standingLease()
    if (lease !== null) { return lease }
    this.#dropKey()
    this.#settle()
    throw lockedError()
  }

  /** The vault props in hand, with their mark: 'absent_vault' when there are none. */
  #currentHeld(): HeldVault {
    if (this.#held === UnreadVaultProps || this.#held === null) {
      throw new VaultError('absent_vault', 'This vault has not been created yet: the first unlock() creates it.')
    }
    return this.#held
  }

  #currentVaultProps(): GatedVaultProps { return this.#currentHeld().vaultProps }

  /** True when the vault holds vault props, as of its last read. */
  #holdsVault(): boolean { return this.#held !== null && this.#held !== UnreadVaultProps }
  // --

  // == [Asking for a proof]: asking, ensureLease, whyAsk, raiseAsk, landLock, tryAttempt, unlockWith

  // The prompt up now, if any: every call that needs the vault unlocked while it is up waits on its
  // one answer. See ensureLease().
  #asking: RaisedAsk | null = null

  /** The vault, unlocked: at once while the lease stands past `renewMillis` from now, otherwise once the prompt answers.
   * The prompt is the one up, or one raised now. See {@link Vault.ensureLease}. `beforeAsking` runs
   * only when the vault must ask, after the hello and before any prompt: a call checks there what
   * it can know without the key, so a call that cannot land never prompts.
   */
  async #ensureLease(renewMillis: number, beforeAsking?: () => void): Promise<Vault> {
    await this.#hello(this.#staleMillis)
    const why = this.#whyAsk(renewMillis)
    if (why === null) { return this }
    beforeAsking?.()
    const answer = valOf(await (this.#asking ?? this.#raiseAsk(why)).answer)
    if (answer === 'declined') { throw declinedError(this.#getProof !== null) }
    // Unlocked, or carrying on under the lease: either way a lease stands now, or the call refuses.
    this.#checkUnlocked()
    return this
  }

  /** Why the vault must ask for a proof now: null while it is unlocked past `renewMillis` from now, and past its twilight. */
  #whyAsk(renewMillis: number): AskWhy | null {
    if (this.#vaultProps === null) { return 'absent' }
    const lease = this.#standingLease()
    if (lease === null) { return 'locked' }
    return lease.endsBy(this.#clockNow() + Math.max(renewMillis, this.#twilightMillis)) ? 'lease_ending' : null
  }

  /** Raise a prompt for `why`, up until it is answered or a lock lands: 'vault_closed', asking nobody, once the vault has closed. */
  #raiseAsk(why: AskWhy): RaisedAsk {
    this.#checkOpen()
    const raised = Ask[raiseAsk](why, this, (givenProof, promptOver) => this.#tryAttempt(givenProof, promptOver), this.#getProof)
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

  /** An ask's `attempt`: one proof's unlock, as an Outcome, refused once `promptOver` is aborted by the time its turn starts. */
  async #tryAttempt(givenProof: string | PasskeyAnswer, promptOver: AbortSignal): Promise<Outcome<Vault>> {
    try {
      await this.#unlockWith(givenProof, promptOver)
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Unlock with one proof, as `unlock()` and an ask's `attempt` do: a hello, then one turn that proves it and grants a lease.
   * It creates the vault when absent. The turn writes the lease with {@link DeviceDB.putLease}
   * before it commits it, so a device store that refuses refuses the unlock. An attempt whose
   * prompt ended (`promptOver`) while it waited for its turn unlocks nothing.
   */
  async #unlockWith(givenProof: string | PasskeyAnswer, promptOver?: AbortSignal): Promise<void> {
    this.#checkOpen()
    const proof = Proof.parse(this, givenProof)
    await this.#hello(this.#staleMillis)
    await this.#turn(async () => {
      if (promptOver?.aborted === true) {
        throw new VaultError('vault_locked', 'The prompt ended before this proof could be checked -- a lock landed, or it was answered -- and its end wins: nothing was unlocked. Ask again when the user wants the vault.')
      }
      const unlocked = await this.#settleUnlock(proof)
      const lease = await Lease.grant(this, unlocked.standing, unlocked)
      valOf(await this.#deviceDB.putLease(lease.record))
      this.#holdLease(lease)
      this.#settle()
    })
  }
  // --

  // == [Unlock and ways in]: unwrapWith, draftVaultProps, settleUnlock, makeVault, reviseWayins, regrant

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

  /** Brand-new vault props around a brand-new vaultKey, their one way in `passphrase`'s, sealed under `deviceId`.
   * The vaultKey is not handed back: the vault takes it out of the way in as stored, as any unlock
   * does.
   */
  async #draftVaultProps(passphrase: PassphraseProof, deviceId: string): Promise<GatedVaultProps> {
    const vaultTok = randomId()
    const registeredAt = this.#clockNow()
    const wayin = await Wayin.seal(this, vaultTok, passphrase, deviceId, await makeVaultKey())
    return {
      format:              'safebyok-vault-v6',
      ...this.#scope,
      vault_tok:           vaultTok,
      registered_at:       registeredAt,
      gate_epoch:          1,
      passphrase:          wayin.record,
      passkey:             null,
    }
  }

  /** The vaultKey for an unlock, and the vault props it was proven against: those in hand, or, on an absent vault, those `#makeVault` settles on. */
  async #settleUnlock(proof: Proof): Promise<{ standing: GatedVaultProps } & VaultKeyPair> {
    const held = this.#vaultProps
    if (held !== null && held !== UnreadVaultProps) { return { standing: held, ...await this.#unwrapWith(held, proof) } }
    const { settled, madeHere } = await this.#makeVault(proof)
    try {
      return { standing: settled, ...await this.#unwrapWith(settled, proof) }
    } catch (err) {
      if (! madeHere && isVaultError(err, 'wrong_passphrase')) {
        throw new VaultError('created_elsewhere', 'A vault was just created for this label on another device, with a different passphrase than the one you entered. Nothing was created on this device. Enter the passphrase you chose there to unlock it.', { cause: err })
      }
      throw err
    }
  }

  /** The vault props storage settles on for a first unlock's passphrase, committed: this device's own, or another device's made meanwhile.
   * Only a passphrase creates, and it must pass the strength check as a new passphrase; a passkey's
   * answer refuses 'absent_vault'. Another device's vault is committed as `ensureVaultProps` handed
   * it back, with no listing, so the next hello reads it.
   */
  async #makeVault(proof: Proof): Promise<{ settled: GatedVaultProps, madeHere: boolean }> {
    if (! (proof instanceof PassphraseProof)) {
      throw new VaultError('absent_vault', 'This vault has not been created yet, so no passkey opens it: the first unlock(), with a passphrase, creates it.')
    }
    await proof.checkStrongEnough()
    const deviceId = randomId()
    const draft = await this.#draftVaultProps(proof, deviceId)
    const [ensured, keptMark] = await Promise.all([this.#vaultDB.ensureVaultProps(draft), valOfAnswer(this.#deviceDB.getMark(this.#scope))])
    // Gateless vault props made elsewhere hold no way in for this passphrase to open.
    if (! isGated(ensured)) { throw gatelessElsewhereError() }
    const settled = frozenVaultProps(ensured)
    const madeHere = settled.vault_tok === draft.vault_tok
    const markKept = this.#checkedMark(keptMark, 'unlock')
    const mark = await this.#judgedMark(settled, markKept, deviceId)
    // Committed at once: the vault stands in storage now, whatever the unlock meets next.
    this.#held = { vaultProps: settled, mark }
    this.#boxes = []
    if (! madeHere) { this.#readAt = null }
    this.#settle()
    await this.#raiseMark(markKept, mark, 'unlock')
    return { settled, madeHere }
  }

  /** Rewrite the vault's ways in, proven by `proof`, the standing passphrase, resolving the vault props as stored.
   * Every change to the ways in goes through here: a hello, then one turn. It proves `proof` against
   * the vault props in hand, and writes the ways in `plan.revise` makes under the next gate epoch,
   * only if no other device changed them meanwhile; a stale write refuses 'stale_write', and the
   * next hello reads afresh. It then grants this device a lease under them, from now. `plan.check`
   * runs first, on the standing vault props, so a change refused for what it asks costs no key
   * derivation.
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
    await this.#hello(this.#staleMillis)
    return await this.#turn(async () => {
      const { vaultProps: standing, mark } = this.#currentHeld()
      plan.check?.(standing)
      const proven = await this.#unwrapWith(standing, proof)
      const next = frozenVaultProps({
        ...standing,
        gate_epoch:       standing.gate_epoch + 1,
        ...await plan.revise(standing, proven, mark.seen.device_id),
      })
      await withoutStoredVaultProps(this.#vaultDB.putVaultProps(next, { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch }))
      // The change has landed, whatever happens now: what follows is this device's own, and a
      // failure of it is said through the logger, never thrown as though the change had not landed.
      const lease = await this.#regrant(proven, next, plan.call)
      const raised = this.#markSeeing(mark, next)
      this.#held = { vaultProps: next, mark: raised }
      this.#holdLease(lease)
      this.#settle()
      await this.#raiseMark(mark, raised, plan.call)
      return next
    })
  }

  /** A lease granted under `next`, vault props this device just wrote, and written to the device store; null, warned of, when that fails. */
  async #regrant(proven: VaultKeyPair, next: GatedVaultProps, call: VaultCall): Promise<Lease | null> {
    try {
      const lease = await Lease.grant(this, next, proven)
      valOf(await this.#deviceDB.putLease(lease.record))
      return lease
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not keep a lease under it: the vault is locked here, and asks for the passphrase at its next call.", { call }, asError(err))
      return null
    }
  }
  // --

  // == [Locking and expiry]: shut, shutAndSay, heedRefusal, forgetVaultProps, dropKey, armExpiry, expire, eraseLease

  /** Forget the unlock, in memory and on this device: every lock goes through here. */
  async #shut() {
    this.#dropKey()
    valOf(await this.#deviceDB.delLease(this.#scope))
  }

  /** `#shut`, and the snapshot published even when the device store fails: the key is dropped at once. */
  async #shutAndSay() {
    try {
      await this.#shut()
    } finally {
      this.#settle()
    }
  }

  /** Do what a storage refusal says of the vault, within the turn that met it, before it is thrown.
   * A stale write, or storage not to be trusted as it stands, has the next hello read afresh. As
   * the refusal policy says, a user no longer signed in, or an older copy of the vault, locks the
   * vault, as `lock()` does. A device store that will not erase the lease is only logged, as the
   * refusal is what the caller must hear.
   */
  async #heedRefusal(refusal: VaultError) {
    if (isStaleKind(refusal) || UntrustedStorageKinds.some((kind) => isVaultError(refusal, kind))) { this.#readAt = null }
    if (RefusalPolicy.decide(refusal) !== 'lock') { return }
    const why = refusal.refusalkind === 'rolled_back'
      ? 'Storage handed back an older copy of the vault than this device has seen'
      : 'Storage no longer serves the user this vault was opened for -- signed out, or another user signed in --'
    const wasUnlocked = this.#lease !== null
    // An older copy refused, the vault props in hand are forgotten too: the next hello takes up what
    // storage holds, once the host has accepted it (see the class doc).
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

  /** Forget the vault props in hand, as though storage had not been read, with their mark and their boxes. */
  #forgetVaultProps() {
    this.#held = UnreadVaultProps
    this.#boxes = []
    this.#readAt = null
  }

  /** Forget the unlock in memory, and the timer left to do so. */
  #dropKey() {
    this.#cancelPendingShut()
    this.#lease = null
  }

  #cancelPendingShut() {
    if (this.#pendingShut === null) { return }
    clearTimeout(this.#pendingShut)
    this.#pendingShut = null
  }

  /** Arm the one expiry timer for a lease ending at `deadline`, in place of any pending: it queues the expiry's turn at `deadline`; none for a lease that lasts until `lock()`. */
  #armExpiry(deadline: number) {
    this.#cancelPendingShut()
    if (isFarFuture(deadline)) { return }
    this.#pendingShut = unrefTimeout(() => { void this.#turns(() => { this.#expire(deadline) }) }, deadline - this.#clockNow())
  }

  /** The expiry's turn: drop the lease in hand when it still ends at `deadline`, the one its timer was armed for, and say so. It reads no clock. */
  #expire(deadline: number) {
    if (this.#lease?.ask_passphrase_at !== deadline) { return }
    this.#dropKey()
    this.#settle()
  }

  /** Erase this device's lease, dropped by a read or failing as `why` says (null for one that no longer fits), after the commit.
   * A lease that would not read or open is warned of once erased, so the warning never claims a
   * discard that failed; one that no longer fits is routine. Neither the record nor what it failed
   * is told: the record holds key material. A device store that fails is warned of.
   */
  async #eraseLease(why: VaultError | null) {
    try {
      valOf(await this.#deviceDB.delLease(this.#scope))
    } catch (err) {
      this.#logger.warn("This device's lease no longer opens the vault, but could not be erased: the next read tries again.", { call: 'hello' }, asError(err))
      return
    }
    if (why === null) { return }
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
   * extra read. A replacement always passes.
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

  // == [Reading boxes]: listedRevisionOf, isListedDamaged, checkListed, getBoxOrDamaged, readBox

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

  /** The record of the box under `boxlabel`; null when there is none, and 'damaged' when storage refuses it as 'damaged_box'. */
  async #getBoxOrDamaged(boxlabel: string): Promise<BoxRecord | 'damaged' | null> {
    try {
      return await this.#vaultDB.getBox(this.#scope, boxlabel)
    } catch (err) {
      if (! isVaultError(err, 'damaged_box')) { throw err }
      return 'damaged'
    }
  }

  /** What `use` makes of the box under `boxlabel` and the lease it opens under, once the vault is unlocked for it: one turn, after `ensureLease`. */
  async #readBox<ValT>(boxlabel: string, use: (box: Box, lease: Lease) => Promise<ValT> | ValT): Promise<ValT> {
    this.#checkOpen()
    const label = Names.checkFloor('boxlabel', boxlabel)
    // Checked before the user is asked for anything: a call that cannot land never prompts.
    await this.#ensureLease(0, () => { this.#checkListed(label) })
    return await this.#turn(async () => {
      // 'damaged_box', as storage refuses it, for a record that fails its checks.
      const record = await this.#vaultDB.getBox(this.#scope, label)
      if (record === null) { throw absentBox() }
      const lease = this.#checkUnlocked()
      return await use(Box.make(this, record, lease.vault_tok), lease)
    })
  }
  // --

  // == [Writing boxes]: writeOver, refusePutBox, listWritten, unlist

  /** Write `box` over `expected`, as `putBox()` does: one write, which storage refuses unless the revision `expected` names still stands.
   * Storage's 'invalid_box' becomes 'bad_record', as this vault sealed the box; its 'vault_mismatch'
   * becomes 'stale_write'. A stale box write refuses as it came, its `meta.box_stored` what stands.
   */
  async #writeOver(box: Box, expected: BoxExpectation): Promise<void> {
    try {
      await this.#vaultDB.putBox(this.#scope, expected, box.record)
    } catch (err) {
      if (isVaultError(err, 'invalid_box')) {
        throw new VaultError('bad_record', 'Storage refused the box this vault sealed as one this package would not build, so nothing was written. This is a bug: report it, with this error.', { cause: err })
      }
      if (isVaultError(err, 'vault_mismatch')) {
        throw new VaultError('stale_write', 'The vault changed in storage while this device was storing into it -- deleted, or made anew, elsewhere -- so nothing was written. The vault reads storage afresh at its next call: call putBox() again if this whisper should still be stored.', { cause: err })
      }
      throw err
    }
  }

  /** List `box`, just written, in place of what the listing showed under its boxlabel, in the listing's order. */
  #listWritten(box: Box) {
    const summary: BoxSummary = Object.freeze({ ...box.toJSON(), damaged: false })
    this.#boxes = [...this.#boxes.filter((listed) => listed.boxlabel !== box.boxlabel), summary].toSorted((one, two) => byCodeUnit(one.boxlabel, two.boxlabel))
  }

  /** Take the box under `boxlabel` out of the listing: storage holds none there now. */
  #unlist(boxlabel: string) {
    this.#boxes = this.#boxes.filter((listed) => listed.boxlabel !== boxlabel)
  }
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
    this.#settle()
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
      this.#settle()
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
    this.#settle()
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

// == [Refusals]: damagedBeyondNaming, lockedError, declinedError, closedError, gatelessElsewhereError, rolledBackHeldError, withoutStoredVaultProps

const damagedBeyondNaming = () => new VaultError('damaged_box', "That box is damaged beyond naming: its stored record does not say which revision it is, so nothing can be written over it safely. Nothing was written. Remove it with delBox() first, then store its whisper again.")

const lockedError = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call again, and the vault asks for a proof through getProof, or unlock it first.')

/** The refusal of a call whose ask was declined: by the user, or for want of a `getProof` to ask. */
const declinedError = (asked: boolean) => new VaultError('vault_locked', asked
  ? 'The vault is locked, and the user declined to unlock it: nothing was read or written. Ask again when they want the vault.'
  : 'The vault is locked, and there is no getProof to ask the user for a proof (Vault.make was given none): nothing was read or written. Prompt the user, unlock() with their passphrase, and call again.')

const closedError = () => new VaultError('vault_closed', 'This vault handle was closed: make another with Vault.make.')

/** What `writing` resolves, or its refusal with the vault props a stale write names stripped: a vault's refusal carries no stored vault props record. */
const withoutStoredVaultProps = async (writing: Promise<void>): Promise<void> => {
  try {
    await writing
  } catch (err) {
    if (! isVaultError(err, 'stale_write') || err.meta?.vault_props_stored === undefined) { throw err }
    // Not the VaultDB's message, which sends the reader to a meta this refusal does not carry.
    throw new VaultError(err.refusalkind, StaleWayinsMessage, err.cause === undefined ? {} : { cause: err.cause })
  }
}

/** The refusal of a `del()` whose turn finds the vault props forgotten, as a read just refused an older copy of the vault. */
const rolledBackHeldError = () => new VaultError('rolled_back', "This device just found an older copy of this vault in storage than it has seen, so it deleted nothing, and kept its mark of the vault. If storage was restored from an older copy on purpose, have this device accept it (its deviceDB's delMark), open the vault again, then delete it.")

/** What a change to the ways in says when storage refuses it as stale. */
const StaleWayinsMessage = "The vault changed in storage since this device read it -- its ways in were changed, or it was deleted or made anew, elsewhere -- so this change was refused and nothing was written. Read the vault again before retrying."

/** The refusal of a first unlock that met gateless vault props another device made: no passphrase is set there to open. */
const gatelessElsewhereError = () => new VaultError('created_elsewhere', 'A vault was just made for this label on another device, which has not set its passphrase yet. Nothing was created on this device. Set the passphrase on that device, then unlock with it here.')
// --

// == [Vocabulary]: frozenVaultProps, isSameGrant, valOfAnswer, MarkFormat, VaultCall, UntrustedStorageKinds, isStaleKind

/** A copy of `props`, frozen through its ways in: the vault props the vault holds, which no host can write to. */
const frozenVaultProps = (props: GatedVaultProps): GatedVaultProps => Object.freeze({
  ...props,
  passphrase: frozenRecord(props.passphrase),
  passkey:    props.passkey === null ? null : frozenRecord(props.passkey),
})

/** The ways in of vault props, as a change to them writes them anew. */
type StandingWayins = Pick<GatedVaultProps, 'passphrase' | 'passkey'>

/** True when `kept` and `held` are one grant of a lease: the same deadline, and the same vaultKey wrapped under the same leaseKey, which no two grants share. */
const isSameGrant = (kept: LeaseRecord, held: LeaseRecord): boolean => (
  kept.ask_passphrase_at === held.ask_passphrase_at && kept.vault_tok === held.vault_tok && kept.gate_epoch === held.gate_epoch
  && kept.vault_key_lease_wrapped.cipher_iv_b64 === held.vault_key_lease_wrapped.cipher_iv_b64
  && kept.vault_key_lease_wrapped.ciphertext_b64 === held.vault_key_lease_wrapped.ciphertext_b64
)

/** What `answer`, a device store's Outcome, resolves to: its `val`, or its refusal thrown. */
const valOfAnswer = async <ValT>(answer: Promise<Outcome<ValT>>): Promise<ValT> => valOf(await answer)

/** The device mark's format, as each mark carries it. */
const MarkFormat = 'safebyok-mark-v5'

/** The vault call, or the moment, a logger's story names: where what it hears happened. */
type VaultCall = 'make' | 'hello' | 'refresh' | 'unlock' | 'del' | 'untrustedStorage'
  | 'putWayin' | 'delWayin' | 'putBox' | 'delBox' | 'getBox'

/** The refusals that say storage cannot be trusted as it stands: 'identity_revoked' and 'rolled_back', which lock the vault, and 'newer_format'.
 * Each asks something of the caller that a stale write does not: the user to sign in again,
 * storage to be looked at, or the app to be updated. Each has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'rolled_back', 'newer_format'] as const satisfies readonly RefusalKind[]

/** True for a write's refusal that says storage moved under it, after which the next hello reads afresh: 'stale_write', or a box write's 'vault_mismatch'. */
const isStaleKind = (err: unknown): err is VaultError => isVaultError(err, 'stale_write') || isVaultError(err, 'vault_mismatch')
// --

// == [Argument parsers]: eventHint, checkHelloOpts, checkEnsureLeaseOpts, checkStoreOpts, sidecarOf, standingPassphraseOf, newProofOf, absentBox

/** What a call that takes options most likely had in place of its bag, and what to do: an event, as `call` was handed to `addEventListener` or `onClick` itself. */
const eventHint = (call: 'hello' | 'ensureLease', tried: 'tryHello' | 'tryEnsureLease') => `${call}() was handed something other than a bag of options: an event, most likely, as ${call} was handed to addEventListener or onClick as the handler itself. Wrap it: \`() => vault.${tried}()\`, whose refusal, being returned, never surfaces as an unhandled rejection.`

/** What `hello()`'s options may hold: `staleMinutes`, which `parseStaleMinutes` checks, and nothing else. */
const checkHelloOpts = optionsCheck({ staleMinutes: Z.optional(Z.unknown()) }, "hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage: check its spelling, and leave out any other.", eventHint('hello', 'tryHello'))

/** What `ensureLease()`'s options may hold: `renewMinutes`, which `parseRenewMinutes` checks, and nothing else. */
const checkEnsureLeaseOpts = optionsCheck({ renewMinutes: Z.optional(Z.unknown()) }, "ensureLease()'s only option is `renewMinutes`, how many minutes before the lease ends to ask for a proof anyway: check its spelling, and leave out any other.", eventHint('ensureLease', 'tryEnsureLease'))

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
