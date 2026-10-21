import * as Z from 'zod/mini'
import { type Capacity, type Clock, type VaultScope, BoxSummary, type DamagedBox, type PasskeyWayinSummary, type PassphraseWayinSummary, type PasskeyAnswer, type WayinSummary, Whisper, Sidecar, VaultProps, DeviceMark, MinuteMillis, FarFuture, FarPast } from './types'
import { Box, type BoxRecord, EmptySidecarJson, checkedBoxRecord, checkedSidecar, heldListing, planSeal, sealPlanned, whisperBytesOf } from './box'
import * as Names from './names'
import { optionsCheck } from './options'
import { VaultError, isVaultError, type RefusalKind } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { makeVaultKey, randomId } from './crypto'
import { Wayin, frozenRecord, type PasskeyWayin, type PassphraseWayin, type VaultKeyPair } from './wayin'
import { Proof, PassphraseProof, PasskeyProof, checkSaltShape } from './proof'
import { stableJsonify } from './stable-jsonify'
import { oneAtATime } from './one-at-a-time'
import { jsonBytes, type BoxExpectation } from './vault-db'
import { type VaultLogger, asError } from './logger'
import * as RefusalPolicy from './refusal-policy'
import type { GuardedStrengthChecker, PassphraseVerdict } from './passphrase-strength'
import { type BadNewsHandler, type MakeVaultOpts, parseMakeVaultOpts, parseRenewMinutes, parseStaleMinutes, readClock, StoredBytesPerWhisperByte, BoxFixedBytes } from './vault-opts'
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
  /** The stored vault's id, minted when it was made. */
  vault_id:        string | null
  /** When the stored vault was made, in epoch milliseconds. */
  registered_at:   number | null
  /** Up by one on every change to the ways in, which sends every other device back to `locked`. */
  unlock_epoch:    number | null
  /** Which vaultKey the ways in wrap: always 1, reserved for a rotation not yet built. */
  vault_key_epoch: VaultProps['vault_key_epoch'] | null
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
 * deviceDB: `lock()` leaves it, `del()` erases it). Any read of vault props older than that mark,
 * at a lower unlock epoch or vaultKey epoch, refuses 'rolled_back', taking nothing from them and
 * writing nothing: older vault props could bring back a way in that was removed. It locks the
 * vault, as 'identity_revoked' from storage does, and leaves the Vault object holding no vault
 * props, its state `opening`. A host that restored storage from an older copy on purpose accepts
 * it on this device by erasing the mark (`valOf(await deviceDB.delMark(scope))`) and calling
 * `hello()` again. A Vault object that goes on refusing changes to the ways in as 'stale_write'
 * after a restore, or after its device mark could not be written, is to be closed, and a new one
 * made.
 *
 * Storage alone settles a race. When it refuses a write as stale, or a box will not open, the
 * vault catches up with storage once before it names the refusal. A vault deleted, made anew, or
 * with its ways in changed elsewhere then relocks this device. A catch-up that fails leaves the
 * snapshot `syncing: false`, and the write refuses 'stale_write', that failure its cause; but an
 * 'identity_revoked', 'rolled_back' or 'newer_format' comes as it came.
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
  // == [Vault: fields]: applabel, user_id, vaultlabel, vault_id, registered_at, unlock_epoch, vault_key_epoch, passphrase, passkey, state, boxes, capacity, askPassphraseAt, trouble, syncing, snapshot, getSnapshot, subscribe, leaseMillis, logger, clock, keyDeriver

  // Each field reads the snapshot `#settle()` last published, so the fields and the snapshot always
  // agree. A getter with no setter: a host cannot write over one, and the vault never reads one back:
  // nor do its boxes, which read only the scope, fixed for the handle's life, and take the vault
  // props they lie under from the vault at each call.

  /** The scope's app: where the vault is found. Fixed for the Vault object's life. */
  get applabel(): string { return this.#snapshot.applabel }
  /** The signed-in user the vault is found under. Fixed for the Vault object's life. */
  get user_id(): string { return this.#snapshot.user_id }
  /** The vault's own label within the app. Fixed for the Vault object's life. */
  get vaultlabel(): string { return this.#snapshot.vaultlabel }
  /** The stored vault's id; null until a read finds a vault. */
  get vault_id(): string | null { return this.#snapshot.vault_id }
  /** When the stored vault was made, in epoch milliseconds; null until a read finds a vault. */
  get registered_at(): number | null { return this.#snapshot.registered_at }
  /** Up by one on every change to the ways in, which sends every other device back to `locked`; null until a read finds a vault. */
  get unlock_epoch(): number | null { return this.#snapshot.unlock_epoch }
  /** Which vaultKey the ways in wrap: always 1, reserved; null until a read finds a vault. */
  get vault_key_epoch(): VaultProps['vault_key_epoch'] | null { return this.#snapshot.vault_key_epoch }
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
  /** The vault's clock, checked: each reading is the host's clock's, held to epoch milliseconds.
   * A reading that fails drops the vaultKey before it throws, as the vault's own readings do.
   */
  get clock(): Clock { return this.#checkedClock }
  /** The key deriver the vault was made with, which its ways in derive through. */
  get keyDeriver(): KeyDeriver { return this.#keyDeriver }
  // --

  // == [Vault: opening]: hello, ensureLease

  /** Read storage and settle the vault as `absent`, `locked` or `unlocked`, resolving the vault.
   * Never prompts. Optional: every call that reads storage awaits a first hello. Call it again to
   * refresh: within `opts.staleMinutes` of the last read it re-settles without reading, unless what
   * it read may no longer stand (a read failed, storage was not to be trusted, or the vault was
   * deleted). Reads `VaultDB.getVaultProps`, `VaultDB.listBoxes` and {@link DeviceDB.getLease};
   * the first hello also starts the vault's watch, `VaultDB.subscribe`.
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

  /** Have the vault unlocked, asking `getProof` for a proof only when it must, resolving the vault.
   * Every call that needs a whisper goes through it; call it yourself to unlock ahead of time, on a
   * button. Once it resolves, the vault is unlocked under a lease that stands. It awaits a hello
   * first. Unlocked, with the lease not ending within `opts.renewMinutes` (0 when left out), it
   * resolves at once, with no prompt and no write. Otherwise it hands an {@link Ask} to `getProof`
   * and waits for its answer; a call that finds a prompt up waits on that same one.
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
   * one key derivation (about half a second with the browser's deriver). Reads storage afresh, and
   * writes the lease with {@link DeviceDB.putLease}.
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
   * vault now shows `locked`. A vault deleted, made anew, or with its ways in changed while the
   * unlock is under way refuses 'vault_locked', and no lease is granted; a vault this call was
   * creating stays created, locked. A `lock()` landing meanwhile does not stop the unlock.
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
   * The vault also locks of itself: when the lease ends, at `del()`, for storage it cannot trust, at
   * a read that finds its ways in changed or the vault gone, and when its clock cannot be read.
   *
   * @example document.addEventListener('visibilitychange', () => { if (document.hidden) { void vault.lock() } })
   */
  async lock(): Promise<void> { valOf(await this.tryLock()) }

  /** Forget the unlock, as an {@link Outcome}: the non-throwing form of {@link Vault.lock}. */
  async tryLock(): Promise<Outcome<void>> {
    try {
      this.#checkOpen()
      this.#landLock()
      await this.#shutAndSay()
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
   * It works locked or unlocked. Once it resolves, the change is in storage. The unlock epoch moves,
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
          const wayin = await Wayin.seal(this, standing, putting, deviceId, proven.transientKey)
          return wayin.wayinkind === 'passphrase' ? { passphrase: wayin.props, passkey: null } : { passphrase: standing.passphrase, passkey: wayin.props }
        },
      })
      const { passphrase: storedPassphrase, passkey: storedPasskey } = this.#wayinsOf(stored)
      return good(storedPasskey === null || putting.kind === 'passphrase' ? storedPassphrase.summary : storedPasskey.summary)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Take away the vault's passkey, proven by its standing `passphrase`, resolving the vault.
   * The passphrase itself is never removed. Refuses 'absent_wayin' when the vault has no passkey,
   * before any key derivation, and otherwise as {@link Vault.putWayin} does. Like `putWayin()`, it
   * moves the unlock epoch, so every other device locks and must unlock again with the passphrase;
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
   * Refuses 'stale_write' when another device or tab wrote, created or deleted this box first:
   * nothing was written, and the snapshot shows the box as storage now holds it. Call again if this
   * whisper should still replace it. Refuses 'vault_locked', writing nothing, when the vault was
   * deleted, made anew or had its ways in changed elsewhere. A refusal can also come after the
   * write landed, from the read that follows it: calling again writes the same whisper over itself,
   * harmlessly.
   *
   * Every store stamps `written_at`, the same whisper stored again included; `registered_at` keeps
   * the box's first store. A box that will not read or open is overwritten as new, carrying over
   * neither its sidecar nor its `registered_at`. One listed damaged with no revision refuses
   * 'damaged_box', writing nothing: {@link Vault.delBox} it first. A boxlabel the vault's check
   * refuses is refused 'bad_label', even where a box stored under other checks stands under it.
   *
   * @param storeOpts - `sidecar`, the box's {@link Sidecar}: your app's own JSON data beside the
   *   whisper, shown in the snapshot while locked, and never interpreted by the vault. It is stored
   *   in the clear, readable by anyone who can read the database: never put secret material in it.
   *   It is authenticated, so a sidecar altered in storage makes the box refuse to open. Left out,
   *   the box keeps the sidecar it has, and a new box gets `{}`; `{}` empties it.
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
   * `close()` refuses 'vault_closed'. A box stored under a name the vault's boxlabel check refuses
   * reads by that name, as any other: such a name refuses 'bad_label' only with nothing under it.
   *
   * @example const box = await vault.getBox('anthropic_api_key')
   */
  async getBox(boxlabel: string): Promise<Box> { return valOf(await this.tryGetBox(boxlabel)) }

  /** The box under `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.getBox}. */
  async tryGetBox(boxlabel: string): Promise<Outcome<Box>> {
    try {
      return good(await this.#getBoxUnlocked(boxlabel))
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
      const box = await this.#getBoxUnlocked(boxlabel)
      const whisper = await this.#decipherOrCatchUp(this.#checkUnlocked(), box)
      this.#checkUnlocked()
      return good(whisper)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** The whisper `box` holds, opened under the vaultKey in hand: a {@link Box} from {@link Vault.getBox}, or its stored record.
   * Reads nothing, prompts nobody and awaits no hello: call {@link Vault.ensureLease} first.
   * Refuses 'vault_locked' when no key is in hand, or a lock lands while the box opens;
   * 'damaged_box' for a box that will not open under the vault's key; and 'bad_record' for a record
   * this package does not write.
   *
   * @example const whisper = await vault.decryptWhisper(box)
   */
  async decryptWhisper(box: Box | BoxRecord): Promise<Whisper> { return valOf(await this.tryDecryptWhisper(box)) }

  /** The whisper `box` holds, as an {@link Outcome}: the non-throwing form of {@link Vault.decryptWhisper}. */
  async tryDecryptWhisper(box: Box | BoxRecord): Promise<Outcome<Whisper>> {
    try {
      this.#checkOpen()
      const record = box instanceof Box ? box.props : checkedBoxRecord(box)
      const unlockedKey = this.#checkUnlocked()
      // Made anew for this vault: a box opens under this vault's scope and the props it holds, whichever it came from.
      const held = Box.make(this, record, this.#currentVaultProps())
      const whisper = valOf(await held.tryOpen(unlockedKey))
      this.#checkUnlocked()
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
   * 'absent_box' or 'bad_label', as {@link Vault.getBox} does. Writes with `VaultDB.delBox`.
   *
   * The delete lands only in the vault this device last read. If that vault was deleted, or made
   * anew, elsewhere, nothing is removed, and the call refuses 'stale_write' once this device has
   * caught up. Within that vault the delete wins: a revision another device or tab wrote meanwhile
   * is deleted all the same, and the logger warns. Deleted is gone: a later `putBox()` from a device
   * that never saw the delete is refused as stale.
   */
  async delBox(boxlabel: string): Promise<void> { valOf(await this.tryDelBox(boxlabel)) }

  /** Remove the box `boxlabel`, as an {@link Outcome}: the non-throwing form of {@link Vault.delBox}. */
  async tryDelBox(boxlabel: string): Promise<Outcome<void>> {
    try {
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
   * elsewhere, storage keeps what stands there now, and the call refuses 'stale_write' once this
   * device has caught up: a second `del()` deletes the vault the snapshot then shows. A Vault object
   * that has seen no vault reads storage first, and deletes whatever stands: "delete my vault" never
   * reports success over a vault still standing.
   */
  async del(): Promise<void> { valOf(await this.tryDel()) }

  /** Delete the vault, as an {@link Outcome}: the non-throwing form of {@link Vault.del}. */
  async tryDel(): Promise<Outcome<void>> {
    try {
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
    // Not a lock of the vault: an unlock under way takes nothing up, but nothing this device
    // remembers is erased.
    this.#dropKey()
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
  // Frozen: `vault.clock` hands it out, and the vault's boxes stamp their times by it.
  readonly #checkedClock: Clock = Object.freeze({ now: () => this.#clockNow() })

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

  /** A checked reading of the host's clock. One that fails drops the vaultKey first: no deadline can be trusted then. */
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
  // Whether the last read of storage succeeded, as the snapshot says; whether the storage watch
  // has warned of a failing streak of reads it has not yet seen end; and of hellos, likewise.
  #syncing = true
  #watchWarned = false
  #watchHelloWarned = false
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

  /** The snapshot the private state makes now, frozen. */
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

  // == [Reading storage]: refresh, readStorage, takeStorage, heedRevocation, readAt, hello, helloWithin, greet, watchStorage

  /** Bring the snapshot up to what storage holds now, one read at a time.
   * A refresh asked for while one runs gets one more run once that ends, shared by every request
   * made meanwhile: each caller sees storage as it stood after it asked.
   */
  readonly #refresh = oneAtATime(() => this.#readStorage())

  /** One read of storage into the snapshot. One that fails leaves the snapshot as it stood, but for `syncing`, and has the next hello read afresh. */
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

  /** Take up `fresh`, vault props just read, with `mark`, at once when they revoke the ones in hand.
   * A revocation is a change to the ways in (a new unlock epoch), or the vault deleted or made anew,
   * here or elsewhere. It drops the key, stands down any lease take-up and first unlock's create,
   * and erases the lease when a key was held. An older copy of the vault in hand is no revocation
   * (see `isNewerCopy`).
   */
  async #heedRevocation(fresh: VaultProps | null, mark: DeviceMark | null) {
    // Taken up before any further wait: a take-up or an unlock finishing during the read asks
    // whether its vault props were outrun, and finds these. A revocation wins by construction.
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

  /** Have the next hello read afresh, once one has succeeded: what it read may no longer stand. A hello under way is left to finish, every caller sharing it. */
  #forgetHello() {
    if (! this.#greeted) { return }
    this.#greeting = null
    this.#greeted = false
  }

  /** The hello every call awaits: shared while it runs, and kept once it succeeds, while what it read still stands. The first starts the watch on storage. */
  #hello(): Promise<void> {
    if (this.#closed) { return Promise.reject(closedError()) }
    this.#watchStorage()
    this.#greeting ??= this.#greet()
    return this.#greeting
  }

  /** The host's hello: `#hello`, reading afresh once the last read began `staleMillis` ago or more, and settling the snapshot either way, so a lease run out meanwhile shows. */
  async #helloWithin(staleMillis: number): Promise<void> {
    if (this.#greeted && this.#clockNow() - this.#readAt >= staleMillis) { this.#forgetHello() }
    await this.#hello()
    this.#settle()
  }

  /** One hello: the strength checker loaded and storage read together, then this device's lease taken up.
   * A load that fails refuses the hello, and no lease is taken up; bad news the read met is still
   * told. A hello that fails forgets itself, so the next one loads and reads afresh. So does one
   * whose vault props a refusal of an older copy forgot while it ran (see `#forgetVaultProps`).
   */
  async #greet(): Promise<void> {
    // No other hello can start while one runs (see #forgetHello), so the one this ends is always
    // the one in #greeting.
    try {
      // Both settle before either refuses: no read is left running unheard.
      const [loaded, read] = await Promise.allSettled([this.#strengthChecker.load(), this.#refresh()])
      if (loaded.status === 'rejected') {
        // The load's failure is the hello's, but bad news the read met is still told.
        if (read.status === 'rejected') { this.#hearBadNews(read.reason) }
        throw loaded.reason
      }
      if (read.status === 'rejected') { throw read.reason }
      await this.#fetchLease()
    } catch (err) {
      this.#greeting = null
      this.#settle()
      throw err
    }
    this.#watchHelloWarned = false
    if (this.#vaultProps === UnreadVaultProps) {
      this.#greeting = null
    } else {
      this.#greeted = true
    }
    this.#settle()
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
   * Older means of the vault the mark names, at an `unlock_epoch` or `vault_key_epoch` below what
   * this device has seen. Nothing is written or taken from them, and the vault locks.
   * `opts.seenBefore` is the mark as the caller read it before `fresh`, to hold them to.
   */
  async #heedMark(fresh: VaultProps, opts: { seenBefore?: DeviceMark | null, call: VaultCall }): Promise<DeviceMark> {
    // The vaultKey's epoch is bound into every way in and held to the vault props', so storage
    // cannot raise it on older vault props and still have a way in open. The unlock epoch is bound
    // into nothing, so older vault props at the same vaultKey under a raised unlock epoch pass.
    // Held to `seenBefore` when given: storage held that epoch when the mark was written, so vault
    // props read after it are older only if storage went back. The mark as it stands now could hold
    // a newer epoch, written meanwhile by another tab or this one, and refuse vault props that were
    // the newest when they were read.
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

  /** The mark this device keeps once it has seen `fresh`, as `#markSeeing` makes it, written first when it is not `kept`. */
  async #raiseMark(kept: DeviceMark | null, fresh: VaultProps): Promise<DeviceMark> {
    const mark = this.#markSeeing(kept, fresh)
    if (mark.seen !== kept?.seen) { valOf(await this.#deviceDB.putMark(mark)) }
    return mark
  }

  /** The mark that has seen `kept`'s vault and `fresh`: each epoch the higher, or `kept` itself when nothing is raised.
   * It keeps the `device_id` `kept` has for that vault; a vault not seen gets `#newDeviceIdFor`'s.
   */
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

  /** The `device_id` a mark of `vaultId` starts under: the one this Vault object drafted it under, or a new one. */
  #newDeviceIdFor(vaultId: string): string { return this.#drafted?.vault_id === vaultId ? this.#drafted.device_id : randomId() }

  /** This device's id for the vault `standing` is, which every way in it adds carries: the one the mark held with the vault props in hand names.
   * Refuses 'stale_write' when the vault props in hand have moved on to another vault meanwhile.
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
  /** The vaultKey, for an operation that touches a secret: call it first, and again after each wait on storage.
   * Past `askPassphraseAt` it drops the key and refuses 'vault_locked', whatever any timer has done.
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

  /** The vault, unlocked: at once while the lease stands past `renewMillis` from now, otherwise once the prompt answers.
   * The prompt is the one up, or one raised now. See {@link Vault.ensureLease}. `beforeAsking` runs
   * only when the vault must ask, after the hello and before any prompt: a call checks there what
   * it can know without the key, so a call that cannot land never prompts.
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

  /** An ask's `attempt`: one proof's unlock, as an Outcome, standing down once `overtaken` aborts as the prompt ends. */
  async #tryAttempt(givenProof: string | PasskeyAnswer, overtaken: AbortSignal): Promise<Outcome<Vault>> {
    try {
      await this.#unlockWith(givenProof, overtaken)
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Unlock with one proof, as `unlock()` and an ask's `attempt` do, against the vault props as storage holds them now.
   * It creates the vault when absent, and grants a lease. One the vault outruns (closed, deleted,
   * its ways in changed, or `overtaken` aborted as its prompt ends) takes nothing up, and refuses.
   */
  async #unlockWith(givenProof: string | PasskeyAnswer, overtaken?: AbortSignal): Promise<void> {
    this.#checkOpen()
    const proof = Proof.parse(this, givenProof)
    await this.#hello()
    // Sync with the backend first: the passphrase proves itself against the vault props as they
    // stand there now, not against a cached copy a delete or recreate may have outdated.
    await this.#refresh()
    const unlocked = this.#closed ? null : await this.#settleUnlock(proof)
    const tookUp = unlocked !== null && await this.#grantLease(unlocked, unlocked.standing, overtaken)
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

  // == [Unlock and ways in]: unwrapWith, draftVaultProps, settleUnlock, standDownCreates, reviseWayins, raiseMarkAfter

  /** The vaultKey out of `standing`'s way in of `proof`'s kind, whose refusal is the passphrase or passkey check.
   * Refuses 'absent_wayin' for a passkey's answer to a vault with no passkey.
   */
  async #unwrapWith(standing: VaultProps, proof: Proof): Promise<VaultKeyPair> {
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
  async #draftVaultProps(passphrase: PassphraseProof, deviceId: string): Promise<VaultProps> {
    const identity = { vault_id: randomId(), registered_at: this.#clockNow(), vault_key_epoch: FirstVaultKeyEpoch }
    const wayin = await Wayin.seal(this, identity, passphrase, deviceId, await makeVaultKey())
    return {
      format:              'safebyok-vault-v5',
      ...this.#scope,
      ...identity,
      unlock_epoch:        1,
      passphrase:          wayin.props,
      passkey:             null,
    }
  }

  /** The vaultKey for an unlock, and the vault props it was proven against, this device's or another's: the vault created first when absent.
   * Only a passphrase creates, and it must pass the strength check as a new passphrase; a passkey's
   * answer refuses 'absent_vault'. Refuses 'created_elsewhere' when another device created the
   * vault meanwhile under a passphrase this one does not open.
   */
  async #settleUnlock(proof: Proof): Promise<{ standing: VaultProps } & VaultKeyPair> {
    if (this.#vaultProps === null || this.#vaultProps === UnreadVaultProps) {
      if (! (proof instanceof PassphraseProof)) {
        throw new VaultError('absent_vault', 'This vault has not been created yet, so no passkey opens it: the first unlock(), with a passphrase, creates it.')
      }
      await proof.checkStrongEnough()
      const deviceId = randomId()
      const draft = await this.#draftVaultProps(proof, deviceId)
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
      // The vaultKey comes out of the way in as stored, so the vault keeps only the non-extractable
      // handle an unwrap makes. Should another device have created the vault between our look and
      // our write, the settled vault props are theirs, and the passphrase proves itself against
      // them like any other.
      try {
        return { standing: settled, ...await this.#unwrapWith(settled, proof) }
      } catch (err) {
        if (settled.vault_id !== draft.vault_id && isVaultError(err, 'wrong_passphrase')) { await this.#refuseCreatedElsewhere(err) }
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

  /** Rewrite the vault's ways in, proven by `proof`, the standing passphrase, resolving the vault props as stored.
   * Every change to the ways in goes through here. It proves `proof` against the vault props as
   * storage holds them now, and writes the ways in `plan.revise` makes under the next unlock epoch,
   * only if no other device changed them meanwhile. It then takes up the unlock under them, the
   * lease starting again from now. `plan.check` runs first, on the standing vault props, so a
   * change refused for what it asks costs no key derivation.
   */
  async #reviseWayins(
    proof: PassphraseProof,
    plan: {
      call:    'putWayin' | 'delWayin'
      check?:  (standing: VaultProps) => void
      // Runs once the proof holds, given this device's id for the vault.
      revise:  (standing: VaultProps, proven: VaultKeyPair, deviceId: string) => StandingWayins | Promise<StandingWayins>
    },
  ): Promise<VaultProps> {
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
      await this.#grantLease(proven, next)
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not take up its unlock afresh: it stands as it stood here, and asks for the passphrase at its next open.", { call: plan.call }, asError(err))
    }
    this.#settle()
    return next
  }

  /** This device's mark raised to `next`, vault props its own write just landed: never a refusal.
   * A device store that fails to keep it is warned of, and the mark is held in memory as raised.
   */
  async #raiseMarkAfter(next: VaultProps, call: VaultCall): Promise<DeviceMark> {
    try {
      return await this.#raiseMark(await this.#keptMark(call), next)
    } catch (err) {
      this.#logger.warn("The change to the vault's ways in landed in storage, but this device could not note it in its mark of the vault: the change stands, and the mark catches up at a later read.", { call }, asError(err))
      // A missed mark only weakens the rollback check, until a later read raises it.
      return this.#markSeeing(this.#deviceMark, next)
    }
  }
  // --

  // == [Locking and expiry]: shut, heedRefusal, forgetVaultProps, dropKey, armExpiry, outrun, others

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

  /** Do what the refusal policy says of `refusal` before it is thrown: lock, as `lock()` does, for storage the vault cannot trust.
   * That is a user no longer signed in, or an older copy of the vault. A device store that will not
   * erase the lease is only logged, as the refusal is what the caller must hear.
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

  /** Forget the vault props in hand, as though storage had not been read, with their mark and their boxes; any first unlock's create stands down. */
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

  /** Arm the one expiry timer, in place of any pending, to drop the key at `until`, counted from `now`; none for a key that lasts until `lock()`. */
  #armExpiry(until: number, now: number) {
    this.#cancelPendingShut()
    if (isFarFuture(until)) { return }
    this.#pendingShut = unrefTimeout(() => { this.#dropNow() }, until - now)
  }

  /** True when the Vault object has closed, or the vault props standing now are no longer `standing` (see `#movedOn`). */
  #outrun(standing: VaultProps) {
    return this.#closed || this.#movedOn(standing)
  }

  /** True when the vault props standing now are no longer `standing`: deleted, made anew, or their ways in changed, here or elsewhere. */
  #movedOn(standing: VaultProps) {
    return this.#vaultProps === null || this.#vaultProps === UnreadVaultProps
    || this.#vaultProps.vault_id !== standing.vault_id || this.#vaultProps.unlock_epoch !== standing.unlock_epoch
  }
  // --

  // == [Lease]: grantLease, fetchLease, takeUp, standDownTakeUp, takeUpLease, discardLease

  /** Grant this device a lease, `leaseHours` from now, and take up the vaultKey under it; resolves true when the vault is now unlocked.
   * {@link Lease.grant} makes the lease, and {@link DeviceDB.putLease} writes it. Nothing is taken
   * up once the Vault object has closed, the vault props the key was proven against no longer
   * stand, or `overtaken` (an ask's attempt, which its prompt's end stands down) aborts. A lease
   * already written then is erased: a deleted vault keeps no lease on this device, even should
   * storage later bring it back. A close alone erases nothing, as a close is no lock.
   *
   * Every proof passes through here: an `unlock()`, or a change to the ways in. Nothing else moves
   * the deadline.
   */
  async #grantLease(unlocked: VaultKeyPair, standing: VaultProps, overtaken?: AbortSignal): Promise<boolean> {
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
    const lease = await Lease.grant(this, standing, unlocked)
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
    this.#armExpiry(lease.ask_passphrase_at, this.#clockNow())
    this.#vaultKey = unlocked.sessionKey
    this.#lease = lease
    return true
  }

  /** Fetch this device's lease, and take it up when it still fits and still opens: the vault is then unlocked until its `askPassphraseAt`.
   * Runs in a hello, once vault props are read, and does nothing while there are none. A lease that
   * does not fit or open is discarded. One ending later than this Vault object's `leaseHours` allows
   * from now does not fit: lowering `leaseHours` has each device ask again at its next hello, and
   * raising it lengthens no lease already granted. A record the deviceDB hands back that fails its
   * check reads as no lease. Nothing here writes a lease, so it never brings back one another tab's
   * `lock()` erased. A key change, a close, or vault props outrun while the lease is read take
   * nothing up, and leave the lease standing now alone.
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

  /** `#fetchLease`'s work, against the vault props standing as it begins: it writes nothing once `overtaken` aborts, or those props no longer stand. */
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
  #checkWhisperFits(whisperBytes: Uint8Array, sidecarJson: string) {
    const sidecarBytes = new TextEncoder().encode(sidecarJson).length
    if (whisperBytes.length + sidecarBytes <= this.#whisperByteLimit) { return }
    throw new VaultError('whisper_too_large', `That whisper and its box's sidecar are over this vault's limit of ${String(this.#whisperByteLimit)} bytes of JSON together: check that the right value is being stored. If it really is meant to be this large, pass a larger maxWhisperBytes to Vault.make.`)
  }

  /** Refuse 'vault_full' for a new box while the vault holds `maxBoxes`, or one that would take it past `maxVaultBytes`.
   * Each box is weighed by `#boxWeight`. It counts from the boxes last listed, so a store costs no
   * extra read; a vault that looks full is caught up with storage before it refuses. A replacement
   * always passes.
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

  // == [Reading boxes]: checkStandingBoxlabel, checkListed, getBoxOrThrow, boxFrom, getBoxUnlocked, decipherOrCatchUp

  /** `boxlabel`, once a box stands under it, for `delBox()`: a damaged record stands, and so does one under a name the vault's check refuses.
   * Reads storage once, and refuses as `#nothingUnder` says.
   */
  async #checkStandingBoxlabel(boxlabel: string): Promise<string> {
    const label = Names.checkFloor('boxlabel', boxlabel)
    if (await this.#getBoxOrDamaged(label) === null) { throw this.#nothingUnder(label) }
    return label
  }

  /** The revision the listing names for the box under `boxlabel`, sound or damaged; null for none listed, or a damaged record that holds none.
   * Storage arbitrates a write that names it, so a listing gone stale costs a refusal and a second
   * store, never a record.
   */
  #listedRevisionOf(boxlabel: string): string | null { return this.#boxes.find((box) => box.boxlabel === boxlabel)?.revision_tok ?? null }

  /** True when the snapshot's listing shows the box under `boxlabel` as damaged. */
  #isListedDamaged(boxlabel: string): boolean { return this.#boxes.some((box) => box.boxlabel === boxlabel && box.damaged) }

  /** Refuse `boxlabel`, a name above the floor, as `#nothingUnder` does, when the listing in hand shows no box under it.
   * That is what a locked vault can know before it asks for a proof. Reads nothing: the listing is
   * as fresh as `staleMinutes` keeps it.
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

  /** The box `record` makes under the vault props in hand, for a call that holds the key.
   * Refuses 'vault_locked', never 'absent_vault', when a refresh during the read found the vault
   * gone and took the key.
   */
  #boxFrom(record: BoxRecord): Box {
    this.#checkUnlocked()
    return Box.make(this, record, this.#currentVaultProps())
  }

  /** Why nothing stands under `boxlabel`, a name above the floor: 'bad_label' when the vault's boxlabel check refuses it, 'absent_box' otherwise.
   * Call it only once storage holds nothing under the name: a box stored under a name the check
   * refuses reads and deletes as any other.
   */
  #nothingUnder(boxlabel: string): VaultError {
    Names.check(this.#rules, 'boxlabel', boxlabel)
    return absentBox()
  }

  /** The box under `boxlabel`, once the vault is unlocked for it, while a key is still in hand.
   * A lock or a `close()` meanwhile refuses 'vault_locked' or 'vault_closed'.
   */
  async #getBoxUnlocked(boxlabel: string): Promise<Box> {
    this.#checkOpen()
    const label = Names.checkFloor('boxlabel', boxlabel)
    // Checked before the user is asked for anything: a call that cannot land never prompts.
    await this.#ensureLease(0, () => { this.#checkListed(label) })
    return await this.#getBoxOrThrow(label)
  }

  /** The whisper `box` holds; for one that will not open under the key, one catch-up with storage, then 'damaged_box'.
   * A catch-up that relocks this device refuses 'vault_locked'. One that fails is thrown as it came,
   * as whether the box is damaged is not known.
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

  /** Write `box` over `expected`, as `putBox()` does: one write, which storage refuses unless the revision `expected` names still stands.
   * A refusal is thrown as `#refuseStalePutBox` says.
   */
  async #writeOver(box: Box, expected: BoxExpectation): Promise<void> {
    try {
      await this.#refreshOnStale(this.#vaultDB.putBox(this.#scope, expected, box.props), 'putBox')
    } catch (err) {
      this.#refuseStalePutBox(err)
    }
  }

  /** Throw `err`, what a `putBox()` write met, as the call's refusal.
   * Storage's 'invalid_box' becomes 'bad_record', as this vault sealed the box. A stale refusal
   * that `#refreshOnStale` caught up after becomes 'vault_locked' when the catch-up relocked this
   * device, and otherwise 'stale_write', the adapter's refusal its cause and its `meta.box_stored`
   * carried on. Anything else, a failed catch-up among it, is thrown as it came.
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

  /** Refuse 'created_elsewhere', for a first unlock whose passphrase `wrong` refused against a vault another device created meanwhile.
   * It first catches the snapshot's boxes up with storage, so the vault shows as that device made it,
   * `locked`. A catch-up that fails is warned of, and leaves `syncing: false`; one refused as
   * untrusted storage is thrown as it came.
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

  /** `write`, catching this device up with storage once, before the refusal is thrown, when storage refuses it as stale.
   * A box write's 'vault_mismatch' counts as stale too. A catch-up that fails refuses as `#catchUp`
   * says. A write that lands resolves as it came.
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

  /** True for a stale refusal whose catch-up succeeded: what `putBox()` and `delBox()` say as what happened to the box. */
  #isCaughtUpStale(err: unknown): err is VaultError { return isCatchingUpKind(err) && this.#syncing }

  /** One refresh after `refusal`, a write storage refused as stale.
   * One that fails leaves `syncing: false`, and refuses 'stale_write', its failure the cause. But
   * 'identity_revoked', 'rolled_back' or 'newer_format' is thrown as it came, as each asks something
   * else of the caller.
   */
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
  // longer stands, so a lease is taken up as the vault settles. A failure here has nobody to throw
  // to, so it leaves the snapshot standing and tells any bad news it met. A hello's failure is
  // warned of as itself, in the words `tryHello()` would refuse with, once until a hello succeeds.
  // A refresh's leaves the snapshot saying `syncing: false`, and warns once for a failing streak;
  // the next read that succeeds says so once.
  async #watchRefresh() {
    if (this.#greeting === null) {
      const { ok, err } = await outcomeOf(() => this.#hello(), unexpectedError)
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

/** What `reading` resolves to, with storage's 'corrupt_record' said instead as `damaged` says it, storage's refusal its cause. */
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

/** A copy of `props`, frozen through its ways in: the vault props the vault holds, which no host can write to. */
const frozenVaultProps = (props: VaultProps): VaultProps => Object.freeze({
  ...props,
  passphrase: frozenRecord(props.passphrase),
  passkey:    props.passkey === null ? null : frozenRecord(props.passkey),
})

/** The ways in of vault props, as a change to them writes them anew. */
type StandingWayins = Pick<VaultProps, 'passphrase' | 'passkey'>

/** True when `box` lists as damaged already, or stands under the vaultKey `standing` holds: a box under any other epoch opens under no key the vault holds. */
const isUnderHeldKey = (box: BoxSummary | DamagedBox, standing: VaultProps): boolean => (
  box.damaged || box.vault_key_epoch === standing.vault_key_epoch
)

/** True when `inHand` is the vault `fresh` is, at a later `unlock_epoch` or `vault_key_epoch`: `fresh` is an older copy, never to replace what is in hand.
 * Such a read began before a write of this device's own landed. Storage never takes a vault's
 * epochs back (the device mark refuses one that does, as 'rolled_back').
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

/** The refusals that say storage cannot be trusted as it stands: 'identity_revoked' and 'rolled_back', which lock the vault, and 'newer_format'.
 * Each asks something of the caller that a stale write does not: the user to sign in again,
 * storage to be looked at, or the app to be updated. A write's catch-up throws each as it came,
 * never as 'stale_write', and each has the next hello read afresh.
 */
const UntrustedStorageKinds = ['identity_revoked', 'rolled_back', 'newer_format'] as const satisfies readonly RefusalKind[]

/** True for a write's refusal that says storage moved under it, which the vault catches up after: 'stale_write', or a box write's 'vault_mismatch'. */
const isCatchingUpKind = (err: unknown): err is VaultError => isVaultError(err, 'stale_write') || isVaultError(err, 'vault_mismatch')
// --

// == [Argument parsers]: eventHint, checkHelloOpts, checkEnsureLeaseOpts, checkStoreOpts, sidecarJsonOf, standingPassphraseOf, newProofOf, absentBox

/** What a call that takes options most likely had in place of its bag, and what to do: an event, as `call` was handed to `addEventListener` or `onClick` itself. */
const eventHint = (call: 'hello' | 'ensureLease', tried: 'tryHello' | 'tryEnsureLease') => `${call}() was handed something other than a bag of options: an event, most likely, as ${call} was handed to addEventListener or onClick as the handler itself. Wrap it: \`() => vault.${tried}()\`, whose refusal, being returned, never surfaces as an unhandled rejection.`

/** What `hello()`'s options may hold: `staleMinutes`, which `parseStaleMinutes` checks, and nothing else. */
const checkHelloOpts = optionsCheck({ staleMinutes: Z.optional(Z.unknown()) }, "hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage: check its spelling, and leave out any other.", eventHint('hello', 'tryHello'))

/** What `ensureLease()`'s options may hold: `renewMinutes`, which `parseRenewMinutes` checks, and nothing else. */
const checkEnsureLeaseOpts = optionsCheck({ renewMinutes: Z.optional(Z.unknown()) }, "ensureLease()'s only option is `renewMinutes`, how many minutes before the lease ends to ask for a proof anyway: check its spelling, and leave out any other.", eventHint('ensureLease', 'tryEnsureLease'))

/** What `putBox()`'s options may hold: a sidecar, which {@link sidecarJsonOf} checks, and nothing else. */
const checkStoreOpts = optionsCheck({ sidecar: Z.optional(Z.unknown()) }, "putBox()'s only option is `sidecar`, the box's own visible data (it is authenticated but never encrypted): check its spelling, and leave out any other. A note is kept in the sidecar: { sidecar: { note } }.")

/** The sidecar a `putBox()` was handed, as the JSON a box keeps, keys sorted; undefined when it was handed none.
 * Refuses 'bad_option' for anything JSON cannot carry, quoting none of it, and for options beside
 * it.
 */
const sidecarJsonOf = (storeOpts: { sidecar?: Sidecar | undefined } | undefined): string | undefined => {
  checkStoreOpts(storeOpts)
  if (storeOpts?.sidecar === undefined) { return undefined }
  return stableJsonify(checkedSidecar(storeOpts.sidecar))
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
