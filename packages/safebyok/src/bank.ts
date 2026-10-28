import { type BankBag, type BankScope, type VaultBag, type VaultScope, bankBag, vaultBag } from './shapes/scopes'
import type { Lifecycled, Refused } from './types/type-aliases'
import { VaultFormat, type VaultDraft } from './shapes/vault'
import { VaultError, isVaultError } from './errors'
import { type Outcome, good, outcomeOf, valOf } from './outcome'
import { randomId } from './crypto'
import * as Scopepath from './scopepath'
import * as CX from './shapes/scopes'
import { verifyConsistent } from './checks/validator'
import * as RefusalPolicy from './refusal-policy'
import * as Refusals from './refusals'
import { type DeviceDB, deviceRecordOf } from './device-db'
import { loadStrengthChecker } from './passphrase-strength'
import { loadKeyDeriver } from './key-deriver-spec'
import { reportToPlatform } from './report-error'
import type { BankVaultOpts, MakeBankOpts } from './shapes/bank-opts'
import { type ParsedBankOpts, type VaultParts, parseMakeBankOpts, vaultPartsOf } from './vault-opts'
import { Vault, bear, goneBy, letGo } from './vault'
import { KeptLease } from './lease'
import { delDamagedVaultIn } from './del-damaged-vault'
import { nextMicrotask } from './helpers'
import { type VaultDB, callback } from './vault-db'
import { byCodeUnit } from './text'
import { asError } from './logger'

// == [Public types]: BankVault, BankSnapshot

/** One vault in the bank's listing, frozen, and the same object until it changes: the vault's scope, flat, and its birth's `lifecycle`.
 * `starting` while its birth reads storage; `ready` once the bank holds its Vault object, which
 * {@link Bank.vaultOf} hands out; `refused` with why, in `err`. A vault deleted, or deleted and
 * made anew, or refused as 'vault_behind', has no Vault object to hand out: `bank.ensureVault`
 * tries again. It holds no Vault object itself, so a render that holds it holds plain data.
 *
 * @example if (bankVault.lifecycle === 'refused') { showTrouble(bankVault.err) }
 */
export type BankVault = Lifecycled<VaultScope> | Refused<VaultScope>

/** The bank's fields, frozen in one plain object for `useSyncExternalStore`: replaced whole when anything changes, and otherwise the same object.
 * It sits flat on the bank's scope (`applabel`, `user_id`). Its `lifecycle` is the bank's stage:
 *  * `made`: `Bank.make` checked its options, and nothing more.
 *  * `starting`: `bank.hello()` is loading the libraries its vaults share.
 *  * `ready`: they loaded; vaults may be born.
 *  * `refused`: they failed to load; `err` says why, and the next `hello()` tries again.
 *
 * `vaults` lists each vault asked for and not let go, one {@link BankVault} each, sorted by
 * `vaultlabel` (by scopepath, as a bank's vaults share its app and user). It is the same array
 * until one of them changes, and each element the same object until it changes itself. The
 * listing is for showing: look one vault up with {@link Bank.bankVaultOf}, and its Vault object
 * with {@link Bank.vaultOf}.
 *
 * @example const { lifecycle, vaults } = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
 */
export type BankSnapshot = (Lifecycled<BankScope, 'made' | 'starting' | 'ready'> | Refused<BankScope>) & { readonly vaults: readonly BankVault[] }
// --

/** One vault as the bank keeps it: its element of the listing, its Vault object while `ready`, and the birth under way, if any. */
type HeldEntry = {
  view:     BankVault
  vault:    Vault | null
  birth:    Promise<Vault> | null
  /** The stores it was born from: `ensureVault` refuses options naming others for its scope, where `clearCachedVault` and `delDamagedVault` act on the options'. */
  vaultDB:  VaultDB
  deviceDB: DeviceDB
}

/** The load of the libraries a bank's vaults share, as one value: the bank's lifecycle, the load under way while `starting`, and its refusal once `refused`.
 * The snapshot's `lifecycle` and `err` are read from it alone, so they never disagree.
 */
