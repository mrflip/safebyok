import { type DeviceRecord, type GatelessVaultProps, type VaultScope, DeviceRecordFormat } from './types'
import { VaultError, isVaultError } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { randomId } from './crypto'
import * as Ckeys from './ckeys'
import * as Names from './names'
import * as RefusalPolicy from './refusal-policy'
import { type DeviceDB, deviceRecordFor, deviceTroubleAsConditions } from './device-db'
import { loadStrengthChecker } from './passphrase-strength'
import { reportToPlatform } from './report-error'
import { type MakeBankOpts, type ParsedBankOpts, type VaultDraft, type VaultParts, parseMakeBankOpts, parseVaultDraft } from './vault-opts'
import { Vault, bear, goneBy, letGo } from './vault'
import { delDamagedVaultIn } from './del-damaged-vault'
import type { VaultDB } from './vault-db'

// == [Public types]: BankStatus, EntryStatus, VaultEntry, BankSnapshot, VaultChoice

/** Where the bank stands, as a UI branches on it.
 *  * `made`: `Bank.make` checked its options, and nothing more.
 *  * `starting`: `bank.hello()` is loading the libraries its vaults share.
 *  * `timely`: they loaded; vaults may be born.
 *  * `refused`: they failed to load; the snapshot's `err` says why, and the next `hello()` tries again.
 */
export type BankStatus = 'made' | 'starting' | 'timely' | 'refused'

/** Where one vault's entry in the bank stands: `starting` while its birth reads storage, `timely` holding the Vault object, `refused` with why. */
export type EntryStatus = 'starting' | 'timely' | 'refused'

/** One vault's entry in the bank, frozen, and the same object until it changes: its scope, where it stands, the Vault object while `timely`, and the refusal while `refused`.
 * A `refused` entry's vault is null: a vault deleted, or deleted and made anew, or refused as
 * 'vault_behind', has no Vault object to hand out. `bank.ensureVault` tries again.
 */
export type VaultEntry = Readonly<{
  scope:  VaultScope
  status: EntryStatus
  vault:  Vault | null
  err:    VaultError | null
}>

/** The bank's fields, frozen in one plain object for `useSyncExternalStore`: replaced whole when anything changes, and otherwise the same object.
 * `vaults` holds an entry for each vault asked for and not let go, keyed by an opaque text the
 * scope makes: read one with {@link Bank.entryOf}.
 */
export type BankSnapshot = Readonly<{
  status: BankStatus
  err:    VaultError | null
  vaults: Readonly<Record<string, VaultEntry>>
}>

/** Which of the bank's vaults a call means: the user's, under its label. */
export type VaultChoice = Pick<VaultDraft, 'userId' | 'vaultlabel'>
// --

/** One entry as the bank keeps it: its view, and the birth under way, if any. */
type HeldEntry = {
  view:     VaultEntry
  birth:    Promise<Vault> | null
  /** The stores it was born from: a draft naming others for its scope is refused. */
  vaultDB:  VaultDB
  deviceDB: DeviceDB
}

/** The app's vaults, one Vault object per scope, and what they share: the key deriver, the strength checker, the logger, the clock, the limits, and the stores each vault lives in unless told otherwise.
 * `Bank.make` checks its options and touches nothing. `bank.hello()` loads the libraries the
 * vaults share, once. `bank.ensureVault(draft)` births a vault's Vault object from one read of
 * storage and this device's store, or hands back the one it holds; two asks for one vault at once
 * get one Vault object. A UI renders from `getSnapshot()` and re-renders on `subscribe()`.
 *
 * This device keeps a record of each vault it has seen (its device record): its own id for the
 * vault, and the highest `vault_epoch` it has seen there. A vault storage serves below it is
 * refused 'vault_behind', and no Vault object is born: `bank.clearCachedVault` accepts what
 * storage holds.
 *
 * Every call comes in two forms, as on a Vault object: `tryEnsureVault()` and the rest resolve to
 * an {@link Outcome}; `ensureVault()` and the rest resolve its `val` or throw its `err`.
 * `closeVault()`, `closeVaults()`, `entryOf()`, `subscribe()` and `getSnapshot()` come in one form.
 *
 * @example
 *   const bank = Bank.make({ applabel: 'acme', vaultDB, ...browserOpts() })   // once, at module level
 *   const vault = await bank.ensureVault({ userId: session.userId, vaultlabel: 'main' })
 *   vault.state   // 'novel' | 'locked' | 'unlocked'
 * @example const snapshot = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
 */
