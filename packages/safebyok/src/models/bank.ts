import { noop } from 'es-toolkit'
import { verifyConsistent } from '../checks/validator'
import { MinuteMillis } from '../consts'
import { randomId } from '../crypto'
import { deviceRecordOf } from '../devicedb/devicedb'
import { type KeyDeriver, checkKeyDeriver, isTestDeriver } from '../deriver/basederiver'
import { VaultError } from '../errors'
import * as RefusalFuncs from '../helpers/refusal-funcs'
import { tattoo } from '../helpers'
import { DefaultLogger, type VaultLogger } from '../logger'
import { type Outcome, outcomeOf, refusalOf } from '../outcome'
import * as Phrases from '../phrases'
import { reportToPlatform } from '../report-error'
import { type Clock, wallClock } from '../shapes/bank-opts'
import { type BankScope, type VaultBag, type VaultScope, bankScope, vaultBag } from '../shapes/scopes'
import type { Lifecycled, Refused } from '../types/type-aliases'
import { Gating, type GatingWorld, type RequestCleartext } from './gating'
import type { BankDeviceDB, Cleartexts, LockState, StrengthChecker } from './models-shapes'
import * as MSX from './models-shapes'
import { spendAnswerAfter } from './proving'
import { DefaultLeaseMillis, DefaultPesterMillis, type Vault, type VaultSnapshot } from './vault'
import { type BoxVaultDB, type VaultStore, type VaultWorld, VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultRefreshMillis, BankVaultDB, BankOpts, BankStage, BankSnapshot, RefusingStrengthChecker

export const DefaultRefreshMillis = 5 * MinuteMillis

/** The vaultDB a bank is made with: the store of its vaults, and of each vault's boxes. A `StoreFront` is one. */
export type BankVaultDB = BoxVaultDB & { vaultStore(scope: BankScope): VaultStore }

/** The options `Bank.make` takes. */
export type BankOpts = {
  applabel:             string
  user_id:              string
  device_id?:           string | undefined
  vaultDB:              BankVaultDB
  deviceDB:             BankDeviceDB
  /** Required, with no default, so a host that brings its own deriver bundles no Argon2id: in a browser, spread `browserOpts()`. */
  keyDeriver:           KeyDeriver
  requestCleartext:     RequestCleartext
  /** Left out, every new passphrase is refused as weak until the host configures one (`notes/configuration.md`). */
  strengthChecker?:     StrengthChecker | undefined
  logger?:              VaultLogger | undefined
  autolockMinutes?:     number | undefined
  pesterMinutes?:       number | undefined
  vaultRefreshMinutes?: number | undefined
  boxRefreshMinutes?:   number | undefined
  onBadNews?:           ((news: VaultError) => unknown) | undefined
}

/** Where the bank stands: `starting` until a hello loads what its vaults share, then `ready`; `refused`, with the failed hello's `err`, until the next hello. */
export type BankStage = Lifecycled<object> | Refused<object>

/** The bank as a host renders it: its scope, its stage and each held vault's snapshot. Frozen, and the same object until one of them changes. */
export type BankSnapshot = BankScope & Readonly<{ device_id: string, vaults: readonly VaultSnapshot[] }> & BankStage

const RefusingStrengthChecker: StrengthChecker = () => ({ strong: false, reason: Phrases.NoStrengthChecker })
// --

// == [Bank]

export class Bank implements VaultWorld, GatingWorld {
  declare readonly applabel: string
  declare readonly user_id:  string
  readonly scope:            BankScope
  readonly clock:            Clock
  readonly keyDeriver:       KeyDeriver
  readonly deviceDB:         BankDeviceDB
  readonly vaultDB:          BankVaultDB
  readonly logger:           VaultLogger
  readonly requestCleartext: RequestCleartext
  readonly strengthChecker:  StrengthChecker
  readonly leaseMillis:      number
  // GAP: no pester trigger reads it yet; the vault offers it as `pesterMinutes`.
  readonly pesterMillis:     number
  readonly boxRefreshMillis: number
  readonly vaultListing:     VaultListing

  #deviceId: string
  #stage:    BankStage = { lifecycle: 'starting' }
  #snapshot: BankSnapshot
  #helloing: Promise<void> | null = null
  /** The `#ensureVault` in flight for each vaultlabel, which a second `ensureVault` joins. */
  readonly #ensuring  = new Map<string, Promise<Vault>>()
  readonly #listeners = new Set<() => void>()

  static make(opts: BankOpts): Bank { return new Bank(opts) }

  /** A bank as {@link Bank.make} makes it; a test hands `_cheat_clock` to stand in for the wall clock. */
  constructor(opts: BankOpts, _cheat_clock?: Clock) {
    checkSecureContext()
    MSX.bankOpts.parse(opts)
    const { applabel, user_id, device_id = randomId(), vaultDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = RefusingStrengthChecker, logger = DefaultLogger, autolockMinutes, pesterMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews } = opts
    this.scope = bankScope.parse({ applabel, user_id })
    checkKeyDeriver(keyDeriver)
    tattoo(this, this.scope, { writable: false })
    this.#deviceId = device_id
    this.clock = MSX.cheatClock.parse(_cheat_clock) ?? wallClock
    this.keyDeriver = keyDeriver
    this.deviceDB = deviceDB
    this.vaultDB = vaultDB
    this.logger = logger
    this.requestCleartext = requestCleartext
    this.strengthChecker = strengthChecker
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.pesterMillis = millisOf(pesterMinutes, DefaultPesterMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    this.vaultListing = new VaultListing({ world: this, store: vaultDB.vaultStore(this.scope), cache: deviceDB.vaultCache(this.scope, (news) => { this.vaultListing.tellBadNews([news]) }), maxMillisSinceRefresh: millisOf(vaultRefreshMinutes, DefaultRefreshMillis), onBadNews })
    this.#snapshot = this.#snapshotNow()
    this.vaultListing.subscribe(() => { this.#remakeSnapshot() })
    if (isTestDeriver(keyDeriver)) { logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  // == [The world of its vaults]: device_id, lockState, ensureTimely, takeWorld, autolockMinutes, pesterMinutes

  /** This device's id for the bank's scope, which each wayin it seals carries: the one the device record holds once a hello has kept it, the `device_id` option (or a fresh one) until then, and where the device record holds none. */
  get device_id(): string { return this.#deviceId }

  lockState(): LockState { return 'unlocked' }

  ensureTimely(): Promise<void> { return Promise.resolve() }

  takeWorld(): void { noop() }

  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  get pesterMinutes(): number { return this.pesterMillis / MinuteMillis }
  // --

  // == [Starting and ending]: hello, goodbye, with hello's try form

  /** Load the key deriver and the strength checker, keep this device's record of the scope and take its `device_id`, then warm the vault listing from the device's cache and start its watch, as {@link VaultListing.hello} does; the bank then reads `ready`.
   * A hello in flight is joined, and a `ready` bank stays `ready` through another.
   * A load that fails refuses with the deriver's or checker's own error, as thrown, and one the deviceDB refuses with its refusal; the bank reads `refused` until the next hello, and {@link tryHello}'s Outcome carries that error.
   */
  hello(): Promise<void> {
    this.#helloing ??= this.#helloOnce()
    return this.#helloing
  }

  /** {@link hello}, as an {@link Outcome}: a load's own error, where not a VaultError, is the `cause` of an 'unexpected_error'. */
  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  /** End the vault listing's watch. */
  goodbye(): void { this.vaultListing.goodbye() }

  async #helloOnce(): Promise<void> {
    try {
      await this.#hello()
    } finally {
      this.#helloing = null
    }
  }

  async #hello(): Promise<void> {
    if (this.#stage.lifecycle === 'refused') { this.#setStage({ lifecycle: 'starting' }) }
    // The catch records the refusal in the snapshot; the error goes on as thrown.
    try {
      await this.keyDeriver.load?.()
      await this.strengthChecker.load?.()
      await this.#keepDeviceRecord()
      await this.vaultListing.hello()
    } catch (err) {
      this.#setStage({ lifecycle: 'refused', err: refusalOf(err) })
      throw err
    }
    if (this.#stage.lifecycle !== 'ready') { this.#setStage({ lifecycle: 'ready' }) }
  }

  /** Advance this device's record of the scope by one holding the bank's `device_id`, and take the `device_id` it holds: a device keeps the first it stored. */
  async #keepDeviceRecord(): Promise<void> {
    const { record } = await this.deviceDB.advanceDeviceRecord(deviceRecordOf(this.scope, this.#deviceId))
    if (record.device_id === this.#deviceId) { return }
    this.#deviceId = record.device_id
    this.#remakeSnapshot()
  }
  // --

  // == [Vaults]: vaultScopeOf, vaultOf, ensureVault, closeVault, closeVaults, clearCachedVault, with ensureVault's and clearCachedVault's try forms

  vaultScopeOf(bag: VaultBag): VaultScope {
    const { vaultlabel } = verifyConsistent(vaultBag.parse(bag), this.scope, { kind: 'bad_scope', message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }

  vaultOf(bag: VaultBag): Vault | null { return this.vaultListing.at(this.vaultScopeOf(bag)) }

  /** The vault `bag` names, as the vaultDB holds it; where it holds none, built and stored as {@link VaultListing.ensure} does, of `cleartexts` where handed, else of what the user answers a 'build_vault' gating.
   * A second call for a vaultlabel that hands no cleartexts, while one is in flight, joins it, so the user is asked once; one that hands its own runs apart.
   * A passkey's answer among `cleartexts` is spent unless refused as correctable (G2).
   */
  ensureVault(bag: VaultBag, cleartexts?: Cleartexts): Promise<Vault> {
    return spendAnswerAfter(cleartexts, () => this.#joinEnsuring(this.vaultScopeOf(bag), cleartexts))
  }

  tryEnsureVault(bag: VaultBag, cleartexts?: Cleartexts): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(bag, cleartexts)) }

  #joinEnsuring(scope: VaultScope, cleartexts?: Cleartexts): Promise<Vault> {
    const inFlight = this.#ensuring.get(scope.vaultlabel)
    if (inFlight !== undefined && cleartexts === undefined) { return inFlight }
    if (inFlight !== undefined) { return this.#ensureVault(scope, cleartexts) }
    const ensuring = this.#ensureVaultOnce(scope, cleartexts)
    this.#ensuring.set(scope.vaultlabel, ensuring)
    return ensuring
  }

  async #ensureVaultOnce(scope: VaultScope, cleartexts?: Cleartexts): Promise<Vault> {
    try {
      return await this.#ensureVault(scope, cleartexts)
    } finally {
      this.#ensuring.delete(scope.vaultlabel)
    }
  }

  async #ensureVault(scope: VaultScope, cleartexts?: Cleartexts): Promise<Vault> {
    const fetched = await this.vaultListing.fetch(scope, { ifAbsent: 'nil' })
    if (fetched !== null) { return fetched }
    if (cleartexts !== undefined) { return this.vaultListing.ensure(scope, cleartexts) }
    return Gating.launch('build_vault', { scope, vault: null, world: this, run: (handed) => this.vaultListing.ensure(scope, handed) })
  }

  /** Lock the vault `bag` names, erasing the lease this device keeps, and evict it, as {@link VaultListing.evict} does: the bank holds it no more, and the next `ensureVault` gets it anew. */
  closeVault(bag: VaultBag): void { this.#closeVault(this.vaultScopeOf(bag)) }

  /** Close every vault the bank holds, as {@link closeVault} does. */
  closeVaults(): void {
    for (const vault of this.vaultListing.things) { this.#closeVault(vault.scope) }
  }

  /** Close the vault `bag` names, as {@link closeVault} does, then erase what this device keeps of it, sound or damaged: its lease and its cached copy. This device's record of the scope stays.
   * Refuses as the deviceDB does where it fails the erase: call again to finish.
   */
  async clearCachedVault(bag: VaultBag): Promise<void> {
    const scope = this.vaultScopeOf(bag)
    this.#closeVault(scope)
    await this.deviceDB.clearCachedVault(scope)
  }

  tryClearCachedVault(bag: VaultBag): Promise<Outcome<void>> { return outcomeOf(() => this.clearCachedVault(bag)) }

  #closeVault(scope: VaultScope): void {
    this.vaultListing.at(scope)?.lock()
    this.vaultListing.evict(scope)
  }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, toJSON

  get snapshot(): BankSnapshot { return this.#snapshot }

  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(MSX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }

  toJSON(): BankSnapshot { return this.#snapshot }

  #setStage(stage: BankStage): void {
    this.#stage = stage
    this.#remakeSnapshot()
  }

  /** Remake the snapshot and tell each listener; one that throws is reported to the platform, and the rest are still called. */
  #remakeSnapshot(): void {
    this.#snapshot = this.#snapshotNow()
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }

  #snapshotNow(): BankSnapshot {
    return Object.freeze({ ...this.scope, device_id: this.device_id, ...this.#stage, vaults: this.vaultListing.snapshot })
  }
  // --
}
// --

// == [Helpers]: millisOf, checkSecureContext

const millisOf = (minutes: number | undefined, fallback: number): number => (minutes === undefined ? fallback : minutes * MinuteMillis)

const checkSecureContext = (): void => {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw RefusalFuncs.insecureContext() }
}
// --
