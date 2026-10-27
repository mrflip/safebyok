import type { VaultScope } from './types/types'
import { VaultFormat, type VaultDraft } from './vault-record'
import { VaultError, isVaultError } from './errors'
import { type Outcome, type BadOutcome, bad, good, outcomeOf, unexpectedError, valOf } from './outcome'
import { randomId } from './crypto'
import * as Scopepath from './scopepath'
import * as CX from './checks/core-checks'
import type { BankScope } from './checks/core-checks'
import type * as Z from 'zod'
import { Validator, sayable } from './checks/validator'
import * as Phrases from './phrases'
import * as RefusalPolicy from './refusal-policy'
import { type DeviceDB, deviceRecordFor, deviceRecordOf, deviceTroubleAsConditions } from './device-db'
import { loadStrengthChecker } from './passphrase-strength'
import { loadKeyDeriver } from './key-deriver-spec'
import { reportToPlatform } from './report-error'
import { type BankVaultOpts, type MakeBankOpts, type ParsedBankOpts, type VaultParts, parseMakeBankOpts, vaultPartsOf } from './vault-opts'
import { Vault, bear, goneBy, letGo } from './vault'
import { delDamagedVaultIn } from './del-damaged-vault'
import type { VaultDB } from './vault-db'

// == [Public types]: BankStatus, EntryStatus, VaultEntry, BankSnapshot

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
// --

/** One entry as the bank keeps it: its view, and the birth under way, if any. */
type HeldEntry = {
  view:     VaultEntry
  birth:    Promise<Vault> | null
  /** The stores it was born from: `ensureVault` refuses options naming others for its scope, where `clearCachedVault` and `delDamagedVault` act on the options'. */
  vaultDB:  VaultDB
  deviceDB: DeviceDB
}

/** Where the load of the libraries a bank's vaults share stands, as one value: the bank's status, the load under way while `starting`, and its refusal once `refused`.
 * The snapshot's `status` and `err` are read from it alone, so they never disagree.
 */
type LibsLoad =
  | { status: 'made' | 'timely' }
  | { status: 'starting', loading: Promise<Outcome<void>> }
  | { status: 'refused', err: VaultError }

/** The signed-in user's vaults in one app, one Vault object per vault, and what they share: the key deriver, the strength checker, the logger, the clock, the limits, and the stores each vault lives in unless told otherwise.
 * A bank serves one user. Make it as they sign in, and drop it as they sign out, once
 * `closeVaults()` has let every Vault object it handed out go: a bank that outlives its user is a
 * bug. What is costly to load -- the key deriver, the strength checker -- is made once, before any
 * bank, and handed to each.
 *
 * `Bank.make` checks its options and touches nothing. `bank.hello()` loads the libraries the
 * vaults share, once. `bank.ensureVault({ vaultlabel })` births a vault's Vault object from one
 * read of storage and this device's store, or hands back the one it holds; two asks for one vault
 * at once get one Vault object. A UI renders from `getSnapshot()` and re-renders on `subscribe()`.
 *
 * Each call naming a vault takes a bag whose `vaultlabel` names it. An `applabel` or `user_id` the
 * bag carries must be the bank's ({@link Bank.demandConsistentWith}), and anything else it carries
 * is left out, so a Vault object, its snapshot, an entry's `scope` or a box may be handed in as it
 * is. The vault's own stores, where not the bank's, go in a second bag ({@link BankVaultOpts}).
 *
 * This device keeps a record of each vault it has seen (its device record): its own id for the
 * vault, and the highest `vault_epoch` it has seen there. A vault storage serves below it is
 * refused 'vault_behind', and no Vault object is born: `bank.clearCachedVault` accepts what
 * storage holds.
 *
 * Every call comes in two forms, as on a Vault object: `tryEnsureVault()` and the rest resolve to
 * an {@link Outcome}; `ensureVault()` and the rest resolve its `val` or throw its `err`.
 * `closeVault()`, `closeVaults()`, `entryOf()`, `demandConsistentWith()`, `subscribe()` and
 * `getSnapshot()` come in one form.
 *
 * @example
 *   const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })   // as the user signs in
 *   const vault = await bank.ensureVault({ vaultlabel: 'main' })
 *   vault.snapshot.gate   // null while novel: set a passphrase
 * @example const snapshot = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
 */