export class Bank {
  // == [Bank: fields]: applabel, status, snapshot, getSnapshot, subscribe, entryOf

  /** The app the bank's vaults belong to. */
  get applabel(): string { return this.#parts.applabel }
  /** Where the bank stands: see {@link BankStatus}. */
  get status(): BankStatus { return this.#snapshot.status }
  /** Every field, frozen in one object: what {@link Bank.getSnapshot} returns. */
  get snapshot(): BankSnapshot { return this.#snapshot }

  /** The current {@link BankSnapshot}: the same object until something changes. */
  getSnapshot = (): BankSnapshot => this.#snapshot
  /** Call `listener` after every snapshot change, returning the unsubscribe.
   * A listener may call into the bank as it hears: an ask for a vault, as its entry goes
   * `starting`, joins the birth under way.
   */
  subscribe = (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** The entry the snapshot holds for the vault `choice` names, or null for none: synchronous, and reading nothing.
   * Refuses 'bad_label' for a name that fails its check.
   *
   * @example bank.entryOf({ userId: 'u1', vaultlabel: 'main' })?.status   // 'starting' | 'timely' | 'refused', or undefined
   */
  entryOf(choice: VaultChoice): VaultEntry | null {
    return this.#snapshot.vaults[Ckeys.vaultProps(this.#scopeOf(choice))] ?? null
  }
  // --

  // == [Bank: opening]: make, hello

  /** Make a bank for the app: its options checked, and nothing else done. It reads nothing, starts nothing, and is `made`.
   * It throws its misuse at once, synchronously: 'insecure_context' first, for a page that is not a
   * secure context; 'bad_label' for an `applabel` that fails its check; 'bad_option' for any other
   * option, one it does not take among them (a misspelling, a retired name, or `userId` and
   * `vaultlabel`, which each vault's draft takes), a `vaultDB` or `deviceDB` short of a verb, or
   * limits the `vaultDB` might not honour.
   *
   * @example const bank = Bank.make({ applabel: 'acme', vaultDB, ...browserOpts() })
   * @example Bank.make({ ...opts, userId: 'u1' })   // throws 'bad_option': each vault's draft names its user
   */
  static make(opts: MakeBankOpts): Bank {
    return new Bank(opts)
  }

  /** The bank {@link Bank.make} makes. */
  private constructor(opts: MakeBankOpts) {
    this.#parts = parseMakeBankOpts(opts)
    this.#snapshot = this.#picture()
  }

  /** Load the libraries the bank's vaults share, once, resolving the bank: it is `timely` once they have loaded.
   * That is the strength checker's `load`, if it has one. A hello while one runs shares it; one
   * after it succeeded resolves at once. One that fails refuses as the load did ('unexpected_error',
   * what it threw the cause), leaves the bank `refused`, and the next hello loads again. No vault is
   * born until it succeeds: `ensureVault` says hello first.
   *
   * @example await bank.hello()   // bank.status: 'timely'
   */
  async hello(): Promise<Bank> { return valOf(await this.tryHello()) }

  /** Load the libraries the vaults share, as an {@link Outcome}: the non-throwing form of {@link Bank.hello}. */
  async tryHello(): Promise<Outcome<Bank>> {
    try {
      await this.#ensureLoaded()
      return good(this)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Bank: vaults]: ensureVault, reopenVault, closeVault, closeVaults, clearCachedVault, delDamagedVault

  /** The Vault object for the vault `draft` names, born now from one read of storage, or the one the bank holds: never absent, `novel` until its passphrase is set.
   * It says hello first. A birth reads this device's record of the scope, then `VaultDB.ensureVault`
   * (the vault as stored, or a new, gateless one stored in one transaction; past a tombstone, a new
   * life, its counter carried on) beside {@link DeviceDB.getLease}, then raises the record to what
   * it read with {@link DeviceDB.raiseDeviceRecord}. A lease of the vault's ways in that has not
   * ended, and ends no later than `leaseHours` from now, is taken up: the vault is born unlocked.
   * Any other is left where it lies. Nothing prompts.
   *
   * An ask while a birth of the same vault is under way gets the same Vault object. The bank holds
   * it until it is let go (`closeVault`, `reopenVault`, `closeVaults`, `clearCachedVault`), deleted,
   * or found deleted or made anew, during its birth or after: then the entry is `refused`, and the
   * next ask births anew. One scope lives in one place: a draft for a vault the bank holds, or is
   * birthing, names the stores it was born from (left out, the bank's own): the same objects, as
   * stores are compared by identity, so make each store once.
   *
   * Refuses 'bad_label' or 'bad_option' for a draft amiss, before storage is touched, and
   * 'bad_option' for a draft naming another `vaultDB` or `deviceDB` object than the vault held was
   * born from, one made afresh over the same storage among them. Refuses as storage refuses:
   * 'damaged_vault' for vault props it cannot use (`delDamagedVault` clears them), 'newer_format',
   * 'identity_revoked', 'storage_unavailable'. Refuses 'vault_behind' for a vault below this
   * device's record, as the class says. The entry keeps the refusal; bad news among them is told
   * to `onBadNews`.
   *
   * @example const vault = await bank.ensureVault({ userId: session.userId, vaultlabel: 'main' })
   * @example const vault = await bank.ensureVault({ userId, vaultlabel: 'work', vaultDB: workVaultDB })   // a vault stored elsewhere
   */
  async ensureVault(draft: VaultDraft): Promise<Vault> { return valOf(await this.tryEnsureVault(draft)) }

  /** The Vault object for the vault `draft` names, as an {@link Outcome}: the non-throwing form of {@link Bank.ensureVault}. */
  async tryEnsureVault(draft: VaultDraft): Promise<Outcome<Vault>> {
    try {
      const parts = parseVaultDraft(draft, this.#parts)
      return good(await this.#ensureEntry(parts))
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Let the vault `draft` names go, and birth it anew: a Vault object of what storage holds now, as {@link Bank.ensureVault} says.
   * The Vault object let go is gone, as {@link Bank.closeVault} says.
   *
   * @example const vault = await bank.reopenVault({ userId, vaultlabel: 'main' })   // after 'vault_gone', say
   */
  async reopenVault(draft: VaultDraft): Promise<Vault> { return valOf(await this.tryReopenVault(draft)) }

  /** Let the vault go and birth it anew, as an {@link Outcome}: the non-throwing form of {@link Bank.reopenVault}. */
  async tryReopenVault(draft: VaultDraft): Promise<Outcome<Vault>> {
    try {
      const parts = parseVaultDraft(draft, this.#parts)
      this.#letGoOf(Ckeys.vaultProps(parts.scope))
      return good(await this.#ensureEntry(parts))
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Let the vault `choice` names go: its Vault object is gone, every call on it refusing 'vault_gone', and its entry leaves the snapshot.
   * Not a lock: nothing stored is erased, and this device's lease stays for the next birth. A
   * prompt up for a proof ends, its `lockLanded` settling as at a `lock()`, and each call waiting
   * on it refuses 'vault_gone', as a birth under way does; one let go in the task that asked for it
   * has read nothing.
   * Synchronous; a vault the bank does not hold is no refusal. Refuses 'bad_label' for a name that
   * fails its check.
   *
   * @example bank.closeVault({ userId, vaultlabel: 'main' })
   */
  closeVault(choice: VaultChoice): void {
    this.#letGoOf(Ckeys.vaultProps(this.#scopeOf(choice)))
  }

  /** Let every vault go, as {@link Bank.closeVault} does each: what an app does at sign-out.
   *
   * @example onSignOut(() => { bank.closeVaults() })
   */
  closeVaults(): void {
    // A Map's iteration carries on past an entry deleted under it.
    for (const ckey of this.#entries.keys()) { this.#letGoOf(ckey) }
  }

  /** Forget what this device keeps of the vault `draft` names -- its device record and its lease -- letting the vault go: the way out of 'vault_behind'.
   * Once storage was restored from an older copy on purpose, this has the device accept it: the
   * next {@link Bank.ensureVault} births the vault as storage holds it. Erases with
   * {@link DeviceDB.delDeviceRecord} and {@link DeviceDB.delLease}, and lets the vault go once both
   * are erased, so the next birth reads neither. It weakens the check for a vault
   * served behind what this device has seen until the next birth, so call it only on the user's
   * or the host's say. Refuses 'storage_unavailable' or 'storage_blocked' when the device store
   * fails: call again to finish.
   *
   * @example
   *   if (isVaultError(err, 'vault_behind') && supportConfirmedTheRestore()) {
   *     await bank.clearCachedVault({ userId, vaultlabel: 'main' })
   *     await bank.ensureVault({ userId, vaultlabel: 'main' })
   *   }
   */
  async clearCachedVault(draft: VaultDraft): Promise<void> { valOf(await this.tryClearCachedVault(draft)) }

  /** Forget what this device keeps of the vault, as an {@link Outcome}: the non-throwing form of {@link Bank.clearCachedVault}. */
  async tryClearCachedVault(draft: VaultDraft): Promise<Outcome<void>> {
    try {
      const parts = parseVaultDraft(draft, this.#parts)
      const deviceDB = deviceTroubleAsConditions(parts.deviceDB)
      valOf(await deviceDB.delDeviceRecord(parts.scope))
      valOf(await deviceDB.delLease(parts.scope))
      // Let go once both are erased, so an ask the letting go brings -- a mounted useVault's --
      // reads neither.
      this.#letGoOf(Ckeys.vaultProps(parts.scope))
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Delete the vault `draft` names, whose birth was refused 'damaged_vault' -- its vault props, every box, and this device's lease of it -- letting it go: the way out of 'damaged_vault'.
   * It is the `delDamagedVault` function with the bank's own stores, and refuses as it does: 'bad_option'
   * for a vault that reads sound (delete that with `vault.del()`), 'stale_write' for one made anew
   * elsewhere meanwhile, 'storage_unavailable' and the rest. What the vault held is gone for good,
   * so ask the user first. Once it is deleted, the vault's entry is let go, and the next
   * {@link Bank.ensureVault} births a new life, `novel`. On 'stale_write' the entry is let go too,
   * so the next ask births the vault that stands.
   *
   * @example
   *   if (isVaultError(entry.err, 'damaged_vault') && confirm('Remove your vault and start over?')) {
   *     await bank.delDamagedVault({ userId, vaultlabel: 'main' })
   *     await bank.ensureVault({ userId, vaultlabel: 'main' })
   *   }
   */
  async delDamagedVault(draft: VaultDraft): Promise<void> { valOf(await this.tryDelDamagedVault(draft)) }

  /** Delete a vault refused 'damaged_vault', as an {@link Outcome}: the non-throwing form of {@link Bank.delDamagedVault}. */
  async tryDelDamagedVault(draft: VaultDraft): Promise<Outcome<void>> {
    try {
      const parts = parseVaultDraft(draft, this.#parts)
      const ckey = Ckeys.vaultProps(parts.scope)
      try {
        await delDamagedVaultIn(parts.scope, parts.vaultDB, parts.deviceDB)
      } catch (err) {
        // Made anew elsewhere meanwhile: the entry's refusal is out of date, so it goes, and the
        // next ask births the vault that stands. The caller still hears why nothing was deleted.
        if (isVaultError(err, 'stale_write')) { this.#letGoOf(ckey) }
        throw err
      }
      this.#letGoOf(ckey)
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Options and state]: parts, entries, listeners, snapshot, picture, publish, scopeOf

  readonly #parts: ParsedBankOpts
  readonly #entries = new Map<string, HeldEntry>()
  readonly #listeners = new Set<() => void>()
  #status: BankStatus = 'made'
  #err: VaultError | null = null
  #snapshot: BankSnapshot

  /** The snapshot the private state makes now, frozen: each entry's view kept as it is. */
  #picture(): BankSnapshot {
    const vaults = Object.fromEntries([...this.#entries].map(([ckey, entry]) => [ckey, entry.view]))
    return Object.freeze({ status: this.#status, err: this.#err, vaults: Object.freeze(vaults) })
  }

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped. Callers call it only once something changed. */
  #publish() {
    this.#snapshot = this.#picture()
    this.#listeners.forEach((listener) => { listener() })
  }

  /** The scope `choice` names in the bank's app, its names checked: 'bad_label' for one that fails. */
  #scopeOf(choice: VaultChoice): VaultScope {
    return Names.checkScope(this.#parts.rules, { applabel: this.#parts.applabel, user_id: choice.userId, vaultlabel: choice.vaultlabel })
  }
  // --

  // == [Loading]: loaded, ensureLoaded, load

  // The libraries' load, shared while it runs and kept once it succeeds; forgotten when it fails.
  #loaded: Promise<void> | null = null

  /** The libraries loaded, once: a load under way is shared, one that succeeded is kept. The bank is `starting` while one runs. */
  #ensureLoaded(): Promise<void> {
    if (this.#loaded !== null) { return this.#loaded }
    this.#loaded = this.#load()
    // Published once the load is held, so a listener saying hello now shares it.
    this.#status = 'starting'
    this.#err = null
    this.#publish()
    return this.#loaded
  }

  /** Load the strength checker: the bank `timely` once it has, `refused` and the load forgotten when it fails, so the next hello loads afresh. */
  async #load(): Promise<void> {
    const loaded = await outcomeOf(() => loadStrengthChecker(this.#parts.strengthChecker), unexpectedError)
    if (! loaded.ok) {
      this.#loaded = null
      this.#status = 'refused'
      this.#err = loaded.err
      this.#publish()
      throw loaded.err
    }
    this.#status = 'timely'
    this.#publish()
  }
  // --

  // == [Birth]: ensureEntry, bearEntry, settleBirth, bear, bearFrom, revokeLease, heardGone, letGoOf, setView

  /** The Vault object for `parts`' scope: the one held, the birth under way, or a birth begun now. A held one is handed out only to `parts` naming its stores: 'bad_option' otherwise. */
  #ensureEntry(parts: VaultParts): Promise<Vault> {
    const ckey = Ckeys.vaultProps(parts.scope)
    const held = this.#entries.get(ckey)
    if (held?.birth !== null && held?.birth !== undefined) {
      checkSameStores(held, parts)
      return held.birth
    }
    if (held?.view.status === 'timely' && held.view.vault !== null) {
      checkSameStores(held, parts)
      return Promise.resolve(held.view.vault)
    }
    return this.#bearEntry(ckey, parts)
  }

  /** Birth the Vault object for `parts`' scope into its entry, `starting` until it settles: `timely` holding it, or `refused`. */
  #bearEntry(ckey: string, parts: VaultParts): Promise<Vault> {
    const entry: HeldEntry = { view: frozenEntry(parts.scope, 'starting', null, null), birth: null, vaultDB: parts.vaultDB, deviceDB: parts.deviceDB }
    this.#entries.set(ckey, entry)
    entry.birth = this.#settleBirth(ckey, entry, parts)
    this.#publish()
    return entry.birth
  }

  /** Birth `entry`'s Vault object and settle the entry: `timely` holding it, `refused` with why, or, for an entry let go meanwhile, the Vault object let go too and the caller refused 'vault_gone'.
   * A Vault object already gone of itself -- its watch found the vault deleted or made anew in the
   * microtasks since it was born -- is never handed out: the entry is `refused` as it would have
   * been a moment later, and the next ask births anew.
   */
  async #settleBirth(ckey: string, entry: HeldEntry, parts: VaultParts): Promise<Vault> {
    // Begun a microtask on, so the birth is held before anything is published -- the entry's
    // 'starting', or the bank's as the birth says hello: a listener asking for the vault as it
    // hears either joins this birth, rather than beginning another from inside this one.
    await Promise.resolve()
    // Let go in the task that asked for it -- a React StrictMode rehearsal, say: nothing is read.
    if (this.#entries.get(ckey) !== entry) { throw goneError() }
    const born = await outcomeOf(() => this.#bear(ckey, parts), unexpectedError)
    // Let go while it was born: the Vault object goes with it, and the caller hears so.
    if (this.#entries.get(ckey) !== entry) {
      if (born.ok) { born.val[letGo]() }
      throw goneError()
    }
    entry.birth = null
    if (born.ok) {
      const gone = born.val[goneBy]
      if (gone !== null) {
        this.#setView(entry, frozenEntry(parts.scope, 'refused', null, gone))
        throw gone
      }
      this.#setView(entry, frozenEntry(parts.scope, 'timely', born.val, null))
      return born.val
    }
    this.#setView(entry, frozenEntry(parts.scope, 'refused', null, born.err))
    this.#tellBadNews(born.err)
    throw born.err
  }

  /** One birth: the libraries loaded, one read of storage and this device's store, the judgment, the device record raised, and the Vault object born of it all.
   * A birth refused for storage this device cannot trust ('identity_revoked', 'vault_behind': the
   * refusal policy's `lock`) revokes this device's lease of the scope, as a lock does, so the next
   * birth asks for a proof.
   */
  async #bear(ckey: string, parts: VaultParts): Promise<Vault> {
    await this.#ensureLoaded()
    const deviceDB = deviceTroubleAsConditions(parts.deviceDB)
    try {
      return await this.#bearFrom(ckey, parts, deviceDB)
    } catch (err) {
      if (RefusalPolicy.decide(err) === 'lock') { await this.#revokeLease(parts, deviceDB) }
      throw err
    }
  }

  /** {@link Bank.#bear}'s read, judgment and raise, from `deviceDB`, the device store's trouble as conditions.
   * The device record is read first, so a raise another tab's own write made is never held against
   * a read served before that write landed. Each record the device store hands back is checked
   * ({@link deviceRecordFor}): one that fails reads as none. Nothing is born below the record:
   * 'vault_behind'.
   */
  async #bearFrom(ckey: string, parts: VaultParts, deviceDB: DeviceDB): Promise<Vault> {
    const { scope } = parts
    const readAt = Math.floor(parts.clock.now())
    const recordBefore = deviceRecordFor(scope, valOf(await deviceDB.getDeviceRecord(scope)))
    const [ensured, leaseKept] = await Promise.all([parts.vaultDB.ensureVault(draftOf(scope, readAt)), deviceDB.getLease(scope)])
    const { vaultProps, boxes } = valOf(ensured)
    if (recordBefore !== null && vaultProps.vault_epoch < recordBefore.highest_vault_epoch) { throw behindError() }
    // Minted at first need: the record keeps the first device_id stored, whichever tab wrote it.
    const raising: DeviceRecord = { format: DeviceRecordFormat, ...scope, device_id: recordBefore?.device_id ?? randomId(), highest_vault_epoch: vaultProps.vault_epoch }
    // An answer that fails its check gives way to the record handed over, so no malformed device_id reaches a way in.
    const record = deviceRecordFor(scope, valOf(await deviceDB.raiseDeviceRecord(raising))) ?? raising
    const vault: Vault = Vault[bear](parts, { vaultProps, listed: boxes, leaseKept: valOf(leaseKept), record, readAt }, (refusal) => { this.#heardGone(ckey, vault, refusal) })
    return vault
  }

  /** Erase this device's lease of `parts`' scope, after a birth refused for storage it cannot trust: a device store that will not erase it is warned of, as the refusal is what the caller must hear. */
  async #revokeLease(parts: VaultParts, deviceDB: DeviceDB) {
    const erased = await deviceDB.delLease(parts.scope)
    if (erased.ok) { return }
    parts.logger.warn("Storage could not be trusted with this vault as it was opened, but this device's lease of it could not be revoked: the next time the vault is opened on this device, as at the next page load, it may take it up.", { call: 'untrustedStorage' }, erased.err)
  }

  /** `vault`, the Vault object in `ckey`'s entry, went gone of itself, as `refusal` says: the entry is `refused`, and the next ask births anew. */
  #heardGone(ckey: string, vault: Vault, refusal: VaultError) {
    const entry = this.#entries.get(ckey)
    if (entry?.view.vault !== vault) { return }
    this.#setView(entry, frozenEntry(entry.view.scope, 'refused', null, refusal))
  }

  /** Let `ckey`'s entry go: its Vault object gone, a birth under way refusing 'vault_gone', the entry out of the snapshot. Nothing for an entry the bank does not hold. */
  #letGoOf(ckey: string) {
    const entry = this.#entries.get(ckey)
    if (entry === undefined) { return }
    this.#entries.delete(ckey)
    entry.view.vault?.[letGo]()
    this.#publish()
  }

  /** Replace `entry`'s view with `view`, and publish. */
  #setView(entry: HeldEntry, view: VaultEntry) {
    entry.view = view
    this.#publish()
  }
  // --

  // == [Two forms and bad news]: badOutcome, tellBadNews

  /** The refusal `thrown` makes, as the outcome a public `tryX` resolves: a throw that is no VaultError becomes 'unexpected_error'. */
  #badOutcome(thrown: unknown): BadOutcome {
    return bad(isVaultError(thrown) ? thrown : unexpectedError(thrown))
  }

  /** Hand `news`, a birth's refusal, to the host's `onBadNews` when it is bad news, never awaited: what it throws is logged and reported, as a Vault object's handler throw is. */
  #tellBadNews(news: VaultError) {
    const { onBadNews, logger } = this.#parts
    if (onBadNews === null || news.family !== 'bad_news') { return }
    const threw = (err: unknown) => {
      logger.error("The onBadNews handler threw as it was told of bad news: the birth that met the news refused as it would have.", { call: 'onBadNews' }, err instanceof Error ? err : undefined)
      reportToPlatform(err)
    }
    // Any answer is heard out, a thenable among them: none is awaited.
    void (async () => {
      try {
        await onBadNews(news)
      } catch (err) {
        threw(err)
      }
    })()
  }
  // --
}

// == [Helpers]: frozenEntry, checkSameStores, draftOf, goneError, behindError, otherStoresError

/** An entry's view, frozen. */
const frozenEntry = (scope: VaultScope, status: EntryStatus, vault: Vault | null, err: VaultError | null): VaultEntry => Object.freeze({ scope, status, vault, err })

/** Refuse 'bad_option' unless `parts` names the stores `held` was born from, the same objects: one scope lives in one place, and a vault read from one store and written to another is no vault at all.
 * Stores are compared by identity, never by what they reach: a vaultDB made afresh for each call
 * is another store, even over the same backend.
 */
const checkSameStores = (held: HeldEntry, parts: VaultParts) => {
  if (parts.vaultDB !== held.vaultDB || parts.deviceDB !== held.deviceDB) { throw otherStoresError() }
}

/** The gateless vault props a birth hands `VaultDB.ensureVault`: stored only where no vault stands, as a new life with a fresh `vault_tok`. */
const draftOf = (scope: VaultScope, now: number): GatelessVaultProps => ({
  format: 'safebyok-vault-v6', ...scope, vault_tok: randomId(), vault_epoch: 0, registered_at: now, gate_epoch: 0, passphrase: null, passkey: null,
})

const goneError = () => new VaultError('vault_gone', 'The app let this vault go while it was being opened, so no Vault object was handed out. Ask the bank for the vault again (bank.ensureVault).')

const otherStoresError = () => new VaultError('bad_option', "The bank already holds this vault, born from other stores than this draft names (its vaultDB or deviceDB, or the bank's own where the draft leaves one out): one vault lives in one place. Stores are compared as objects, so the draft must name the same vaultDB object and deviceDB object the vault was opened with, not new ones made over the same storage: make each store once and pass it every time. To open the vault from other stores, let it go first (bank.reopenVault).")

const behindError = () => new VaultError('vault_behind', "This device has already seen a newer copy of this vault than storage offers now, so it won't open this one: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask for the vault again; otherwise the app's support should look at its storage.")
// --