type LibsLoad =
  | { lifecycle: 'made' | 'ready' }
  | { lifecycle: 'starting', loading: Promise<Outcome<void>> }
  | { lifecycle: 'refused', err: VaultError }

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
 * Each call naming a vault takes a bag whose `vaultlabel` names it: `{ vaultlabel: 'main' }`, or a
 * Vault object, its snapshot or a {@link BankVault} as it is, each carrying its own. The vault's own
 * stores, where not the bank's, go in a second bag ({@link BankVaultOpts}). A store put in the
 * first, a name that fails its check, or another app or user than the bank's
 * ({@link Bank.demandConsistentWith}) refuses 'bad_scope', and options amiss 'bad_option', each
 * before storage is touched; any other field the bag carries is left out.
 *
 * A call refuses with what storage beneath it refuses, as it came, unless its doc says otherwise.
 *
 * This device keeps a record of each vault it has seen (its device record): its own id for the
 * vault, and the highest `vault_epoch` it has seen there. A vault storage serves below it is
 * refused 'vault_behind', and no Vault object is born: `bank.clearCachedVault` accepts what
 * storage holds.
 *
 * Every call comes in two forms, as on a Vault object: `tryEnsureVault()` and the rest resolve to
 * an {@link Outcome}; `ensureVault()` and the rest resolve its `val` or throw its `err`.
 * `closeVault()`, `closeVaults()`, `vaultOf()`, `bankVaultOf()`, `demandConsistentWith()`,
 * `subscribe()` and `getSnapshot()` come in one form.
 *
 * @example
 *   const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts() })   // as the user signs in
 *   const vault = await bank.ensureVault({ vaultlabel: 'main' })
 *   vault.snapshot.gate   // null while novel: set a passphrase
 * @example const snapshot = useSyncExternalStore(bank.subscribe, bank.getSnapshot)
 */
export class Bank {
  // == [Bank: fields]: applabel, user_id, scope, lifecycle, vaults, snapshot, getSnapshot, subscribe, vaultOf, bankVaultOf, demandConsistentWith

