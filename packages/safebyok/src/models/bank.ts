import { noop } from 'es-toolkit'
import { verifyConsistent } from '../checks/validator'
import { FarFuture, FarPast, MinuteMillis } from '../consts'
import { randomId } from '../crypto'
import { type KeyDeriver, isTestDeriver } from '../deriver/basederiver'
import { VaultError, isVaultError } from '../errors'
import { tattoo } from '../helpers'
import { DefaultLogger, type VaultLogger } from '../logger'
import { type Outcome, outcomeOf, valOf } from '../outcome'
import * as Phrases from '../phrases'
import { reportToPlatform } from '../report-error'
import { type Clock, wallClock } from '../shapes/bank-opts'
import { type BankScope, type VaultBag, type VaultScope, bankScope, vaultBag } from '../shapes/scopes'
import type { DeviceDB } from '../storage/device-db-new'
import type { LeaseSparse } from '../storage/device-db-shapes'
import type { VaultDB } from '../storage/vault-db-new'
import type { RequestCleartext } from './gating'
import type { LockState, StrengthChecker } from './models-shapes'
import * as MSX from './models-shapes'
import { DefaultLeaseMillis, type Vault, type VaultSnapshot } from './vault'
import { type VaultWorld, VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultRefreshMillis, BankOpts, BankStage, BankSnapshot, RefusingStrengthChecker

export const DefaultRefreshMillis = 5 * MinuteMillis

export type BankOpts = {
  applabel:             string
  user_id:              string
  device_id?:           string | undefined
  vaultDB:              VaultDB
  deviceDB:             DeviceDB
  keyDeriver:           KeyDeriver
  requestCleartext?:    RequestCleartext | undefined
  strengthChecker?:     StrengthChecker | undefined
  clock?:               Clock | undefined
  logger?:              VaultLogger | undefined
  autolockMinutes?:     number | undefined
  vaultRefreshMinutes?: number | undefined
  boxRefreshMinutes?:   number | undefined
  onBadNews?:           ((news: VaultError) => unknown) | undefined
  /** Hears a refused erase of a cached lease, and no secret material; without it, the refusal goes to the platform and the vault is vacated. */
  onPanic?:             ((refusal: VaultError) => unknown) | undefined
}

/** `made` until a `hello` answers, and again past a sweep; `ready` once one lands; `refused` once one refuses, the snapshot's `err` saying why. */
export type BankStage = 'made' | 'ready' | 'refused'

export type BankSnapshot = BankScope & Readonly<{ stage: BankStage, err: VaultError | null, device_id: string, vaults: readonly VaultSnapshot[] }>

const RefusingStrengthChecker: StrengthChecker = () => ({ strong: false, reason: Phrases.NoStrengthChecker })
// --

// == [Bank]

export class Bank implements VaultWorld {
  declare readonly applabel: string
  declare readonly user_id:  string
  readonly scope:            BankScope
  readonly clock:            Clock
  readonly keyDeriver:       KeyDeriver
  readonly deviceDB:         DeviceDB
  readonly logger:           VaultLogger
  readonly requestCleartext: RequestCleartext | undefined
  readonly strengthChecker:  StrengthChecker
  readonly leaseMillis:      number
  readonly onPanic:          ((refusal: VaultError) => unknown) | undefined
  readonly boxRefreshMillis: number

  readonly #makeListing: () => VaultListing
  readonly #onBadNews:   ((news: VaultError) => unknown) | undefined
  readonly #listeners = new Set<() => void>()
  #vaultListing:         VaultListing
  #device_id:            string
  /** The outcome of the last `hello`, null with none since the bank was made or swept. */
  #lastHello:            Outcome<void> | null = null
  #snapshot:             BankSnapshot

  static make(opts: BankOpts): Bank { return new Bank(opts) }

  constructor(opts: BankOpts) {
    checkSecureContext()
    MSX.bankOpts.parse(opts)
    const { applabel, user_id, device_id = randomId(), vaultDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = RefusingStrengthChecker, clock = wallClock, logger = DefaultLogger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews, onPanic } = opts
    this.scope = bankScope.parse({ applabel, user_id })
    tattoo(this, this.scope, { writable: false })
    this.#device_id = device_id
    this.clock = clock
    this.keyDeriver = keyDeriver
    this.deviceDB = deviceDB
    this.onPanic = onPanic
    this.logger = logger
    this.requestCleartext = requestCleartext
    this.strengthChecker = strengthChecker
    this.leaseMillis = millisOf(autolockMinutes, DefaultLeaseMillis)
    this.boxRefreshMillis = millisOf(boxRefreshMinutes, DefaultRefreshMillis)
    this.#onBadNews = onBadNews
    const maxMillisSinceRefresh = millisOf(vaultRefreshMinutes, DefaultRefreshMillis)
    this.#makeListing = () => {
      const listing = new VaultListing({ world: this, vaultDB, maxMillisSinceRefresh, onBadNews: this.#hearBadNews })
      listing.subscribe(this.#remakeSnapshot)
      return listing
    }
    this.#vaultListing = this.#makeListing()
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  /** The first `device_id` cached for this bank on this device, once a `hello` has cached it. */
  get device_id(): string { return this.#device_id }

  get vaultListing(): VaultListing { return this.#vaultListing }

  // == [The world of its vaults]: lockState, ensureTimely, takeWorld, autolockMinutes

  lockState(): LockState { return 'unlocked' }

  ensureTimely(): Promise<void> { return Promise.resolve() }

  takeWorld(): void { noop() }

  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }
  // --

  // == [Starting]: hello, tryHello, bringUp, cacheDeviceRecord, demandReady

  /** A forced reset, and a host may call it again: every vault and tombstone the vaultDB holds is listed, the device record cached, and the watch started. Old leases are tidied whatever it answers. Refused, it leaves the bank not ready, and its refusal is what `ensureVault` and `vaultOf` throw. */
  async hello(): Promise<void> {
    this.#lastHello = await outcomeOf(() => this.#bringUp(this.#vaultListing))
    this.#remakeSnapshot()
    valOf(this.#lastHello)
  }

  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  /** A sweep crossing it leaves `listing` disabled, which refuses: the `hello` is for a listing no longer the bank's. */
  async #bringUp(listing: VaultListing): Promise<void> {
    await this.tidy()
    await this.keyDeriver.load?.()
    await this.strengthChecker.load?.()
    await listing.fetchBank()
    await this.#cacheDeviceRecord()
    await listing.hello()
    listing.demandEnabled()
  }

  /** The first `device_id` cached for this scope wins, and is the bank's. A damaged record written over is bad news. */
  async #cacheDeviceRecord(): Promise<void> {
    const { act, record } = await this.deviceDB.cacheDeviceRecord({ ...this.scope, device_id: this.#device_id })
    this.#device_id = record.device_id
    if (act === 'rewrote') { this.#vaultListing.tellBadNews([deviceRecordRewritten()]) }
  }

  #demandReady(): void {
    if (this.#lastHello === null) { throw helloFirst() }
    valOf(this.#lastHello)
  }
  // --

  // == [Ending]: tidy, lock, vacate, sweep, panic

  /** Erase each lease of this bank cached on this device past its autolock duration, locking its listed vault. Never throws, and needs no `hello`: a refused scan is bad news, and a lease that will not erase panics. Another bank's leases stay. */
  async tidy(): Promise<void> {
    const cutoff = Math.floor(this.clock.now() - this.leaseMillis)
    await this.#vacateLeasesProvedBefore(Math.max(FarPast, cutoff))
  }

  /** Every listed vault locked; the bank stays ready. Never throws. */
  lock(): this {
    this.#vaultListing.lock()
    return this
  }

  /** Every listed vault vacated, and every lease of this bank cached on this device erased, the vaultDB untouched. The bank stays ready. Never throws. */
  vacate(): this {
    for (const vault of this.#vaultListing.things) { vault.vacate() }
    void this.#vacateLeasesProvedBefore(FarFuture)
    return this
  }

  /** Cleanup while the page lives: the watch ended and each vault swept, its cached lease left for the next session. Not ready until the next `hello`, which starts a fresh listing. Never throws. */
  sweep(): this {
    this.#vaultListing.sweep()
    this.#vaultListing = this.#makeListing()
    this.#lastHello = null
    this.#remakeSnapshot()
    return this
  }

  async #vacateLeasesProvedBefore(cutoff: number): Promise<void> {
    const scan = await this.deviceDB.tryLeasesProvedBefore(cutoff)
    if (! scan.ok) {
      this.#vaultListing.tellBadNews([scan.err])
      return
    }
    const ownRows = scan.val.filter((row) => this.#isOwnLease(row))
    await Promise.all(ownRows.map((row) => this.#vacateLease(row)))
  }

  #isOwnLease({ applabel, user_id }: LeaseSparse): boolean { return (applabel === this.applabel) && (user_id === this.user_id) }

  /** The listed vault of that life locks, which erases the row or panics; a row with no such vault is erased here. */
  async #vacateLease(row: LeaseSparse): Promise<void> {
    const listed = this.#vaultListing.at(row)
    if (listed?.vault_tok === row.vault_tok) {
      listed.lock()
      return
    }
    const vacated = await this.deviceDB.tryVacate(row)
    if (! vacated.ok) { await this.#panic(vacated.err) }
  }

  /** A cached lease that survived its erase, as a vault's own panic tells it, with no vault to vacate. */
  async #panic(refusal: VaultError): Promise<void> {
    if (this.onPanic === undefined) {
      reportToPlatform(refusal)
      return
    }
    try {
      await this.onPanic(refusal)
    } catch (err) {
      reportToPlatform(err)
    }
  }
  // --

  // == [Vaults]: vaultScopeOf, vaultOf, ensureVault, tryEnsureVault

  vaultScopeOf(bag: VaultBag): VaultScope {
    const { vaultlabel } = verifyConsistent(vaultBag.parse(bag), this.scope, { kind: 'bad_scope', message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }

  /** The vault listed for `bag`, a tombstone among them, or null. Refuses before ready. */
  vaultOf(bag: VaultBag): Vault | null {
    this.#demandReady()
    return this.#vaultListing.at(this.vaultScopeOf(bag))
  }

  /** The vault listed for `bag`, nobody asked, locked unless the host unlocks it; else one built by asking the user through a build_vault gating, or another's that won the slot, locked. Refuses before ready, and 'already_asking' while a gating is open. */
  async ensureVault(bag: VaultBag): Promise<Vault> {
    const scope = this.vaultScopeOf(bag)
    this.#demandReady()
    const listed = this.#vaultListing.at(scope)
    return (listed?.isPresent === true) ? listed : this.#vaultListing.buildVault(scope)
  }

  tryEnsureVault(bag: VaultBag): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(bag)) }
  // --

  // == [Bad news]: hearBadNews

  /** Every news goes to the host's `onBadNews`, else the logger; 'identity_revoked' vacates the bank first. */
  readonly #hearBadNews = (news: VaultError): unknown => {
    if (isVaultError(news, 'identity_revoked')) { this.vacate() }
    if (this.#onBadNews !== undefined) { return this.#onBadNews(news) }
    this.logger.warn(news.message, { call: 'Bank.onBadNews', refusalkind: news.refusalkind })
    return undefined
  }
  // --

  // == [Snapshot and subscription]: snapshot, getSnapshot, subscribe, toJSON, makeSnapshot, remakeSnapshot

  get snapshot(): BankSnapshot { return this.#snapshot }

  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }
  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(MSX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }

  toJSON(): BankSnapshot { return this.#snapshot }

  #makeSnapshot(): BankSnapshot {
    const hello = this.#lastHello
    return Object.freeze({ ...this.scope, stage: stageOf(hello), err: hello?.err ?? null, device_id: this.#device_id, vaults: this.#vaultListing.snapshot })
  }

  /** Make the snapshot again, and tell every listener where it differs. Bound, as each listing calls it. */
  readonly #remakeSnapshot = (): void => {
    const next = this.#makeSnapshot()
    const prior = this.#snapshot
    if ((next.stage === prior.stage) && (next.err === prior.err) && (next.device_id === prior.device_id) && (next.vaults === prior.vaults)) { return }
    this.#snapshot = next
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (err) {
        reportToPlatform(err)
      }
    }
  }
  // --
}
// --

// == [Helpers]: millisOf, stageOf, checkSecureContext

const millisOf = (minutes: number | undefined, fallback: number): number => (minutes === undefined ? fallback : minutes * MinuteMillis)

const stageOf = (hello: Outcome<void> | null): BankStage => {
  if (hello === null) { return 'made' }
  return hello.ok ? 'ready' : 'refused'
}

const checkSecureContext = (): void => {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) { throw insecureContext() }
}
// --

// == [Refusals]: insecureContext, helloFirst, deviceRecordRewritten

const insecureContext = (): VaultError => new VaultError('insecure_context', Phrases.InsecureContext)

const helloFirst = (): VaultError => new VaultError('bad_option', Phrases.BankHelloFirst)

const deviceRecordRewritten = (): VaultError => new VaultError('damaged_record', Phrases.DeviceRecordRewritten)
// --
