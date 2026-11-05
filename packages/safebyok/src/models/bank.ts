import { noop } from 'es-toolkit'
import { verifyConsistent } from '../helpers/validator'
import { FarFuture, FarPast, MinuteMillis } from '../helpers/consts'
import { randomId } from '../helpers/crypto'
import { type KeyDeriver, isTestDeriver } from '../deriver/basederiver'
import { VaultError, isVaultError } from '../refusals/errors'
import { tattoo } from '../helpers/helpers'
import { DefaultLogger, type VaultLogger } from '../helpers/logger'
import { type Outcome, outcomeOf, valOf } from '../refusals/outcome'
import * as Phrases from '../helpers/phrases'
import { reportToPlatform } from '../refusals/report-error'
import type { LockState } from '../shapes/shapes-enums'
import { type Clock, wallClock, type BankScope, type VaultBag, type VaultScope, bankScope, vaultBag } from '../shapes/shapes-core'
import type { LeaseSparse } from '../shapes/shapes-storage'
import type { RequestCleartext, StrengthChecker } from '../shapes/shapes-gateish'
import * as VX from '../shapes/shapes-vaultish'
import type { BankOpts, BankSnapshot, BankStage, VaultWorld } from '../shapes/shapes-vaultish'
import type { DeviceDB } from '../storage/device-db-new'
import { deviceRecordRewritten, helloFirst, insecureContext } from '../refusals/throwers'
import { DefaultLeaseMillis, type Vault } from './vault'
import { VaultListing } from './vault-listing'

// == [Given to a bank]: DefaultRefreshMillis, RefusingStrengthChecker

export const DefaultRefreshMillis = 5 * MinuteMillis

const RefusingStrengthChecker: StrengthChecker = () => ({ strong: false, reason: Phrases.NoStrengthChecker })
// --

export class Bank implements VaultWorld {
  // == [Props]: applabel, user_id, scope, clock, keyDeriver, deviceDB, logger, requestCleartext, strengthChecker, leaseMillis, onPanic, boxRefreshMillis, #makeListing, #onBadNews, #listeners, #vaultListing, #device_id, #lastHello, #snapshot, #getSnapshot, #subscribe

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
  /** The outcome of the last `hello`, null with none since the bank was made, swept or vacated. */
  #lastHello:            Outcome<void> | null = null
  #snapshot:             BankSnapshot

  readonly #getSnapshot = (): BankSnapshot => this.#snapshot

  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(VX.listener.parse(listener))
    return () => { this.#listeners.delete(listener) }
  }
  // --

  // == [Getters]: device_id, vaultListing, autolockMinutes, snapshot, getSnapshot, subscribe, toJSON