  /** The app the bank's vaults belong to. */
  get applabel(): string { return this.#scope.applabel }
  /** The signed-in user the bank serves: every vault it births is theirs. */
  get user_id(): string { return this.#scope.user_id }
  /** The bank's scope, frozen: its app and its user, which {@link Bank.demandConsistentWith} holds a bag to. */
  get scope(): BankScope { return this.#scope }
  /** The bank's stage, as its snapshot says: `made`, `starting` while `hello()` loads, `ready`, or `refused` (the snapshot's `err` says why).
   *
   * @example if (bank.lifecycle !== 'ready') { await bank.hello() }
   */
  get lifecycle(): BankSnapshot['lifecycle'] { return this.#snapshot.lifecycle }

  /** The bank's listing, as its snapshot holds it: one {@link BankVault} for each vault asked for and not let go, sorted by `vaultlabel`, frozen, and the same array until one of them changes.
   * It is for showing: look one vault up with {@link Bank.bankVaultOf}. A React component reads it
   * from the snapshot it renders (`useSyncExternalStore(bank.subscribe, bank.getSnapshot)`).
   *
   * @example const refused = bank.vaults.filter((bankVault) => bankVault.lifecycle === 'refused')
   */
  get vaults(): readonly BankVault[] { return this.#snapshot.vaults }

  /** Every field, frozen in one object: what {@link Bank.getSnapshot} returns, for a render. Outside one, read {@link Bank.lifecycle} and {@link Bank.vaults}. */
  get snapshot(): BankSnapshot { return this.#snapshot }

  /** The current {@link BankSnapshot}, as a function bound to its bank, of one identity for the bank's life: the same object until something changes. */
  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  /** Call `listener` after every snapshot change, returning the unsubscribe: a function bound to its bank, of one identity for the bank's life.
   * A listener may call into the bank as it hears: an ask for a vault, as its element of the
   * listing goes `starting`, joins the birth under way.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    callback.parse(listener)
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** The Vault object the bank holds for the vault `bag` names, or null while it holds none: synchronous, and reading nothing.
   * It holds one once the vault's element of the listing is `ready`, and until it is let go or
   * found gone. Null while the birth is under way, once it was refused, and for a vault never asked
   * for or let go: {@link Bank.bankVaultOf} tells them apart, and {@link Bank.ensureVault} asks.
   *
   * @example const vault = bank.vaultOf({ vaultlabel: 'main' })   // null until bank.ensureVault has born it
   */
  vaultOf(bag: VaultBag): Vault | null {
    return this.#entries.get(Scopepath.vault(this.#vaultScopeOf(bag)))?.vault ?? null
  }

  /** The element of the bank's listing for the vault `bag` names, or null for a vault never asked for or let go: synchronous, and reading nothing.
   * It is the one {@link Bank.vaults} holds, looked up by the vault's scope rather than found in the
   * list.
   *
   * @example bank.bankVaultOf({ vaultlabel: 'main' })?.lifecycle   // 'starting' | 'ready' | 'refused', or undefined
   */
  bankVaultOf(bag: VaultBag): BankVault | null {
    return this.#entries.get(Scopepath.vault(this.#vaultScopeOf(bag)))?.view ?? null
  }

  /** Refuse 'bad_scope' unless `thing` is of the bank's scope: an `applabel` or `user_id` it carries must be the bank's, and one that fails its check refuses too.
   * A name it leaves out passes, so `{ vaultlabel: 'main' }` is of every bank's scope, while a
   * Vault object, its snapshot, an element of the bank's listing or a box carries both names, and
   * passes only in a bank of its own app and user. Every call naming a vault holds its bag to this
   * first, before storage is touched. Synchronous, and reading nothing.
   *
   * @example bank.demandConsistentWith(vault)   // returns, for a Vault object this bank handed out
   * @example bank.demandConsistentWith({ user_id: 'u2' })   // throws 'bad_scope' in u1's bank: a bank serves one user
   */
  demandConsistentWith(thing: BankBag): void {
    bankBag.parseConsistent(thing, this.#scope, { message: otherScopeSays })
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
    this.#scope = CX.bankScope.parse(this.#parts)
    this.#snapshot = this.#picture()
  }

  /** Load the libraries the bank's vaults share, once, resolving the bank: it is `ready` once they have loaded.
   * That is the key deriver's `load` and the strength checker's, each that carries one, side by
   * side. A hello while they load shares the load; one after it succeeded resolves at once. One
   * that fails refuses as the load did ('unexpected_error', what it threw the cause; the strength
   * checker's first, where both fail), leaves the bank `refused`, and the next hello loads again.
   * No vault is born until it succeeds: `ensureVault` says hello first.
   *
   * @example await bank.hello()   // bank.lifecycle: 'ready'
   */
  async hello(): Promise<Bank> {
    try {
      valOf(await this.#initialize())
      return this
    } catch (err) { throw refusalOf(err) }
  }

  /** Load the libraries the vaults share, as an {@link Outcome}: the non-throwing form of {@link Bank.hello}. */
  async tryHello(): Promise<Outcome<Bank>> {
    return outcomeOf(() => this.hello())
  }
  // --

  // == [Bank: vaults]: ensureVault, reopenVault, closeVault, closeVaults, clearCachedVault, delDamagedVault

  /** The Vault object for the vault `bag` names, born now from one read of storage, or the one the bank holds: never absent, `novel` until its passphrase is set.
   * It says hello first. A birth reads {@link DeviceDB.getDeviceRecord}, then `VaultDB.ensureVault`
   * beside {@link DeviceDB.tryGetLease}, then raises the record with {@link DeviceDB.raiseDeviceRecord}.
   * `VaultDB.ensureVault` resolves the vault as stored, or stores a new, gateless one in one
   * transaction; past a tombstone, a new life, its counter carried on. A lease of the vault's ways
   * in that has not ended, and ends no later than `leaseHours` from now, is taken up: the vault is
   * born unlocked. Any other is left where it lies. Nothing prompts.
   *
   * An ask while a birth of the same vault is under way gets the same Vault object. The bank holds
   * it until it is let go (`closeVault`, `reopenVault`, `closeVaults`, `clearCachedVault`), deleted,
   * or found deleted or made anew, during its birth or after: then its {@link BankVault} is
   * `refused`, and the next ask births anew.
   *
   * One scope lives in one place: an ask for a vault the bank holds, or is birthing, names in
   * `opts` the stores it was born from (left out, the bank's own). Stores are compared by identity,
   * so make each store once: one made afresh over the same storage refuses 'bad_option'.
   *
   * A vault record it cannot use refuses 'damaged_vault' (`delDamagedVault` clears it) or
   * 'newer_format'; a vault below this device's record, 'vault_behind', as the class says. A birth
   * refused 'identity_revoked' or 'vault_behind' erases this device's lease of the vault. Its
   * BankVault keeps the refusal, and bad news among them is told to `onBadNews`.
   *
   * @example const vault = await bank.ensureVault({ vaultlabel: 'main' })
   * @example const vault = await bank.ensureVault({ vaultlabel: 'work' }, { vaultDB: workVaultDB })   // a vault stored elsewhere
   */
  async ensureVault(bag: VaultBag, opts?: BankVaultOpts): Promise<Vault> {
    try {
      const parts = this.#vaultPartsFor(bag, opts)
      return await this.#ensureEntry(parts)
    } catch (err) { throw refusalOf(err) }
  }

  /** The Vault object for the vault `bag` names, as an {@link Outcome}: the non-throwing form of {@link Bank.ensureVault}. */
  async tryEnsureVault(bag: VaultBag, opts?: BankVaultOpts): Promise<Outcome<Vault>> {
    return outcomeOf(() => this.ensureVault(bag, opts))
  }

  /** Let the vault `bag` names go, and birth it anew: a Vault object of what storage holds now, as {@link Bank.ensureVault} says.
   * The Vault object let go is gone, as {@link Bank.closeVault} says.
   *
   * @example const vault = await bank.reopenVault({ vaultlabel: 'main' })   // after 'vault_gone', say
   */
  async reopenVault(bag: VaultBag, opts?: BankVaultOpts): Promise<Vault> {
    try {
      const parts = this.#vaultPartsFor(bag, opts)
      this.#letGoOf(Scopepath.vault(parts))
      return await this.#ensureEntry(parts)
    } catch (err) { throw refusalOf(err) }
  }

  /** Let the vault go and birth it anew, as an {@link Outcome}: the non-throwing form of {@link Bank.reopenVault}. */
  async tryReopenVault(bag: VaultBag, opts?: BankVaultOpts): Promise<Outcome<Vault>> {
    return outcomeOf(() => this.reopenVault(bag, opts))
  }

  /** Let the vault `bag` names go: its Vault object is gone, every call on it refusing 'vault_gone', and it leaves the bank's listing.
   * Not a lock: nothing stored is erased, and this device's lease stays for the next birth. A
   * pending gating ends, its `lockLanded` settling as at a `lock()`, and each call waiting on it
   * refuses 'vault_gone', as a birth under way does. A vault let go in the task that asked for it
   * has read nothing. Synchronous; a vault the bank does not hold is no refusal.
   *
   * @example bank.closeVault({ vaultlabel: 'main' })
   * @example bank.closeVault(vault)   // the vault a Vault object is of
   */
  closeVault(bag: VaultBag): void {
    this.#letGoOf(Scopepath.vault(this.#vaultScopeOf(bag)))
  }

  /** Let every vault go, as {@link Bank.closeVault} does each. Call it at sign-out, before dropping the bank.
   *
   * @example onSignOut(() => { bank.closeVaults() })
   */
  closeVaults(): void {
    // A Map's iteration carries on past an entry deleted under it.
    for (const vaultScopepath of this.#entries.keys()) { this.#letGoOf(vaultScopepath) }
  }

  /** Forget what this device keeps of the vault `bag` names -- its device record and its lease -- and let the vault go: the way out of 'vault_behind'.
   * Once storage was restored from an older copy on purpose, this has the device accept it: the
   * next {@link Bank.ensureVault} births the vault as storage holds it. It weakens the check for a
   * vault served behind what this device has seen, until the next birth, so call it only on the
   * user's or the host's say.
   *
   * Erases with {@link DeviceDB.tryDelDeviceRecord} and {@link DeviceDB.tryDelLease}, in the `deviceDB` of
   * `opts`, or the bank's own. It touches this device's store alone, as clearing the browser's site
   * data would: no VaultDB verb, and no passphrase. A vault the bank does not list, or storage does
   * not hold, is no refusal: what this device keeps of it is erased all the same.
   *
   * The vault the bank lists for the scope is let go once both are erased, whichever stores it was
   * born from, so the next birth reads neither. A device store that fails refuses
   * 'storage_unavailable' or 'storage_blocked', keeping the vault listed: call again to finish.
   *
   * @example
   *   if (isVaultError(err, 'vault_behind') && supportConfirmedTheRestore()) {
   *     await bank.clearCachedVault({ vaultlabel: 'main' })
   *     await bank.ensureVault({ vaultlabel: 'main' })
   *   }
   */
  async clearCachedVault(bag: VaultBag, opts?: BankVaultOpts): Promise<void> {
    try {
      const scope = this.#vaultScopeOf(bag)
      const parts = vaultPartsOf(this.#parts, scope, opts)
      valOf(await parts.deviceDB.tryDelDeviceRecord(scope))
      valOf(await parts.deviceDB.tryDelLease(scope))
      // Let go once both are erased, so an ask the letting go brings -- a mounted useVault's --
      // reads neither.
      this.#letGoOf(Scopepath.vault(scope))
    } catch (err) { throw refusalOf(err) }
  }

  /** Forget what this device keeps of the vault, as an {@link Outcome}: the non-throwing form of {@link Bank.clearCachedVault}. */
  async tryClearCachedVault(bag: VaultBag, opts?: BankVaultOpts): Promise<Outcome<void>> {
    return outcomeOf(() => this.clearCachedVault(bag, opts))
  }

  /** Delete the vault `bag` names, whose birth was refused 'damaged_vault' -- its vault record, every box, and this device's lease of it -- and let it go: the way out of 'damaged_vault'.
   * It is the `delDamagedVault` function over the stores in `opts` (the bank's own, where it names
   * none), and refuses as it does: 'bad_option' for a vault that reads sound (delete that with
   * `vault.del()`), and 'stale_write' for one made anew elsewhere meanwhile. What the vault held is
   * gone for good, so ask the user first.
   *
   * Storage decides, as `delDamagedVault` says, so it may be asked for a vault the bank does not
   * list: nothing on this device need agree first, and no passphrase is asked. With no vault stored
   * it erases only this device's lease. The vault the bank lists for the scope is let go once
   * storage answers, whichever stores it was born from: on success, so the next
   * {@link Bank.ensureVault} births a new life, `novel`; and on 'stale_write', so the next ask
   * births the vault stored now. Any other refusal keeps it listed.
   *
   * @example
   *   const bankVault = bank.bankVaultOf({ vaultlabel: 'main' })
   *   if (bankVault?.lifecycle === 'refused' && isVaultError(bankVault.err, 'damaged_vault') && confirm('Remove your vault and start over?')) {
   *     await bank.delDamagedVault({ vaultlabel: 'main' })
   *     await bank.ensureVault({ vaultlabel: 'main' })
   *   }
   */
  async delDamagedVault(bag: VaultBag, opts?: BankVaultOpts): Promise<void> {
    try {
      const scope = this.#vaultScopeOf(bag)
      const parts = vaultPartsOf(this.#parts, scope, opts)
      const vaultScopepath = Scopepath.vault(scope)
      try {
        await delDamagedVaultIn(scope, parts.vaultDB, parts.deviceDB)
      } catch (err) {
        // Made anew elsewhere meanwhile: the listed refusal is out of date, so it goes, and the
        // next ask births the vault stored now. The caller still hears why nothing was deleted.
        if (isVaultError(err, 'stale_write')) { this.#letGoOf(vaultScopepath) }
        throw err
      }
      this.#letGoOf(vaultScopepath)
    } catch (err) { throw refusalOf(err) }
  }

  /** Delete a vault refused 'damaged_vault', as an {@link Outcome}: the non-throwing form of {@link Bank.delDamagedVault}. */
  async tryDelDamagedVault(bag: VaultBag, opts?: BankVaultOpts): Promise<Outcome<void>> {
    return outcomeOf(() => this.delDamagedVault(bag, opts))
  }
  // --

  // == [Options and state]: parts, scope, entries, listeners, libs, listing, snapshot, picture, publish, heedListener, relist, vaultScopeOf, vaultPartsFor

  readonly #parts: ParsedBankOpts
  readonly #scope: BankScope
  readonly #entries = new Map<Scopepath.VaultScopepath, HeldEntry>()
  readonly #listeners = new Set<() => void>()
  #libs: LibsLoad = { lifecycle: 'made' }
  /** Each entry's view, sorted by scopepath, frozen: made anew only as an entry changes, so it keeps its identity across a change to the bank's lifecycle. */
  #listing: readonly BankVault[] = Object.freeze([])
  #snapshot: BankSnapshot

  /** The snapshot the private state makes now, frozen, on the listing as it is now. */
  #picture(): BankSnapshot {
    const libs = this.#libs
    const { applabel, user_id } = this.#scope
    if (libs.lifecycle === 'refused') { return Object.freeze({ applabel, user_id, lifecycle: libs.lifecycle, err: libs.err, vaults: this.#listing }) }
    return Object.freeze({ applabel, user_id, lifecycle: libs.lifecycle, vaults: this.#listing })
  }

  /** Publish the snapshot the private state makes now, and tell every listener: the one place the snapshot is swapped. Call it only once something changed. */
  #publish() {
    this.#snapshot = this.#picture()
    this.#listeners.forEach((listener) => { this.#heedListener(listener) })
  }

  /** Call `listener`, a host's, as the snapshot changes: what it throws reaches no call, and is logged as an error and reported to the platform, as a Vault object's listener's is. */
  #heedListener(listener: () => void) {
    try {
      listener()
    } catch (err) {
      this.#parts.logger.error("A listener passed to the bank's subscribe threw as it heard of a snapshot change. The change stands, the call that made it went on as it would have, and every other listener was called; the listener is the host's to mend.", { call: 'subscribe' }, asError(err))
      reportToPlatform(err)
    }
  }

  /** List the entries anew, each its view, and publish. Call it on every change to an entry, so the listing is a new array exactly when an entry changed. */
  #relist() {
    const sorted = [...this.#entries].toSorted(([one], [two]) => byCodeUnit(one, two))
    this.#listing = Object.freeze(sorted.map(([, entry]) => entry.view))
    this.#publish()
  }

  /** The scope of the vault `bag` names, frozen, once it holds only names that pass their checks and is of the bank's scope: 'bad_scope' otherwise, the comparison {@link Bank.demandConsistentWith} makes. */
  #vaultScopeOf(bag: VaultBag): VaultScope {
    const { vaultlabel } = verifyConsistent(parseVaultBag(bag), this.#scope, { kind: 'bad_scope', message: otherScopeSays })
    return Object.freeze({ applabel: this.#scope.applabel, user_id: this.#scope.user_id, vaultlabel })
  }

  /** The parts the vault `bag` names is born from: its scope, as `#vaultScopeOf` checks it, and `opts` over the bank's own stores and limits. */
  #vaultPartsFor(bag: VaultBag, opts: BankVaultOpts | undefined): VaultParts {
    return vaultPartsOf(this.#parts, this.#vaultScopeOf(bag), opts)
  }

  // --

  // == [Starting]: initialize, loadThenSettle, setLibs

  /** Load the libraries the bank's vaults share, unless loaded, publishing `starting`, then `ready` or `refused`; resolve how it went.
   * A call while one runs shares it. A call after one failed begins anew: its `starting` replaces
   * the `refused` lifecycle and its `err`, and the new load's end replaces `starting` in turn. A
   * load that succeeded is never run again, so a `ready` bank stays so.
   */
  #initialize(): Promise<Outcome<void>> {
    const libs = this.#libs
    if (libs.lifecycle === 'ready') { return Promise.resolve(good(undefined)) }
    if (libs.lifecycle === 'starting') { return libs.loading }
    const loading = this.#loadThenSettle()
    // Published once the load is held, so a listener saying hello as it hears shares it.
    this.#setLibs({ lifecycle: 'starting', loading })
    return loading
  }

  /** `#initialize`'s load: the libraries loaded, then the bank moved to `ready` or `refused` and published, resolving how the load went. */
  async #loadThenSettle(): Promise<Outcome<void>> {
    const loaded = await loadLibs(this.#parts)
    this.#setLibs(loaded.ok ? { lifecycle: 'ready' } : { lifecycle: 'refused', err: loaded.err })
    return loaded
  }

  /** Move the libraries' load to `libs`, and publish. */
  #setLibs(libs: LibsLoad) {
    this.#libs = libs
    this.#publish()
  }
  // --

  // == [Birth]: ensureEntry, bearEntry, settleBirth, bear, bearFrom, demandHeld, revokeLease, heardGone, letGoOf, setView

  /** The Vault object for `parts`' scope: the one held, the birth under way, or a birth begun now. A held one is handed out only to `parts` naming its stores: 'bad_option' otherwise. */
  #ensureEntry(parts: VaultParts): Promise<Vault> {
    const vaultScopepath = Scopepath.vault(parts)
    const held = this.#entries.get(vaultScopepath)
    if (held?.birth !== null && held?.birth !== undefined) {
      checkSameStores(held, parts)
      return held.birth
    }
    if (held?.vault !== null && held?.vault !== undefined) {
      checkSameStores(held, parts)
      return Promise.resolve(held.vault)
    }
    return this.#bearEntry(vaultScopepath, parts)
  }

  /** Birth the Vault object for `parts`' scope into its entry, `starting` until it settles: `ready` holding it, or `refused`. */
  #bearEntry(vaultScopepath: Scopepath.VaultScopepath, parts: VaultParts): Promise<Vault> {
    const entry: HeldEntry = { view: frozenBankVault(parts, 'starting'), vault: null, birth: null, vaultDB: parts.vaultDB, deviceDB: parts.deviceDB }
    this.#entries.set(vaultScopepath, entry)
    entry.birth = this.#settleBirth(vaultScopepath, entry, parts)
    this.#relist()
    return entry.birth
  }

  /** Birth `entry`'s Vault object and settle the entry: `ready` holding it, `refused` with why, or, for an entry let go meanwhile, the Vault object let go too and the caller refused 'vault_gone'.
   * A Vault object already gone of itself -- its watch found the vault deleted or made anew in the
   * microtasks since it was born -- is never handed out: the entry is `refused` as it would have
   * been a moment later, and the next ask births anew.
   */
  async #settleBirth(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry, parts: VaultParts): Promise<Vault> {
    // Begun a microtask on, so the birth is held before anything is published -- the entry's
    // 'starting', or the bank's as the birth says hello: a listener asking for the vault as it
    // hears either joins this birth, rather than beginning another from inside this one.
    await nextMicrotask()
    // Let go in the task that asked for it -- a React StrictMode rehearsal, say: nothing is read.
    this.#demandHeld(vaultScopepath, entry)
    const born = await outcomeOf(() => this.#bear(vaultScopepath, entry, parts))
    // Let go while it was born: the Vault object goes with it, and the caller hears so.
    if (this.#entries.get(vaultScopepath) !== entry) {
      if (born.ok) { born.val[letGo]() }
      throw goneError()
    }
    entry.birth = null
    if (born.ok) {
      const gone = born.val[goneBy]
      if (gone !== null) {
        this.#setView(entry, refusedBankVault(parts, gone), null)
        throw gone
      }
      this.#setView(entry, frozenBankVault(parts, 'ready'), born.val)
      // The view tells the listeners, which may let the vault go: a Vault object let go is never handed out.
      this.#demandHeld(vaultScopepath, entry)
      return born.val
    }
    this.#setView(entry, refusedBankVault(parts, born.err), null)
    this.#tellBadNews(born.err)
    throw born.err
  }

  /** One birth of `entry`: the libraries loaded, one read of storage and this device's store, the judgment, the device record raised, and the Vault object born of it all.
   * A birth refused for storage this device cannot trust ('identity_revoked', 'vault_behind': the
   * refusal policy's `lock`) revokes this device's lease of the scope, as a lock does, so the next
   * birth asks for cleartext. After each wait it demands the entry is still held, so an entry let go
   * meanwhile writes nothing more and is born no Vault object: 'vault_gone'.
   */
  async #bear(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry, parts: VaultParts): Promise<Vault> {
    valOf(await this.#initialize())
    this.#demandHeld(vaultScopepath, entry)
    try {
      return await this.#bearFrom(vaultScopepath, entry, parts)
    } catch (err) {
      if (RefusalPolicy.decide(err) === 'lock') { await this.#revokeLease(parts) }
      throw err
    }
  }

  /** `#bear`'s read, judgment and raise, from `parts`' stores.
   * The device record is read first, so a raise another tab's own write made is never held against
   * a read served before that write landed. A record that fails its check reads as none, as
   * {@link DeviceDB.getDeviceRecord} hands it back. Nothing is born below the record: 'vault_behind'.
   */
  async #bearFrom(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry, parts: VaultParts): Promise<Vault> {
    const { deviceDB } = parts
    // Picked out, frozen, for the stores: a host's store is handed the scope, never the parts.
    const scope = CX.vaultScope.parse(parts)
    const refreshedAt = Math.floor(parts.clock.now())
    const recordBefore = await deviceDB.getDeviceRecord(scope)
    this.#demandHeld(vaultScopepath, entry)
    const [ensured, leaseKept] = await Promise.all([parts.vaultDB.tryEnsureVault(draftOf(scope, refreshedAt)), KeptLease.tryGet(deviceDB, scope, { logger: parts.logger, call: 'hello' })])
    this.#demandHeld(vaultScopepath, entry)
    const { boxes, damagedBoxes, ...vaultRecord } = valOf(ensured)
    if (recordBefore !== null && vaultRecord.vault_epoch < recordBefore.highest_vault_epoch) { throw behindError() }
    // Minted at first need: the record keeps the first device_id stored, whichever tab wrote it.
    const raising = deviceRecordOf(scope, recordBefore?.device_id ?? randomId(), vaultRecord.vault_epoch)
    // An answer that fails its check gives way to the record handed over, so no malformed device_id reaches a way in.
    const record = await deviceDB.raiseDeviceRecord(raising) ?? raising
    this.#demandHeld(vaultScopepath, entry)
    const vault: Vault = Vault[bear](parts, { vaultRecord, listing: { boxes, damagedBoxes }, leaseKept: valOf(leaseKept), record, refreshedAt }, (refusal) => { this.#heardGone(vaultScopepath, vault, refusal) })
    return vault
  }

  /** Refuse 'vault_gone' once `entry` is no longer the one the bank holds for `vaultScopepath`: let go, or let go and asked for anew. What a birth asks after each wait. */
  #demandHeld(vaultScopepath: Scopepath.VaultScopepath, entry: HeldEntry) {
    if (this.#entries.get(vaultScopepath) !== entry) { throw goneError() }
  }

  /** Erase this device's lease of `parts`' scope, after a birth refused for storage it cannot trust: a device store that will not erase it is warned of, as the refusal is what the caller must hear. */
  async #revokeLease(parts: VaultParts) {
    const erased = await parts.deviceDB.tryDelLease(CX.vaultScope.parse(parts))
    if (erased.ok) { return }
    parts.logger.warn("Storage could not be trusted with this vault as it was opened, but this device's lease of it could not be revoked: the next time the vault is opened on this device, as at the next page load, it may take it up.", { call: 'untrustedStorage' }, erased.err)
  }

  /** `vault`, the Vault object in `vaultScopepath`'s entry, went gone of itself, as `refusal` says: the entry is `refused`, and the next ask births anew. */
  #heardGone(vaultScopepath: Scopepath.VaultScopepath, vault: Vault, refusal: VaultError) {
    const entry = this.#entries.get(vaultScopepath)
    if (entry?.vault !== vault) { return }
    this.#setView(entry, refusedBankVault(entry.view, refusal), null)
  }

  /** Let `vaultScopepath`'s entry go: its Vault object gone, a birth under way refusing 'vault_gone', the entry out of the snapshot. Nothing for an entry the bank does not hold. */
  #letGoOf(vaultScopepath: Scopepath.VaultScopepath) {
    const entry = this.#entries.get(vaultScopepath)
    if (entry === undefined) { return }
    this.#entries.delete(vaultScopepath)
    entry.vault?.[letGo]()
    this.#relist()
  }

  /** Replace `entry`'s view with `view` and its Vault object with `vault`, and publish. */
  #setView(entry: HeldEntry, view: BankVault, vault: Vault | null) {
    entry.view = view
    entry.vault = vault
    this.#relist()
  }
  // --

  // == [Bad news]: tellBadNews

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

// == [Helpers]: VaultBagAdvice, parseVaultBag, loadLibs, frozenBankVault, refusedBankVault, checkSameStores, draftOf, refusalOf, goneError, behindError, otherStoresError, otherScopeSays

/** The advice a refusal of the bag naming a vault ends with: what that bag takes, and what else names a vault. */
const VaultBagAdvice = "That bag holds the vault's vaultlabel, and the bank's own applabel and user_id if you like: a Vault object, its snapshot or a BankVault will do."

/** `bag` as {@link vaultBag} hands it back, or its refusal, 'bad_scope', saying it was the bag naming the vault and what that bag takes. */
const parseVaultBag = (bag: unknown): VaultBag => vaultBag.parse(bag, { where: 'In the bag naming the vault', advice: VaultBagAdvice })

/** Load what the vaults of a bank of `parts` share, the strength checker and the key deriver, each `load` that one carries, side by side, resolving how it went: good once both have loaded, or the strength checker's refusal, else the key deriver's. */
const loadLibs = async (parts: ParsedBankOpts): Promise<Outcome<void>> => {
  const [checker, deriver] = await Promise.all([
    outcomeOf(() => loadStrengthChecker(parts.strengthChecker)),
    outcomeOf(() => loadKeyDeriver(parts.keyDeriver)),
  ])
  return checker.ok ? deriver : checker
}

/** The vault `scope` names as the bank lists it at `lifecycle`, frozen: its names picked out, so whatever else `scope` carries stays out. */
const frozenBankVault = (scope: VaultScope, lifecycle: 'starting' | 'ready'): BankVault => Object.freeze({ ...CX.vaultScope.parse(scope), lifecycle })

/** The vault `scope` names as the bank lists it once refused, `err` saying why, frozen. */
const refusedBankVault = (scope: VaultScope, err: VaultError): BankVault => Object.freeze({ ...CX.vaultScope.parse(scope), lifecycle: 'refused', err })

/** Refuse 'bad_option' unless `parts` names the stores `held` was born from, the same objects: one scope lives in one place, and a vault read from one store and written to another is no vault at all.
 * Stores are compared by identity, never by what they reach: a vaultDB made afresh for each call
 * is another store, even over the same backend.
 */
const checkSameStores = (held: HeldEntry, parts: VaultParts) => {
  if (parts.vaultDB !== held.vaultDB || parts.deviceDB !== held.deviceDB) { throw otherStoresError() }
}

/** The novel vault record a birth hands `VaultDB.ensureVault`, built from `scope`'s parsed names: stored only where no vault is stored, as a new life with a fresh `vault_tok`. */
const draftOf = (scope: VaultScope, now: number): VaultDraft => {
  const { applabel, user_id, vaultlabel } = scope
  return { format: VaultFormat, applabel, user_id, vaultlabel, vault_tok: randomId(), registered_at: now, vault_epoch: 0, gate_epoch: 0, gate: null }
}

/** The refusal `thrown` makes, for a public call to throw: a VaultError as it came, else 'unexpected_error', the throw its cause. */
const refusalOf = (thrown: unknown): VaultError => (isVaultError(thrown) ? thrown : Refusals.unexpectedError(thrown))

const goneError = () => new VaultError('vault_gone', 'The app let this vault go while it was being opened, so no Vault object was handed out. Ask the bank for the vault again (bank.ensureVault).')

const otherStoresError = () => new VaultError('bad_option', "The bank already holds this vault, born from other stores than these options name (their vaultDB or deviceDB, or the bank's own where they leave one out): one vault lives in one place. Stores are compared as objects, so the options must name the same vaultDB object and deviceDB object the vault was opened with, not new ones made over the same storage: make each store once and pass it every time. To open the vault from other stores, let it go first (bank.reopenVault).")

/** What a bag naming another app or user than the bank's refuses 'bad_scope' saying, naming the fields that differ, never their values. */
const otherScopeSays = (fieldnames: readonly string[]): string => `This names another ${fieldnames.join(' and ')} than the bank's: a bank serves one app and one signed-in user, and every vault it opens is theirs. Name the vault by its vaultlabel alone, or hand in something of this bank's; for another user, make that user's bank as they sign in, and drop this one as its user signs out.`

const behindError = () => new VaultError('vault_behind', "This device has already seen a newer copy of this vault than storage offers now, so it won't open this one: nothing was unlocked or written. Storage restored from a backup, or altered, does this. If the vault's storage was restored from an older copy on purpose, the app can have this device accept it (bank.clearCachedVault) and ask for the vault again; otherwise the app's support should look at its storage.")
// --