export class Bank {
  // == [Bank: fields]: applabel, user_id, scope, status, snapshot, getSnapshot, subscribe, entryOf, demandConsistentWith

  /** The app the bank's vaults belong to. */
  get applabel(): string { return this.#scope.applabel }
  /** The signed-in user the bank serves: every vault it births is theirs. */
  get user_id(): string { return this.#scope.user_id }
  /** The bank's scope, frozen: its app and its user, which {@link Bank.demandConsistentWith} holds a bag to. */
  get scope(): BankScope { return this.#scope }
  /** Where the bank stands: see {@link BankStatus}. */
  get status(): BankStatus { return this.#snapshot.status }
  /** Every field, frozen in one object: what {@link Bank.getSnapshot} returns. */
  get snapshot(): BankSnapshot { return this.#snapshot }

  /** The current {@link BankSnapshot}, as a function bound to its bank, of one identity for the bank's life: the same object until something changes. */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  /** Call `listener` after every snapshot change, returning the unsubscribe: a function bound to its bank, of one identity for the bank's life.
   * A listener may call into the bank as it hears: an ask for a vault, as its entry goes
   * `starting`, joins the birth under way.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    if (typeof listener !== 'function') { throw new VaultError('bad_option', 'subscribe needs a listener function to call after each snapshot change.') }
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** The entry the snapshot holds for the vault `bag` names, or null for none: synchronous, and reading nothing.
   * Refuses 'bad_scope' for a name that fails its check, or a bag of another app or user than the bank's.
   *
   * @example bank.entryOf({ vaultlabel: 'main' })?.status   // 'starting' | 'timely' | 'refused', or undefined
   */
  entryOf(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>): VaultEntry | null {
    return this.#snapshot.vaults[Scopepath.vault(this.#vaultScopeOf(bag))] ?? null
  }

  /** Refuse 'bad_scope' unless `thing` is of the bank's scope: an `applabel` or `user_id` it carries must be the bank's, and one that fails its check refuses too.
   * A name it leaves out passes, so `{ vaultlabel: 'main' }` is of every bank's scope, while a
   * Vault object, its snapshot, an entry's `scope` or a box carries both names, and passes only in
   * a bank of its own app and user. Every call naming a vault holds its bag to this first, before
   * storage is touched. Synchronous, and reading nothing.
   *
   * @example bank.demandConsistentWith(vault)   // returns, for a Vault object this bank handed out
   * @example bank.demandConsistentWith({ user_id: 'u2' })   // throws 'bad_scope' in u1's bank: a bank serves one user
   */
  demandConsistentWith(thing: Partial<BankScope>): void {
    this.#demandSameScope(bankBag.parse(thing))
  }
  // --

  // == [Bank: opening]: make, hello

  /** Make a bank for the signed-in user of the app: its options checked, and nothing else done. It reads nothing, starts nothing, and is `made`.
   * It throws its misuse at once, synchronously: 'insecure_context' first, for a page that is not a
   * secure context; 'bad_scope' for an `applabel` or `user_id` that fails its check; 'bad_option'
   * for any other option, one it does not take among them (a misspelling, a retired name, or a
   * `vaultlabel`, which each call naming a vault takes), a `vaultDB` or `deviceDB` short of a verb,
   * or limits the `vaultDB` might not honour.
   *
   * @example const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })   // as the user signs in
   * @example Bank.make({ ...opts, vaultlabel: 'main' })   // throws 'bad_option': each call names its vault
   */
  static make(opts: MakeBankOpts): Bank {
    return new Bank(opts)
  }

  /** The bank {@link Bank.make} makes. */
  private constructor(opts: MakeBankOpts) {
    this.#parts = parseMakeBankOpts(opts)
    this.#scope = Object.freeze({ applabel: this.#parts.applabel, user_id: this.#parts.user_id })
    this.#snapshot = this.#picture()
  }

  /** Load the libraries the bank's vaults share, once, resolving the bank: it is `timely` once they have loaded.
   * That is the key deriver's `load` and the strength checker's, each that carries one, side by
   * side. A hello while they load shares the load; one after it succeeded resolves at once. One
   * that fails refuses as the load did ('unexpected_error', what it threw the cause; the strength
   * checker's first, where both fail), leaves the bank `refused`, and the next hello loads again.
   * No vault is born until it succeeds: `ensureVault` says hello first.
   *
   * @example await bank.hello()   // bank.status: 'timely'
   */
  async hello(): Promise<Bank> { return valOf(await this.tryHello()) }

  /** Load the libraries the vaults share, as an {@link Outcome}: the non-throwing form of {@link Bank.hello}. */
  async tryHello(): Promise<Outcome<Bank>> {
    try {
      const started = await this.#initialize()
      return started.ok ? good(this) : started
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Bank: vaults]: ensureVault, reopenVault, closeVault, closeVaults, clearCachedVault, delDamagedVault

  /** The Vault object for the vault `bag` names, born now from one read of storage, or the one the bank holds: never absent, `novel` until its passphrase is set.
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
   * next ask births anew. One scope lives in one place: an ask for a vault the bank holds, or is
   * birthing, names in `opts` the stores it was born from (left out, the bank's own): the same
   * objects, as stores are compared by identity, so make each store once.
   *
   * Refuses 'bad_scope' for a bag of another app or user than the bank's, or a name that fails its
   * check, and 'bad_option' for options amiss -- or a bag carrying a `vaultDB`, a `deviceDB`, or any
   * field named as a store (`vaultDb`), as stores go in `opts` -- each before storage is touched; and 'bad_option' for options naming another
   * `vaultDB` or `deviceDB` object than the vault held was born from, one made afresh over the same
   * storage among them. Refuses as storage refuses: 'damaged_vault' for a vault record it cannot use
   * (`delDamagedVault` clears it), 'newer_format', 'identity_revoked', 'storage_unavailable'.
   * Refuses 'vault_behind' for a vault below this device's record, as the class says. The entry
   * keeps the refusal; bad news among them is told to `onBadNews`.
   *
   * @example const vault = await bank.ensureVault({ vaultlabel: 'main' })
   * @example const vault = await bank.ensureVault({ vaultlabel: 'work' }, { vaultDB: workVaultDB })   // a vault stored elsewhere
   */
  async ensureVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<Vault> { return valOf(await this.tryEnsureVault(bag, opts)) }

  /** The Vault object for the vault `bag` names, as an {@link Outcome}: the non-throwing form of {@link Bank.ensureVault}. */
  async tryEnsureVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<Outcome<Vault>> {
    try {
      const parts = vaultPartsOf(this.#parts, this.#vaultScopeOf(bag), opts)
      return good(await this.#ensureEntry(parts))
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Let the vault `bag` names go, and birth it anew: a Vault object of what storage holds now, as {@link Bank.ensureVault} says.
   * The Vault object let go is gone, as {@link Bank.closeVault} says.
   *
   * @example const vault = await bank.reopenVault({ vaultlabel: 'main' })   // after 'vault_gone', say
   */
  async reopenVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<Vault> { return valOf(await this.tryReopenVault(bag, opts)) }

  /** Let the vault go and birth it anew, as an {@link Outcome}: the non-throwing form of {@link Bank.reopenVault}. */
  async tryReopenVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<Outcome<Vault>> {
    try {
      const parts = vaultPartsOf(this.#parts, this.#vaultScopeOf(bag), opts)
      this.#letGoOf(Scopepath.vault(parts.scope))
      return good(await this.#ensureEntry(parts))
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Let the vault `bag` names go: its Vault object is gone, every call on it refusing 'vault_gone', and its entry leaves the snapshot.
   * Not a lock: nothing stored is erased, and this device's lease stays for the next birth. A
   * prompt up for a proof ends, its `lockLanded` settling as at a `lock()`, and each call waiting
   * on it refuses 'vault_gone', as a birth under way does; one let go in the task that asked for it
   * has read nothing.
   * Synchronous; a vault the bank does not hold is no refusal. Refuses 'bad_scope' for a name that
   * fails its check, or a bag of another app or user than the bank's.
   *
   * @example bank.closeVault({ vaultlabel: 'main' })
   * @example bank.closeVault(vault)   // the vault a Vault object is of
   */
  closeVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>): void {
    this.#letGoOf(Scopepath.vault(this.#vaultScopeOf(bag)))
  }

  /** Let every vault go, as {@link Bank.closeVault} does each: what an app does at sign-out, before it drops the bank.
   *
   * @example onSignOut(() => { bank.closeVaults() })
   */
  closeVaults(): void {
    // A Map's iteration carries on past an entry deleted under it.
    for (const vaultScopepath of this.#entries.keys()) { this.#letGoOf(vaultScopepath) }
  }

  /** Forget what this device keeps of the vault `bag` names -- its device record and its lease -- letting the vault go: the way out of 'vault_behind'.
   * Once storage was restored from an older copy on purpose, this has the device accept it: the
   * next {@link Bank.ensureVault} births the vault as storage holds it. Erases with
   * {@link DeviceDB.delDeviceRecord} and {@link DeviceDB.delLease}, and lets the vault go once both
   * are erased, so the next birth reads neither. It weakens the check for a vault
   * served behind what this device has seen until the next birth, so call it only on the user's
   * or the host's say.
   *
   * It touches this device's store alone, as clearing the browser's site data would: no
   * VaultDB verb, no unlock, no passphrase. A vault the bank holds no entry for, or that storage
   * does not hold, is no refusal: what this device keeps of it, if anything, is erased all the
   * same. The store erased is the `deviceDB` in `opts`, or the bank's own where it names none. The
   * entry let go is the one the bank holds for the scope once both are erased, whichever stores it
   * was born from, and only then: a bag or options amiss refuse 'bad_scope' or 'bad_option', and a
   * device store that fails 'storage_unavailable' or 'storage_blocked', each keeping the entry.
   * Call again to finish.
   *
   * @example
   *   if (isVaultError(err, 'vault_behind') && supportConfirmedTheRestore()) {
   *     await bank.clearCachedVault({ vaultlabel: 'main' })
   *     await bank.ensureVault({ vaultlabel: 'main' })
   *   }
   */
  async clearCachedVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<void> { valOf(await this.tryClearCachedVault(bag, opts)) }

  /** Forget what this device keeps of the vault, as an {@link Outcome}: the non-throwing form of {@link Bank.clearCachedVault}. */
  async tryClearCachedVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<Outcome<void>> {
    try {
      const parts = vaultPartsOf(this.#parts, this.#vaultScopeOf(bag), opts)
      const deviceDB = deviceTroubleAsConditions(parts.deviceDB)
      valOf(await deviceDB.delDeviceRecord(parts.scope))
      valOf(await deviceDB.delLease(parts.scope))
      // Let go once both are erased, so an ask the letting go brings -- a mounted useVault's --
      // reads neither.
      this.#letGoOf(Scopepath.vault(parts.scope))
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }

  /** Delete the vault `bag` names, whose birth was refused 'damaged_vault' -- its vault record, every box, and this device's lease of it -- letting it go: the way out of 'damaged_vault'.
   * It is the `delDamagedVault` function with the stores in `opts` (the bank's own, where it names
   * none), and refuses as it does: 'bad_option' for a vault that reads sound (delete that with
   * `vault.del()`), 'stale_write' for one made anew elsewhere meanwhile, 'storage_unavailable' and
   * the rest. What the vault held is gone for good, so ask the user first.
   *
   * Storage decides, by the checks it alone can make: it deletes only a vault record that fails its
   * checks and still names its `vault_tok`. So it may be asked for a vault the bank holds no
   * entry for: nothing on this device need agree first, and no unlock or passphrase is asked. With
   * no vault stored it erases only this device's lease, and resolves. The entry let go is the one
   * the bank holds for the scope once storage answers, whichever stores it was born from: on
   * success, and the next {@link Bank.ensureVault} births a new life, `novel`; and on
   * 'stale_write', so the next ask births the vault that stands. Any other refusal keeps the entry.
   *
   * @example
   *   if (isVaultError(entry.err, 'damaged_vault') && confirm('Remove your vault and start over?')) {
   *     await bank.delDamagedVault(entry.scope)
   *     await bank.ensureVault(entry.scope)
   *   }
   */
  async delDamagedVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<void> { valOf(await this.tryDelDamagedVault(bag, opts)) }

  /** Delete a vault refused 'damaged_vault', as an {@link Outcome}: the non-throwing form of {@link Bank.delDamagedVault}. */
  async tryDelDamagedVault(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>, opts?: BankVaultOpts): Promise<Outcome<void>> {
    try {
      const parts = vaultPartsOf(this.#parts, this.#vaultScopeOf(bag), opts)
      const vaultScopepath = Scopepath.vault(parts.scope)
      try {
        await delDamagedVaultIn(parts.scope, parts.vaultDB, parts.deviceDB)
      } catch (err) {
        // Made anew elsewhere meanwhile: the entry's refusal is out of date, so it goes, and the
        // next ask births the vault that stands. The caller still hears why nothing was deleted.
        if (isVaultError(err, 'stale_write')) { this.#letGoOf(vaultScopepath) }
        throw err
      }
      this.#letGoOf(vaultScopepath)
      return good(undefined)
    } catch (err) { return this.#badOutcome(err) }
  }
  // --

  // == [Options and state]: parts, scope, entries, listeners, libs, snapshot, picture, publish, vaultScopeOf, demandSameScope

  readonly #parts: ParsedBankOpts
  readonly #scope: BankScope
  readonly #entries = new Map<Scopepath.VaultScopepath, HeldEntry>()
  readonly #listeners = new Set<() => void>()
  #libs: LibsLoad = { status: 'made' }
  #snapshot: BankSnapshot

  /** The snapshot the private state makes now, frozen: each entry's view kept as it is. */
  #picture(): BankSnapshot {
    const vaults = Object.fromEntries([...this.#entries].map(([vaultScopepath, entry]) => [vaultScopepath, entry.view]))
    const libs = this.#libs
    return Object.freeze({ status: libs.status, err: libs.status === 'refused' ? libs.err : null, vaults: Object.freeze(vaults) })
  }

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped. Callers call it only once something changed. */
  #publish() {
    this.#snapshot = this.#picture()
    this.#listeners.forEach((listener) => { listener() })
  }

  /** The scope of the vault `bag` names, frozen, once its names pass their checks and it is of the bank's scope: 'bad_scope' otherwise, and 'bad_option' for a bag carrying a field named as a store, as a vault's stores go in its options. */
  #vaultScopeOf(bag: Pick<VaultScope, 'vaultlabel'> & Partial<BankScope>): VaultScope {
    const { vaultlabel, ...names } = vaultBag.parse(bag)
    checkNoStoresIn(bag)
    this.#demandSameScope(names)
    return Object.freeze({ applabel: this.#scope.applabel, user_id: this.#scope.user_id, vaultlabel })
  }

  /** Refuse 'bad_scope' for `names`, already checked, holding an `applabel` or `user_id` other than the bank's: the one comparison {@link Bank.demandConsistentWith} and every call naming a vault make. */
  #demandSameScope(names: Z.infer<typeof bankBag>) {
    const others = CX.BankScopepathFieldnameVals.filter((fieldname) => names[fieldname] !== undefined && names[fieldname] !== this.#scope[fieldname])
    if (others.length > 0) { throw otherScopeError(others) }
  }
  // --

  // == [Starting]: initialize, loadThenSettle, setLibs

  /** Run the bank's startup, loading the libraries its vaults share, unless it has succeeded, and publish the bank's status as it moves: `starting` while it runs, then `timely` or `refused`. Resolves to how it went: good once the libraries have loaded, now or before; bad with the load's refusal.
   * A call while one runs shares it. A call after one failed begins anew: its `starting` takes the
   * place of the `refused` status and the `err` beside it, which told of a load no longer under
   * way, and the new load's end takes the place of `starting` in turn. A load that succeeded is
   * never run again, so a `timely` bank stays so.
   */
  #initialize(): Promise<Outcome<void>> {
    const libs = this.#libs
    if (libs.status === 'timely') { return Promise.resolve(good(undefined)) }
    if (libs.status === 'starting') { return libs.loading }
    const loading = this.#loadThenSettle()
    // Published once the load is held, so a listener saying hello as it hears shares it.
    this.#setLibs({ status: 'starting', loading })
    return loading
  }

  /** {@link Bank.#initialize}'s load: the libraries loaded, then the bank moved to `timely` or `refused` and published, resolving how the load went. */
  async #loadThenSettle(): Promise<Outcome<void>> {
    const loaded = await loadLibs(this.#parts)
    this.#setLibs(loaded.ok ? { status: 'timely' } : { status: 'refused', err: loaded.err })
    return loaded
  }

  /** Move the libraries' load to `libs`, and publish. */
  #setLibs(libs: LibsLoad) {
    this.#libs = libs
    this.#publish()
  }
  // --

  // == [Birth]: ensureEntry, bearEntry, settleBirth, bear, bearFrom, revokeLease, heardGone, letGoOf, setView

  /** The Vault object for `parts`' scope: the one held, the birth under way, or a birth begun now. A held one is handed out only to `parts` naming its stores: 'bad_option' otherwise. */
  #ensureEntry(parts: VaultParts): Promise<Vault> {
    const vaultScopepath = Scopepath.vault(parts.scope)
    const held = this.#entries.get(vaultScopepath)
    if (held?.birth !== null && held?.birth !== undefined) {
      checkSameStores(held, parts)
      return held.birth
    }
    if (held?.view.status === 'timely' && held.view.vault !== null) {
      checkSameStores(held, parts)
      return Promise.resolve(held.view.vault)
    }
    return this.#bearEntry(vaultScopepath, parts)
  }

  /** Birth the Vault object for `parts`' scope into its entry, `starting` until it settles: `timely` holding it, or `refused`. */
  #bearEntry(vaultScopepath: Scopepath.VaultScopepath, parts: VaultParts): Promise<Vault> {
    const entry: HeldEntry = { view: frozenEntry(parts.scope, 'starting', null, null), birth: null, vaultDB: parts.vaultDB, deviceDB: parts.deviceDB }
    this.#entries.set(vaultScopepath, entry)
    entry.birth = this.#settleBirth(vaultScopepath, entry, parts)
    this.#publish()
    return entry.birth
  }

  /** Birth `entry`'s Vault object and settle the entry: `timely` holding it, `refused` with why, or, for an entry let go meanwhile, the Vault object let go too and the caller refused 'vault_gone'.
   * A Vault object already gone of itself -- its watch found the vault deleted or made anew in the
   * microtasks since it was born -- is never handed out: the entry is `refused` as it would have
   * been a moment later, and the next ask births anew.
   */
  async #settleBirth(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry, parts: VaultParts): Promise<Vault> {
    // Begun a microtask on, so the birth is held before anything is published -- the entry's
    // 'starting', or the bank's as the birth says hello: a listener asking for the vault as it
    // hears either joins this birth, rather than beginning another from inside this one.
    await Promise.resolve()
    // Let go in the task that asked for it -- a React StrictMode rehearsal, say: nothing is read.
    if (this.#entries.get(vaultScopepath) !== entry) { throw goneError() }
    const born = await outcomeOf(() => this.#bear(vaultScopepath, parts), unexpectedError)
    // Let go while it was born: the Vault object goes with it, and the caller hears so.
    if (this.#entries.get(vaultScopepath) !== entry) {
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
  async #bear(vaultScopepath: Scopepath.VaultScopepath, parts: VaultParts): Promise<Vault> {
    valOf(await this.#initialize())
    const deviceDB = deviceTroubleAsConditions(parts.deviceDB)
    try {
      return await this.#bearFrom(vaultScopepath, parts, deviceDB)
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
  async #bearFrom(vaultScopepath: Scopepath.VaultScopepath, parts: VaultParts, deviceDB: DeviceDB): Promise<Vault> {
    const { scope } = parts
    const readAt = Math.floor(parts.clock.now())
    const recordBefore = deviceRecordFor(scope, valOf(await deviceDB.getDeviceRecord(scope)))
    const [ensured, leaseKept] = await Promise.all([parts.vaultDB.ensureVault(draftOf(scope, readAt)), deviceDB.getLease(scope)])
    const { boxes, damagedBoxes, ...vaultRecord } = valOf(ensured)
    if (recordBefore !== null && vaultRecord.vault_epoch < recordBefore.highest_vault_epoch) { throw behindError() }
    // Minted at first need: the record keeps the first device_id stored, whichever tab wrote it.
    const raising = deviceRecordOf(scope, recordBefore?.device_id ?? randomId(), vaultRecord.vault_epoch)
    // An answer that fails its check gives way to the record handed over, so no malformed device_id reaches a way in.
    const record = deviceRecordFor(scope, valOf(await deviceDB.raiseDeviceRecord(raising))) ?? raising
    const vault: Vault = Vault[bear](parts, { vaultRecord, listing: { boxes, damagedBoxes }, leaseKept: valOf(leaseKept), record, readAt }, (refusal) => { this.#heardGone(vaultScopepath, vault, refusal) })
    return vault
  }

  /** Erase this device's lease of `parts`' scope, after a birth refused for storage it cannot trust: a device store that will not erase it is warned of, as the refusal is what the caller must hear. */
  async #revokeLease(parts: VaultParts, deviceDB: DeviceDB) {
    const erased = await deviceDB.delLease(parts.scope)
    if (erased.ok) { return }
    parts.logger.warn("Storage could not be trusted with this vault as it was opened, but this device's lease of it could not be revoked: the next time the vault is opened on this device, as at the next page load, it may take it up.", { call: 'untrustedStorage' }, erased.err)
  }

  /** `vault`, the Vault object in `vaultScopepath`'s entry, went gone of itself, as `refusal` says: the entry is `refused`, and the next ask births anew. */
  #heardGone(vaultScopepath: Scopepath.VaultScopepath, vault: Vault, refusal: VaultError) {
    const entry = this.#entries.get(vaultScopepath)
    if (entry?.view.vault !== vault) { return }
    this.#setView(entry, frozenEntry(entry.view.scope, 'refused', null, refusal))
  }

  /** Let `vaultScopepath`'s entry go: its Vault object gone, a birth under way refusing 'vault_gone', the entry out of the snapshot. Nothing for an entry the bank does not hold. */
  #letGoOf(vaultScopepath: Scopepath.VaultScopepath) {
    const entry = this.#entries.get(vaultScopepath)
    if (entry === undefined) { return }
    this.#entries.delete(vaultScopepath)
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

// == [Helpers]: vaultBag, bankBag, loadLibs, frozenEntry, StoreFieldnamePattern, checkNoStoresIn, checkSameStores, draftOf, goneError, behindError, otherStoresError, otherScopeError

/** What names one of a bank's vaults as its calls are handed it, and what of a bank's scope a thing carries: each name checked, each optional but the `vaultlabel`, and everything else the thing carries left out. Each refuses 'bad_scope'. */
const { vaultBag, bankBag } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => {
  const bankBag = obj({ applabel: applabel.optional(), user_id: user_id.optional() })
  return { bankBag, vaultBag: bankBag.extend({ vaultlabel }) }
})

/** Load what the vaults of a bank of `parts` share, the strength checker and the key deriver, each `load` that one carries, side by side, resolving how it went: good once both have loaded, or the strength checker's refusal, else the key deriver's. */
const loadLibs = async (parts: ParsedBankOpts): Promise<Outcome<void>> => {
  const [checker, deriver] = await Promise.all([
    outcomeOf(() => loadStrengthChecker(parts.strengthChecker), unexpectedError),
    outcomeOf(() => loadKeyDeriver(parts.keyDeriver), unexpectedError),
  ])
  return checker.ok ? deriver : checker
}

/** An entry's view, frozen. */
const frozenEntry = (scope: VaultScope, status: EntryStatus, vault: Vault | null, err: VaultError | null): VaultEntry => Object.freeze({ scope, status, vault, err })

/** A field named as a store is, in any case: `vaultDB`, `vaultDb`, `deviceDB`. */
const StoreFieldnamePattern = /db$/i

/** Refuse 'bad_option' for a bag naming a vault that carries a field named as a store is -- ending `db` in any case, as `vaultDB`, `vaultDb` or `deviceDB` do -- its own or inherited: a vault's own stores go in its options, the second bag, and the bank's own would otherwise be used, quietly.
 * Only names are judged, never values: a Vault object passes, as it may be handed in as the bag.
 */
const checkNoStoresIn = (bag: object) => {
  // A store's own name is caught inherited too, as a getter on a class's prototype is no own key.
  const inherited = [...('vaultDB' in bag ? ['vaultDB'] : []), ...('deviceDB' in bag ? ['deviceDB'] : [])]
  const stores = [...new Set([...Object.keys(bag), ...inherited])].filter((ckey) => StoreFieldnamePattern.test(ckey))
  if (stores.length > 0) { throw new VaultError('bad_option', `${Phrases.storesInBag(stores.map((ckey) => sayable(ckey)))}.`, { meta: { fieldnames: stores.map((ckey) => sayable(ckey)) } }) }
}

/** Refuse 'bad_option' unless `parts` names the stores `held` was born from, the same objects: one scope lives in one place, and a vault read from one store and written to another is no vault at all.
 * Stores are compared by identity, never by what they reach: a vaultDB made afresh for each call
 * is another store, even over the same backend.
 */
const checkSameStores = (held: HeldEntry, parts: VaultParts) => {
  if (parts.vaultDB !== held.vaultDB || parts.deviceDB !== held.deviceDB) { throw otherStoresError() }
}

/** The novel vault record a birth hands `VaultDB.ensureVault`, built from `scope`'s parsed names: stored only where no vault stands, as a new life with a fresh `vault_tok`. */
const draftOf = (scope: VaultScope, now: number): VaultDraft => {
  const { applabel, user_id, vaultlabel } = CX.vaultScope.parse(scope)
  return { format: VaultFormat, applabel, user_id, vaultlabel, vault_tok: randomId(), registered_at: now, vault_epoch: 0, gate_epoch: 0, gate: null }
}

const goneError = () => new VaultError('vault_gone', 'The app let this vault go while it was being opened, so no Vault object was handed out. Ask the bank for the vault again (bank.ensureVault).')

const otherStoresError = () => new VaultError('bad_option', "The bank already holds this vault, born from other stores than these options name (their vaultDB or deviceDB, or the bank's own where they leave one out): one vault lives in one place. Stores are compared as objects, so the options must name the same vaultDB object and deviceDB object the vault was opened with, not new ones made over the same storage: make each store once and pass it every time. To open the vault from other stores, let it go first (bank.reopenVault).")

/** The refusal of a bag naming another app or user than the bank's, naming the fields that differ, never their values. */
const otherScopeError = (fieldnames: readonly string[]) => new VaultError('bad_scope', `This names another ${fieldnames.join(' and ')} than the bank's: a bank serves one app and one signed-in user, and every vault it opens is theirs. Name the vault by its vaultlabel alone, or hand in something of this bank's; for another user, make that user's bank as they sign in, and drop this one as its user signs out.`, { meta: { fieldnames } })

const behindError = () => new VaultError('vault_behind', "This device has already seen a newer copy of this vault than storage offers now, so it won't open this one: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask for the vault again; otherwise the app's support should look at its storage.")
// --