  /** The first `device_id` cached for this bank on this device, once a `hello` has cached it. */
  get device_id(): string { return this.#device_id }

  get vaultListing(): VaultListing { return this.#vaultListing }

  get autolockMinutes(): number { return this.leaseMillis / MinuteMillis }

  get snapshot(): BankSnapshot { return this.#snapshot }

  get getSnapshot(): () => BankSnapshot { return this.#getSnapshot }

  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  toJSON(): BankSnapshot { return this.#snapshot }
  // --

  // == [Construction]: make, constructor, vaultScopeOf

  static make(opts: BankOpts): Bank { return new Bank(opts) }

  constructor(opts: BankOpts) {
    checkSecureContext()
    VX.bankOpts.parse(opts)
    const { applabel, user_id, device_id = randomId(), vaultDB, deviceDB, keyDeriver, requestCleartext, strengthChecker = RefusingStrengthChecker, clock = wallClock, logger = DefaultLogger, autolockMinutes, vaultRefreshMinutes, boxRefreshMinutes, onBadNews, onPanic } = opts
    this.scope = bankScope.parse({ applabel, user_id })
    tattoo(this, this.scope)
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
      const listing = new VaultListing({ world: this, vaultDB, maxMillisSinceRefresh })
      listing.subscribe(this.#remakeSnapshot)
      return listing
    }
    this.#vaultListing = this.#makeListing()
    this.#snapshot = this.#makeSnapshot()
    if (isTestDeriver(keyDeriver)) { logger.warn(Phrases.TestDeriverNotice, { call: 'Bank.make' }) }
    Object.freeze(this)
  }

  vaultScopeOf(bag: VaultBag): VaultScope {
    const { vaultlabel } = verifyConsistent(vaultBag.parse(bag), this.scope, { kind: 'bad_scope', message: Phrases.otherScope })
    return { ...this.scope, vaultlabel }
  }
  // --

  // == [The world of its vaults]: lockState, ensureTimely, takeWorld

  lockState(): LockState { return 'unlocked' }

  ensureTimely(): Promise<void> { return Promise.resolve() }

  takeWorld(): void { noop() }
  // --

  // == [Starting]: hello, tryHello, bringUp, cacheDeviceRecord

  /** SLOPDOC: Brings the bank up from the vaultDB, and again whenever the host calls it to force a reset. */
  async hello(): Promise<void> {
    const listing = this.#vaultListing
    const hello = await outcomeOf(() => this.#bringUp(listing))
    if (listing === this.#vaultListing) { this.#lastHello = hello }
    this.#remakeSnapshot()
    valOf(hello)
  }

  tryHello(): Promise<Outcome<void>> { return outcomeOf(() => this.hello()) }

  /** A sweep crossing it leaves `listing` disabled, which refuses. */
  async #bringUp(listing: VaultListing): Promise<void> {
    await this.keyDeriver.load?.()
    await this.strengthChecker.load?.()
    await listing.fetchBank()
    await this.#cacheDeviceRecord()
    await listing.hello()
  }

  /** The first `device_id` cached for this scope wins, and is the bank's. A damaged record written over is bad news. */
  async #cacheDeviceRecord(): Promise<void> {
    const { act, record } = await this.deviceDB.cacheDeviceRecord({ ...this.scope, device_id: this.#device_id })
    this.#device_id = record.device_id
    if (act === 'rewrote') { this.tellBadNews([deviceRecordRewritten()]) }
  }
  // --

  // == [Ending]: autolock, lock, vacate, sweep, scanOwnLeasesProvedBefore, eraseOwnLeases, eraseLease, panic

  /** Lock each listed vault with a cached lease past autolock, erasing it. Call it after `hello` and on your own timer.
   * A best-effort reminder, not a guarantee: it finds leases only by row, and `Lease.buildFromCache` leaves such a row for it.
   */
  async autolock(): Promise<void> {
    const cutoff = Math.floor(this.clock.now() - this.leaseMillis)
    const oldRows = await this.#scanOwnLeasesProvedBefore(Math.max(FarPast, cutoff))
    for (const row of oldRows) {
      const listed = this.#vaultListing.at(row)
      if (listed?.vault_tok === row.vault_tok) { listed.lock() }
    }
  }

  /** Every listed vault locked; the bank stays ready. Never throws. */
  lock(): this {
    this.#vaultListing.lock()
    return this
  }

  /** Every listed vault vacated, the open gating declined, a birth's too, and every lease of this bank cached on this device erased, the vaultDB untouched. Not ready until the next `hello`, which lists them afresh. Never throws. */
  vacate(): this {
    this.#lastHello = null
    this.#vaultListing.openGating?.declineAtDiscard()
    for (const vault of this.#vaultListing.things) { vault.vacate() }
    void this.#eraseOwnLeases()
    this.#remakeSnapshot()
    return this
  }

  /** Cleanup while the page lives: the watch ended and each vault swept, its cached lease left for the next session. Not ready until the next `hello`, which starts a fresh listing. Never throws. */
  sweep(): this {
    this.#lastHello = null
    this.#vaultListing.sweep()
    this.#vaultListing = this.#makeListing()
    this.#remakeSnapshot()
    return this
  }

  /** This bank's rows among the cached leases proved before `cutoff`; a refused scan is bad news, and finds none. */
  async #scanOwnLeasesProvedBefore(cutoff: number): Promise<LeaseSparse[]> {
    const scan = await this.deviceDB.tryLeasesProvedBefore(cutoff)
    if (! scan.ok) {
      this.tellBadNews([scan.err])
      return []
    }
    return scan.val.filter((row) => this.#isOwnLease(row))
  }

  /** A vacate's erase of every row of this bank, listed or not, as a fresh page told 'identity_revoked' has listed
   * none.
   */
  async #eraseOwnLeases(): Promise<void> {
    const rows = await this.#scanOwnLeasesProvedBefore(FarFuture)
    await Promise.all(rows.map((row) => this.#eraseLease(row)))
  }

  async #eraseLease(row: LeaseSparse): Promise<void> {
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

  // == [Vaults]: vaultOf, ensureVault, tryEnsureVault

  /** The vault listed for `bag`, a tombstone among them, or null. */
  vaultOf(bag: VaultBag): Vault | null {
    this.#demandReady()
    return this.#vaultListing.at(this.vaultScopeOf(bag))
  }

  /** SLOPDOC: The vault for `bag`, whether already listed or built now by asking the user. */
  async ensureVault(bag: VaultBag): Promise<Vault> {
    const scope = this.vaultScopeOf(bag)
    this.#demandReady()
    const listed = this.#vaultListing.at(scope)
    return (listed?.isPresent === true) ? listed : this.#vaultListing.buildVault(scope)
  }

  tryEnsureVault(bag: VaultBag): Promise<Outcome<Vault>> { return outcomeOf(() => this.ensureVault(bag)) }
  // --

  // == [Bad news]: tellBadNews, hearBadNews

  /** Tell bad news no caller waits on to the host, its every listing and box coming straight here. A handler's failure reaches only the platform. */
  tellBadNews(badnews: readonly VaultError[]): void {
    for (const news of badnews) {
      // Any answer is heard out, a thenable among them: none is awaited.
      void (async () => {
        try {
          await this.#hearBadNews(news)
        } catch (err) {
          reportToPlatform(err)
        }
      })()
    }
  }

  /** Every news goes to the host's `onBadNews`, else the logger; 'identity_revoked' vacates the bank first. */
  #hearBadNews(news: VaultError): unknown {
    if (isVaultError(news, 'identity_revoked')) { this.vacate() }
    if (this.#onBadNews !== undefined) { return this.#onBadNews(news) }
    this.logger.warn(news.message, { call: 'Bank.onBadNews', refusalkind: news.refusalkind })
    return undefined
  }
  // --

  // == [Snapshot]: remakeSnapshot, makeSnapshot

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

  #makeSnapshot(): BankSnapshot {
    const hello = this.#lastHello
    return Object.freeze({ ...this.scope, stage: stageOf(hello), err: hello?.err ?? null, device_id: this.#device_id, vaults: this.#vaultListing.snapshot })
  }
  // --

  // == [Guards]: isOwnLease, demandReady

  #isOwnLease({ applabel, user_id }: LeaseSparse): boolean { return (applabel === this.applabel) && (user_id === this.user_id) }

  #demandReady(): void {
    if (this.#lastHello === null) { throw helloFirst() }
    valOf(this.#lastHello)
  }
  // --
}

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
